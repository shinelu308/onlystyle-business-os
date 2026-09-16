#!/usr/bin/env node
/**
 * ONLYSTYLE 业务系统 · 本地一键部署（Windows / macOS / Linux 通用）
 * ---------------------------------------------------------------------------
 * 双击 deploy.bat 即可（Mac/Linux 用 node deploy.cjs）。
 *
 * 它会依次做这些事：
 *   1. 读 deploy.config.txt（服务器 IP / 端口 / 域名）
 *   2. 构建官网（website -> dist）
 *   3. 打包「后端 + 后台前端 + 官网产物 + 数据库」为一个安装包
 *   4. 生成免密密钥（只需输一次服务器密码，以后双击就完事）
 *   5. 上传安装包并执行服务器端 bootstrap.sh
 *   6. 打印访问地址
 *
 * 可选参数：
 *   --dry-run       只打包、只报体积，不连服务器
 *   --skip-build    跳过官网构建，用现有的 website/dist
 *   --web  <端口>    覆盖官网端口
 *   --admin <端口>   覆盖后台端口
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');
const SSH_DIR = path.join(HERE, '.ssh');
const KEY_FILE = path.join(SSH_DIR, 'id_ed25519');
const PUB_FILE = KEY_FILE + '.pub';
const KNOWN_HOSTS = path.join(SSH_DIR, 'known_hosts');
const CONF_FILE = path.join(HERE, 'deploy.config.txt');
const CONF_EXAMPLE = path.join(HERE, 'deploy.config.example.txt');
const REMOTE = '/tmp/onlystyle-deploy.tar.gz';
const REMOTE_BOOT = '/tmp/onlystyle-bootstrap.sh';

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const valOf = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };
const fwd = (p) => p.split(path.sep).join('/');

// ---------------------------------------------------------------------------
// 输出小工具
// ---------------------------------------------------------------------------
const C = { r: '\x1b[0m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', e: '\x1b[31m', d: '\x1b[90m' };
const say = (s) => console.log(`\n${C.b}${C.c}==> ${s}${C.r}`);
const ok = (s) => console.log(`    ${C.g}*${C.r} ${s}`);
const warn = (s) => console.log(`    ${C.y}!${C.r} ${s}`);
const info = (s) => console.log(`    ${C.d}${s}${C.r}`);
function die(s) { console.log(`\n${C.e}${C.b}[x] ${s}${C.r}\n`); process.exit(1); }
function bytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'; }

// ---------------------------------------------------------------------------
// 1. 读配置
// ---------------------------------------------------------------------------
function loadConfig() {
  say('1/6  读取部署配置');
  let file = CONF_FILE;
  if (!fs.existsSync(file)) {
    if (!fs.existsSync(CONF_EXAMPLE)) die('找不到 deploy.config.txt，也找不到模板 deploy.config.example.txt');
    fs.copyFileSync(CONF_EXAMPLE, file);
    die(`已为你生成 ${file}\n` +
        `    请用记事本打开，把 SERVER_IP 改成你的服务器公网 IP，保存后再双击一次。`);
  }
  const cfg = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    cfg[t.slice(0, i).trim().toUpperCase()] = t.slice(i + 1).trim();
  }
  if (!cfg.SERVER_IP) die('deploy.config.txt 里的 SERVER_IP 是空的 —— 请填上服务器公网 IP');
  if (!/^[\d.a-zA-Z-]+$/.test(cfg.SERVER_IP)) die(`SERVER_IP 格式不像 IP 或域名：${cfg.SERVER_IP}`);
  cfg.SSH_PORT = cfg.SSH_PORT || '22';
  cfg.SSH_USER = cfg.SSH_USER || 'root';
  cfg.WEB_PORT = valOf('--web') || cfg.WEB_PORT || '8080';
  cfg.ADMIN_PORT = valOf('--admin') || cfg.ADMIN_PORT || '8081';
  cfg.ADMIN_USER = cfg.ADMIN_USER || 'onlystyle';
  cfg.DOMAIN = cfg.DOMAIN || '';
  cfg.USE_HTTPS = /^(1|true|yes|是|y)$/i.test(cfg.USE_HTTPS || '') ? '1' : '0';
  ok(`${cfg.SSH_USER}@${cfg.SERVER_IP}:${cfg.SSH_PORT}   官网 ${cfg.WEB_PORT} / 后台 ${cfg.ADMIN_PORT}`);
  if (cfg.DOMAIN) ok(`域名：${cfg.DOMAIN}${cfg.USE_HTTPS === '1' ? '（启用 HTTPS）' : ''}`);
  else info('未配置域名 —— 将用「公网IP:端口」方式访问');
  return cfg;
}

// ---------------------------------------------------------------------------
// 2. 构建官网
// ---------------------------------------------------------------------------
function buildWebsite() {
  say('2/6  构建官网（website -> dist）');
  const webDir = path.join(ROOT, 'website');
  const distDir = path.join(webDir, 'dist');

  if (has('--skip-build')) {
    warn('按参数要求跳过构建');
    if (!fs.existsSync(distDir)) die('跳过构建，但 website/dist 不存在 —— 先跑一次 npm run build');
    return;
  }
  if (!fs.existsSync(path.join(webDir, 'node_modules'))) {
    warn('website/node_modules 不存在，跳过构建，改用现有 dist');
    if (!fs.existsSync(distDir)) die('website/dist 不存在且无法构建 —— 请先在 website 目录执行 npm install && npm run build');
    return;
  }

  // 不依赖 PATH：npm 就在当前 node 的同级目录里
  const npmBin = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const npm = fs.existsSync(npmBin) ? npmBin : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  info('正在跑 vite build，大约 10~40 秒…');
  const r = spawnSync(npm, ['run', 'build'], { cwd: webDir, stdio: 'inherit', shell: false });
  if (r.status !== 0) {
    warn('构建失败 —— 将改用上一次的 dist（官网内容可能不是最新的）');
    if (!fs.existsSync(distDir)) die('构建失败且没有可用的 dist，已中止');
    return;
  }
  ok('构建完成');
}

// ---------------------------------------------------------------------------
// 3. 打包
// ---------------------------------------------------------------------------
function copyTree(src, dst, keep) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (!keep(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) n += copyTree(s, d, keep);
    else { fs.copyFileSync(s, d); n += fs.statSync(d).size; }
  }
  return n;
}

function packTarball() {
  say('3/6  打包安装包');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'onlystyle-pack-'));
  const app = path.join(stage, 'app');
  let total = 0;

  // 后端：排除 node_modules（服务器自己装）、uploads（本机开发素材）、历史 .backup 快照
  const beSkip = (name) => name !== 'node_modules' && name !== 'uploads' && !/\.backup$/.test(name);
  total += copyTree(path.join(ROOT, 'biz-os', 'backend'), path.join(app, 'biz-os', 'backend'), beSkip);
  total += copyTree(path.join(ROOT, 'biz-os', 'frontend'), path.join(app, 'biz-os', 'frontend'), () => true);

  const dist = path.join(ROOT, 'website', 'dist');
  if (!fs.existsSync(dist)) die('website/dist 不存在，无法打包');
  total += copyTree(dist, path.join(app, 'website', 'dist'), () => true);

  const out = path.join(os.tmpdir(), 'onlystyle-deploy.tar.gz');
  if (fs.existsSync(out)) fs.unlinkSync(out);

  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const r = spawnSync(tarBin, ['-czf', out, '-C', stage, 'app'], { stdio: 'inherit' });
  fs.rmSync(stage, { recursive: true, force: true });
  if (r.status !== 0 || !fs.existsSync(out)) die('打包失败（tar 执行出错）');

  const size = fs.statSync(out).size;
  ok(`原始 ${bytes(total)}  →  压缩后 ${bytes(size)}`);
  info(`安装包：${out}`);
  if (size > 60 * 1048576) warn('安装包偏大，上传会比较慢（VideoGen 素材或 Hero 视频占得多）');
  return out;
}

// ---------------------------------------------------------------------------
// 4. SSH 工具
// ---------------------------------------------------------------------------
function bin(name) {
  if (process.platform !== 'win32') return name;
  const p = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', name + '.exe');
  return fs.existsSync(p) ? p : name;
}

function sshBase(cfg, useKey) {
  const a = [
    '-p', String(cfg.SSH_PORT),
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'UserKnownHostsFile=' + fwd(KNOWN_HOSTS),
    '-o', 'NumberOfPasswordPrompts=3',
    '-o', 'ConnectTimeout=20',
  ];
  if (useKey) a.push('-i', fwd(KEY_FILE), '-o', 'IdentitiesOnly=yes');
  return a;
}

function run(binPath, args, opts) {
  return spawnSync(binPath, args, Object.assign({ stdio: 'inherit' }, opts || {}));
}

function ensureKey() {
  say('4/6  准备免密登录密钥');
  fs.mkdirSync(SSH_DIR, { recursive: true });
  try { fs.chmodSync(SSH_DIR, 0o700); } catch (_) {}
  if (fs.existsSync(KEY_FILE)) { ok('密钥已存在，无需重复生成'); return; }
  const kg = spawnSync(bin('ssh-keygen'),
    ['-t', 'ed25519', '-f', fwd(KEY_FILE), '-N', '', '-C', 'onlystyle-deploy'],
    { stdio: 'inherit' });
  if (kg.status !== 0 || !fs.existsSync(KEY_FILE)) die('密钥生成失败');
  try { fs.chmodSync(KEY_FILE, 0o600); } catch (_) {}
  ok('已生成专用密钥（仅本机存放，已加入 .gitignore）');
}

function installKey(cfg) {
  const target = `${cfg.SSH_USER}@${cfg.SERVER_IP}`;

  // 先试免密
  const probe = spawnSync(bin('ssh'),
    sshBase(cfg, true).concat([target, 'echo __OK__']),
    { encoding: 'utf8', timeout: 40000 });
  if (probe.status === 0 && (probe.stdout || '').includes('__OK__')) {
    ok('免密登录已生效');
    return;
  }

  warn('首次连接：请按提示输入一次服务器密码（接下来会装上免密密钥，以后就不用再输了）');
  const pub = fs.readFileSync(PUB_FILE, 'utf8').trim();
  const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && ` +
              `grep -qF '${pub}' ~/.ssh/authorized_keys || echo '${pub}' >> ~/.ssh/authorized_keys; ` +
              `chmod 600 ~/.ssh/authorized_keys; echo __INSTALLED__`;
  const r = run(bin('ssh'), sshBase(cfg, false).concat([target, cmd]));
  if (r.status !== 0) {
    die('安装免密密钥失败。常见原因：\n' +
        '    1. 服务器密码不对，或 root 禁止密码登录（控制台要先「重置密码」并用新密码重启）\n' +
        '    2. SERVER_IP 填错，或云防火墙没放行 22 端口\n' +
        '    3. 服务器还没启动完成');
  }
  const again = spawnSync(bin('ssh'), sshBase(cfg, true).concat([target, 'echo __OK__']),
    { encoding: 'utf8', timeout: 40000 });
  if (again.status === 0 && (again.stdout || '').includes('__OK__')) ok('免密登录已生效');
  else warn('免密验证没通过，但密钥可能已写入 —— 继续尝试部署');
}

// ---------------------------------------------------------------------------
// 5. 上传 + 远程执行
// ---------------------------------------------------------------------------
function upload(cfg, tarball) {
  say('5/6  上传安装包到服务器');
  const target = `${cfg.SSH_USER}@${cfg.SERVER_IP}:/tmp/`;
  const scpArgs = [
    '-P', String(cfg.SSH_PORT),
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'UserKnownHostsFile=' + fwd(KNOWN_HOSTS),
    '-o', 'ConnectTimeout=20',
    '-i', fwd(KEY_FILE), '-o', 'IdentitiesOnly=yes',
    fwd(tarball), fwd(path.join(HERE, 'bootstrap.sh')), target,
  ];
  const r = run(bin('scp'), scpArgs);
  if (r.status !== 0) die('上传失败 —— 检查服务器是否可连、22 端口是否放行');
  ok('安装包与部署脚本已上传');
}

function remoteRun(cfg) {
  const parts = [`--web-port ${cfg.WEB_PORT}`, `--admin-port ${cfg.ADMIN_PORT}`, `--admin-user '${cfg.ADMIN_USER}'`];
  if (cfg.ADMIN_PASS) parts.push(`--admin-pass '${cfg.ADMIN_PASS}'`);
  if (cfg.DOMAIN) parts.push(`--domain '${cfg.DOMAIN}'`);
  if (cfg.USE_HTTPS === '1') parts.push('--https');
  // tr -d '\r' 顺手把 Windows 换行去掉，避免服务器上 bash 认不出 shebang
  const cmd = `tr -d '\\r' < ${REMOTE_BOOT} > /tmp/boot.run.sh && ` +
              `bash /tmp/boot.run.sh ${parts.join(' ')}`;

  say('6/6  在服务器上执行部署（约 2~5 分钟，中途会输出进度）');
  const r = run(bin('ssh'), sshBase(cfg, true).concat([`${cfg.SSH_USER}@${cfg.SERVER_IP}`, cmd]));
  return r.status === 0;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(function main() {
  console.log(`\n${C.b}  ONLYSTYLE 业务系统 · 一键部署${C.r}`);
  console.log(`${C.d}  项目目录：${ROOT}${C.r}`);

  const cfg = loadConfig();
  buildWebsite();
  const tarball = packTarball();

  if (has('--dry-run')) {
    console.log(`\n${C.g}${C.b}  试运行结束（--dry-run）：安装包已生成，未连服务器。${C.r}\n`);
    return;
  }

  ensureKey();
  installKey(cfg);
  upload(cfg, tarball);
  const good = remoteRun(cfg);

  if (good) {
    console.log(`\n${C.g}${C.b}  部署成功！${C.r}`);
    console.log(`  ${C.c}官网  http://${cfg.SERVER_IP}:${cfg.WEB_PORT}${C.r}`);
    console.log(`  ${C.c}后台  http://${cfg.SERVER_IP}:${cfg.ADMIN_PORT}${C.r}`);
    if (cfg.DOMAIN) console.log(`  ${C.c}域名  http://${cfg.DOMAIN}${C.r}`);
    console.log(`\n  ${C.d}打不开就看云控制台防火墙有没有放行这两个端口。${C.r}\n`);
  } else {
    console.log(`\n${C.y}${C.b}  部署过程返回了错误 —— 请把上面的输出截图给我。${C.r}\n`);
    process.exitCode = 1;
  }
})();
