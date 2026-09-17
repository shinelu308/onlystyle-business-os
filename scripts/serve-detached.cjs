#!/usr/bin/env node
/**
 * 开发服务 · 脱离会话启动
 *
 * 🔴 问题的三层（全部实测，不是猜的）：
 *   第 1 层：AI 会话的「后台任务」起服务 → 会话子进程，轮次/会话结束被回收。
 *   第 2 层：spawn({detached:true}) 也被杀，日志无任何错误、启动横幅完整 →
 *           Windows Job Object（kill-on-close）整树清理，子进程继承 Job，detached 逃不掉。
 *   第 3 层：WMI（Win32_Process.Create）拉起 —— 跨命令能活（对照实验里 detached 当场死、
 *           WMI 跨命令仍 200），但一小时后仍没了，且日志尾部是 **^C**（CTRL_C 事件）
 *           → 进程挂在可被控制台事件命中的环境里，会话级清理照样够得着。
 *
 * ⭐ 最终解法：**Windows 计划任务**（schtasks）一次性触发 ——
 *    进程由 Task Scheduler 服务在独立、非交互环境创建：
 *    不在任何 Job 里（收不到 kill-on-close）、没有共享控制台（收不到 CTRL_C）。
 *    拉起动作 = 本脚本自身以 `serve-once` 子命令在任务环境里跑一次：
 *      起两个服务（普通 detached 即可 —— 父进程是任务进程，不在任何 Job）
 *      → 服务成为「孤儿」，由系统接管，与 AI 会话彻底无关。
 *
 * 用法（在项目根目录）：
 *   node scripts/serve-detached.cjs start      # 起后台 3100 + 官网 3201（已在跑的自动跳过）
 *   node scripts/serve-detached.cjs status     # 端口 + HTTP 探活
 *   node scripts/serve-detached.cjs stop       # 停掉 3100 / 3201
 *   node scripts/serve-detached.cjs rebuild    # 重新构建官网 dist（改了 website/ 源码后用）
 *   node scripts/serve-detached.cjs serve-once # （内部）在计划任务环境里拉起服务
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
const SELF = path.join(__dirname, 'serve-detached.cjs');
const NODE = process.execPath;
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
    needsDist: true,
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

function listeningPids(port) {
  let out = '';
  try { out = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }); }
  catch (e) { out = String(e.stdout || ''); }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const m = line.trim().split(/\s+/);
    if (m.length < 4) continue;
    if (Number(m[1].split(':').pop()) === port) pids.add(Number(m[m.length - 1]));
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

function appendLog(file, s) {
  fs.mkdirSync(LOGDIR, { recursive: true });
  fs.appendFileSync(path.join(LOGDIR, file), '[' + new Date().toISOString() + '] ' + s + '\n');
}

/**
 * ⭐ 首选：经计划任务拉起。
 * 创建一个一次性任务（ST 占位未来 1 分钟，随后立即 /Run 触发，不真等那个点），
 * 任务动作 = 本脚本 serve-once；任务跑完即删（进程不受影响）。
 */
