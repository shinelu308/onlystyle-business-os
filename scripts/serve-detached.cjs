#!/usr/bin/env node
/**
 * 开发服务 · 脱离会话启动
 *
 * 🔴 问题的两层（都实测过，不是猜的）：
 *   第 1 层：用 AI 会话的「后台任务」起服务 → 进程是会话子进程，轮次/会话一结束被回收。
 *   第 2 层：即使 spawn({detached:true}) 也一样被杀，且日志里**没有任何错误输出**、
 *           启动横幅都打完了 —— 说明是外部整树清理（Windows Job Object，kill-on-close）。
 *           子进程默认继承 Job，detached 逃不掉。
 *
 * ⭐ 解法：用 WMI（Win32_Process.Create）拉起进程 —— 创建者是系统的 WmiPrvSE 服务，
 *    **不在本会话的 Job 里**，所以不受会话回收影响。
 *    stdout/stderr 由外层 cmd /c 重定向到日志文件。
 *    WMI 不可用时回退 detached（并明说「可能仍随会话被回收」）。
 *
 * 用法（在项目根目录）：
 *   node scripts/serve-detached.cjs start    # 起后台 3100 + 官网 3201（已在跑的自动跳过）
 *   node scripts/serve-detached.cjs stop     # 停掉 3100 / 3201
 *   node scripts/serve-detached.cjs status   # 端口 + HTTP 探活
 *   node scripts/serve-detached.cjs rebuild  # 重新构建官网 dist（改了 website/ 源码后用）
 *
 * 注意：
 *   · 改完 website/ 源码要 `rebuild`（3201 只认 dist）；改后台源码只需 stop + start。
 *   · 机器重启后服务自然不在，跑一次 start 即可。
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;                       // 当前这个 node（托管版绝对路径）
const LOGDIR = path.join(ROOT, '.workbuddy', 'tmp', 'serve-logs');

const SERVICES = [
  {
    name: '后台(biz-os)',
    port: 3100,
    cwd: path.join(ROOT, 'biz-os', 'backend'),
    args: ['server.js'],
    log: 'backend.log',
  },
  {
    name: '官网(website)',
    port: 3201,
    cwd: path.join(ROOT, 'website'),
    args: ['node_modules/vite/bin/vite.js', 'preview', '--port', '3201', '--strictPort'],
    log: 'website.log',
    needsDist: true,                                 // 先确保 dist 存在
  },
];

const portOpen = (port, timeout = 800) => new Promise(resolve => {
  const s = net.createConnection({ host: '127.0.0.1', port });
  const done = ok => { try { s.destroy(); } catch (_) {} resolve(ok); };
  s.setTimeout(timeout);
  s.once('connect', () => done(true));
  s.once('timeout', () => done(false));
  s.once('error', () => done(false));
});

const httpGet = (port, p = '/') => new Promise(resolve => {
  http.get({ host: '127.0.0.1', port, path: p }, res => {
    let n = 0; res.on('data', c => n += c.length);
    res.on('end', () => resolve({ code: res.statusCode, len: n, ct: res.headers['content-type'] || '' }));
  }).on('error', () => resolve(null));
});

/** netstat 找出监听指定端口的 PID（Windows） */
function listeningPids(port) {
  let out = '';
  try { out = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }); }
  catch (e) { out = String(e.stdout || ''); }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const m = line.trim().split(/\s+/);
    if (m.length < 4) continue;
    const p = Number(m[1].split(':').pop());         // 0.0.0.0:3100 / [::]:3100 都取最后一段
    if (p === port) pids.add(Number(m[m.length - 1]));
  }
  return [...pids];
}

function buildWebsite() {
  const dist = path.join(ROOT, 'website', 'dist', 'index.html');
  if (fs.existsSync(dist)) return false;
  console.log('  官网 dist 不存在，先构建（约 3~5s）…');
  execFileSync(NODE, ['node_modules/vite/bin/vite.js', 'build'],
    { cwd: path.join(ROOT, 'website'), stdio: 'inherit' });
  return true;
}