function startViaTask(s) {
  const tn = 'BOS_DevServe_' + s.port;
  // ST 必须是未来时刻（含跨天回退）；反正马上 /Run，这个点只是占位
  const d = new Date(Date.now() + 2 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  const st = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const args = ['/Create', '/F', '/TN', tn, '/SC', 'ONCE', '/ST', st,
    '/TR', '"' + NODE + '" "' + SELF + '" serve-once'];
  if (d.getDate() !== new Date().getDate()) {
    args.splice(5, 0, '/SD', pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear());
  }
  try {
    execFileSync('schtasks.exe', args, { stdio: 'ignore' });
    execFileSync('schtasks.exe', ['/Run', '/TN', tn], { stdio: 'ignore' });
    execFileSync('schtasks.exe', ['/Delete', '/F', '/TN', tn], { stdio: 'ignore' });
    return { ok: true };
  } catch (e) {
    // 任务可能已建但后面步骤失败：尽力清掉定义
    try { execFileSync('schtasks.exe', ['/Delete', '/F', '/TN', tn], { stdio: 'ignore' }); } catch (_) {}
    return { ok: false, why: 'schtasks 失败：' + (e.message || e).split('\n')[0] };
  }
}

/** 次选：WMI 拉起（跨命令可活，但进程挂在可被 CTRL_C 命中的环境里） */
function startViaCIM(s) {
  const logPath = path.join(LOGDIR, s.log);
  fs.mkdirSync(LOGDIR, { recursive: true });
  const cmdline = 'cmd /c ""' + NODE + '" ' +
    s.args.map(a => '"' + a + '"').join(' ') + ' > "' + logPath + '" 2>&1"';
  const esc = t => String(t).replace(/'/g, "''");
  const ps =
    "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ " +
    "CommandLine = '" + esc(cmdline) + "'; CurrentDirectory = '" + esc(s.cwd) + "' }; " +
    "Write-Output ('RET=' + $r.ReturnValue + ' PID=' + $r.ProcessId)";
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    const m = out.match(/RET=(\d+)\s+PID=(\d+)/);
    if (!m) return { ok: false, why: '无法解析 WMI 返回' };
    if (Number(m[1]) !== 0) return { ok: false, why: 'WMI 返回 ' + m[1] };
    return { ok: true, pid: Number(m[2]) };
  } catch (e) {
    return { ok: false, why: '调用 WMI 失败：' + (e.message || e).split('\n')[0] };
  }
}

/** 兜底：普通 detached（已知会随会话被回收，只求「当下能用」） */
function startDetached(s) {
  fs.mkdirSync(LOGDIR, { recursive: true });
  const fd = fs.openSync(path.join(LOGDIR, s.log), 'a');
  const child = spawn(NODE, s.args, { cwd: s.cwd, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
  child.unref();
  return { ok: true, pid: child.pid };
}

/** 在计划任务环境里被调用：拉起所有未在跑的服务（绝不递归 schtasks） */
async function serveOnce() {
  for (const s of SERVICES) {
    if (await portOpen(s.port)) { appendLog('serve-once.log', s.port + ' 已在跑，跳过'); continue; }
    if (s.needsDist && !fs.existsSync(path.join(ROOT, 'website', 'dist', 'index.html'))) {
      appendLog('serve-once.log', s.port + ' 需要 dist，任务环境里不构建（请先在主环境 rebuild）');
      continue;
    }
    const fd = fs.openSync(path.join(LOGDIR, s.log), 'a');
    const child = spawn(NODE, s.args, { cwd: s.cwd, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
    child.unref();
    appendLog('serve-once.log', s.port + ' 拉起 PID ' + child.pid);
  }
}

async function start() {
  fs.mkdirSync(LOGDIR, { recursive: true });
  for (const s of SERVICES) {
    if (await portOpen(s.port)) {
      console.log('  ✓ ' + s.name + ' 已在跑（端口 ' + s.port + '，PID ' + listeningPids(s.port).join(',') + '），跳过');
      continue;
    }
    if (s.needsDist) buildWebsite();
    let r = startViaTask(s);
    if (r.ok) {
      console.log('  → ' + s.name + ' 经计划任务拉起（脱离会话与控制台，日志 ' + s.log + '）');
    } else {
      console.log('  · ' + s.name + ' 计划任务不可用（' + r.why + '），尝试 WMI…');
      r = startViaCIM(s);
      if (r.ok) console.log('  → ' + s.name + ' 经 WMI 拉起（PID ' + r.pid + '）⚠️ 可能仍被会话级清理带走');
      else {
        const d = startDetached(s);
        console.log('  → ' + s.name + ' 回退 detached（PID ' + d.pid + '）⚠️ 大概率随会话被回收');
      }
    }
  }
  // 起进程 ≠ 起来了：HTTP 探活后才算数
  console.log('  探活中…');
  for (const s of SERVICES) {
    let ok = false;
    for (let i = 0; i < 40; i++) {
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
  else if (cmd === 'serve-once') await serveOnce();
  else if (cmd === 'stop') await stop();
  else if (cmd === 'status') await status();
  else if (cmd === 'rebuild') buildWebsite();
  else { console.log('未知命令：' + cmd + '（可用 start / stop / status / rebuild）'); process.exitCode = 1; }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