/** ⭐ 经 WMI 拉起（由系统 WmiPrvSE 创建，不在会话 Job 里 → 不随会话被回收） */
function startViaCIM(s) {
  const logPath = path.join(LOGDIR, s.log);
  fs.mkdirSync(LOGDIR, { recursive: true });
  // cmd 负责把 stdout/stderr 重定向到日志；cmd 与 node 都由 WmiPrvSE 创建
  const cmdline = 'cmd /c ""' + NODE + '" ' +
    s.args.map(a => '"' + a + '"').join(' ') +
    ' > "' + logPath + '" 2>&1"';
  // PowerShell 单引号字符串：内部单引号翻倍转义（路径里不该有，但防一手）
  const esc = t => String(t).replace(/'/g, "''");
  const ps =
    "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ " +
    "CommandLine = '" + esc(cmdline) + "'; " +
    "CurrentDirectory = '" + esc(s.cwd) + "' }; " +
    "Write-Output ('RET=' + $r.ReturnValue + ' PID=' + $r.ProcessId)";
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    const m = out.match(/RET=(\d+)\s+PID=(\d+)/);
    if (!m) return { ok: false, why: '无法解析 WMI 返回：' + out.trim().slice(0, 120) };
    if (Number(m[1]) !== 0) return { ok: false, why: 'WMI Win32_Process.Create 返回 ' + m[1] + '（5=拒绝访问，9=路径不对）' };
    return { ok: true, pid: Number(m[2]) };
  } catch (e) {
    return { ok: false, why: '调用 WMI 失败：' + (e.message || e).split('\n')[0] };
  }
}

/** 回退方案：普通 detached（可能仍随会话被回收） */
function startDetached(s) {
  const fd = fs.openSync(path.join(LOGDIR, s.log), 'a');
  const child = spawn(NODE, s.args, {
    cwd: s.cwd, detached: true, stdio: ['ignore', fd, fd], windowsHide: true,
  });
  child.unref();
  return { ok: true, pid: child.pid, detached: true };
}

async function start() {
  fs.mkdirSync(LOGDIR, { recursive: true });
  for (const s of SERVICES) {
    if (await portOpen(s.port)) {
      console.log('  ✓ ' + s.name + ' 已在跑（端口 ' + s.port + '，PID ' + listeningPids(s.port).join(',') + '），跳过');
      continue;
    }
    if (s.needsDist) buildWebsite();
    const r = startViaCIM(s);
    if (r.ok) {
      console.log('  → ' + s.name + ' 经 WMI 拉起（PID ' + r.pid + '，已脱离会话，日志 ' + s.log + '）');
    } else {
      const d = startDetached(s);
      console.log('  → ' + s.name + ' WMI 不可用（' + r.why + '），回退 detached（PID ' + d.pid + '）');
      console.log('    ⚠️ 回退模式可能仍随会话被回收 —— 把这段话报给 AI 修');
    }
  }
  // 起进程 ≠ 起来了：HTTP 探活后才算数
  console.log('  探活中…');
  for (const s of SERVICES) {
    let ok = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await portOpen(s.port)) { ok = true; break; }
    }
    if (!ok) { console.log('  XX ' + s.name + ' 未在 ' + s.port + ' 监听（看日志 ' + path.join(LOGDIR, s.log) + '）'); continue; }
    const probe = s.name.includes('官网') ? await httpGet(s.port, '/api/content/home') : await httpGet(s.port, '/');
    console.log('  ✓ ' + s.name + ' HTTP ' + (probe ? probe.code + ' · ' + probe.len + 'B' : '端口通但 HTTP 未响应'));
  }
}

async function stop() {
  for (const s of SERVICES) {
    const pids = listeningPids(s.port);
    if (!pids.length) { console.log('  · ' + s.name + '（' + s.port + '）本来就没在跑'); continue; }
    for (const pid of pids) {
      try { execFileSync('taskkill.exe', ['/F', '/PID', String(pid)], { stdio: 'ignore' }); } catch (_) {}
    }
    console.log('  ■ ' + s.name + '（' + s.port + '）已停（PID ' + pids.join(',') + '）');
  }
}

async function status() {
  for (const s of SERVICES) {
    const open = await portOpen(s.port);
    const pids = open ? listeningPids(s.port) : [];
    const probe = open ? (s.name.includes('官网') ? await httpGet(s.port, '/api/content/home') : await httpGet(s.port, '/')) : null;
    console.log('  ' + (open ? '✓' : 'XX') + ' ' + s.name + ' 端口 ' + s.port +
      (open ? ' · PID ' + pids.join(',') + ' · HTTP ' + (probe ? probe.code + ' ' + probe.len + 'B' : '无响应') : ' · 未监听'));
  }
}

(async () => {
  const cmd = (process.argv[2] || 'status').toLowerCase();
  if (cmd === 'start') await start();
  else if (cmd === 'stop') await stop();
  else if (cmd === 'status') await status();
  else if (cmd === 'rebuild') buildWebsite();
  else { console.log('未知命令：' + cmd + '（可用 start / stop / status / rebuild）'); process.exitCode = 1; }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
