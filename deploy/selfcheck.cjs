/**
 * deploy/ 自检：验证 bootstrap.sh 里最容易被静默搞坏的三处
 *   1. nginx 配置 heredoc 的变量转义（$uri / $host 必须保持字面量）
 *   2. server.js 的 sed 补丁（HOST 环境变量）
 *   3. Node 下载地址的 grep 提取（拿真实目录索引样本喂进去）
 * 只读，不动任何真实路径。改动 deploy/ 下任何脚本后跑一次：node deploy/selfcheck.cjs
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BASH = (() => {
  const cands = [
    'C:/Program Files/Git/bin/bash.exe',
    'C:/Program Files/Git/usr/bin/bash.exe',
    process.env.ProgramFiles ? process.env.ProgramFiles + '/Git/bin/bash.exe' : '',
    '/bin/bash', '/usr/bin/bash',
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (_) {} }
  return 'bash';
})();
const HERE = path.resolve(__dirname);
// 从本文件所在目录逐级向上找，直到看见 deploy/bootstrap.sh（本脚本既可放在
// deploy/ 下，也可放在 .workbuddy/tmp/ 下调试，都能定位到项目根）
const ROOT = (() => {
  let d = HERE;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'deploy', 'bootstrap.sh'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('定位不到项目根目录（向上找不到 deploy/bootstrap.sh）');
})();
const BOOT = path.join(ROOT, 'deploy', 'bootstrap.sh');
const SERVER_JS = path.join(ROOT, 'biz-os', 'backend', 'server.js');

let pass = 0, fail = 0;
const check = (cond, label, extra) => {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + label); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + label + (extra ? '\n       → ' + extra : '')); }
};

const src = fs.readFileSync(BOOT, 'utf8');

// ---------------------------------------------------------------------------
// 1. 抽出 heredoc 正文（用真实文件文本，避免测试副本与实现漂移）
// ---------------------------------------------------------------------------
function heredoc(tag) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex(l => l.includes('<<' + tag) || l.includes("<<'" + tag + "'"));
  if (start < 0) return null;
  const quoted = lines[start].includes("<<'" + tag + "'");
  let i = start + 1, out = [];
  for (; i < lines.length; i++) {
    if (lines[i].trim() === tag) break;
    out.push(lines[i]);
  }
  return { body: out.join('\n'), quoted, startLine: start + 1 };
}

function expand(h, vars) {
  if (h.quoted) return h.body;   // <<'TAG' 时 bash 不展开任何变量
  const assigns = Object.entries(vars).map(([k, v]) => `${k}='${v}'`).join('; ');
  const tmp = path.join(os.tmpdir(), 'onlystyle-heredoc-' + Math.random().toString(36).slice(2) + '.sh');
  // 关键：用 `cat <<XH` 把正文包起来，这样 bash 只做变量展开并原样打印，
  // 不会把 nginx 指令当成命令去执行。
  fs.writeFileSync(tmp, `${assigns}\ncat <<XHEREDOC_END\n` + h.body + '\nXHEREDOC_END\n', 'utf8');
  const r = spawnSync(BASH, [tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  if (r.status !== 0) throw new Error('bash 展开失败: ' + r.stderr);
  return r.stdout;
}

/**
 * 还原 heredoc 的真实行为：
 *   加引号 <<'TAG' → bash 不做任何展开，正文原样落盘
 *   不加引号 <<TAG  → bash 展开 $VAR / ${VAR}，但 \$X 逃逸成字面量 $X
 */
function render(h, vars) {
  if (h.quoted) return h.body;
  return expand(h, vars).replace(/\\\$/g, '$');
}

const VARS = { APP_ROOT: '/opt/onlystyle/app', WEB_PORT: '8080', ADMIN_PORT: '8081', API_PORT: '3100' };

console.log('\n\x1b[1m[1] nginx 官网配置（onlystyle-web.conf）\x1b[0m');
const web = heredoc('WEBEOF');
check(!!web && web.quoted === false, 'WEBEOF 使用未加引号的 heredoc（需要展开变量）');
const webOut = render(web, VARS);
check(/try_files \$uri \$uri\/ \/index\.html;/.test(webOut), '$uri 保持字面量（没有展开成空）',
      webOut.split('\n').find(l => l.includes('try_files')));
check(/proxy_set_header Host\s+\$host;/.test(webOut) === false && !/\$host/.test(webOut),
      'web.conf 里不应出现 $host（它在被引号的 proxy.inc 里）');
check(/listen 8080 default_server;/.test(webOut), 'listen 8080 default_server 已展开');
check(/root \/opt\/onlystyle\/app\/website\/dist;/.test(webOut), 'root 指向 website/dist 已展开');
check(/proxy_pass http:\/\/127\.0\.0\.1:3100;/.test(webOut), 'proxy_pass 指向 3100 已展开');
check(/include \/etc\/nginx\/onlystyle-proxy\.inc;/.test(webOut), '已 include 公共代理头');
const reLine = webOut.split('\n').find(l => l.includes('woff2')) || '';
check(/\$ \{$/.test(reLine.trim()) || /\$ \{/.test(reLine) || reLine.trim().endsWith('$ {'),
      '正则 location 末尾的 $ 保持字面量', reLine.trim());
check(!/\$\s*;/.test(webOut) && !/proxy_pass\s+http:\/\/127\.0\.0\.1:;/.test(webOut),
      '没有出现「变量展开成空」导致的残缺行');

console.log('\n\x1b[1m[2] nginx 代理头（onlystyle-proxy.inc，必须加引号）\x1b[0m');
const proxy = heredoc('PROXYEOF');
check(!!proxy && proxy.quoted === true, "PROXYEOF 使用加引号的 heredoc <<'PROXYEOF'（不能展开）");
const proxyOut = expand(proxy, VARS);
check(/proxy_set_header Host\s+\$host;/.test(proxyOut), '$host 原样保留');
check(/X-Real-IP\s+\$remote_addr;/.test(proxyOut), '$remote_addr 原样保留');
check(/X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/.test(proxyOut), '$proxy_add_x_forwarded_for 原样保留');
check(/X-Forwarded-Proto\s+\$scheme;/.test(proxyOut), '$scheme 原样保留');
check(/\$http_upgrade/.test(proxyOut), '$http_upgrade 原样保留');

console.log('\n\x1b[1m[3] nginx 域名站点配置（onlystyle-domain.conf）\x1b[0m');
const dom = heredoc('DOMEOF');
check(!!dom && dom.quoted === false, 'DOMEOF 使用未加引号的 heredoc');
const domOut = expand(dom, Object.assign({ APEX: 'example.com' }, VARS));
check(/server_name example\.com www\.example\.com;/.test(domOut), '官网 server_name 已展开');
check(/server_name admin\.example\.com;/.test(domOut), '后台 server_name 已展开');
check((domOut.match(/try_files \$uri \$uri\/ \/index\.html;/g) || []).length === 1, '$uri 保持字面量');
check((domOut.match(/listen 80;/g) || []).length === 2, '两个 80 端口 server 块');

console.log('\n\x1b[1m[4] 备份脚本 heredoc（必须加引号，里面的 $ITEMS 不能提前展开）\x1b[0m');
const bk = heredoc('BKEOF');
check(!!bk && bk.quoted === true, "BKEOF 使用加引号的 heredoc <<'BKEOF'");
check(/\$ITEMS/.test(bk.body), '正文里保留了 $ITEMS');
check(/\$\(date/.test(bk.body), '正文里保留了 $(date ...) 命令替换');

// ---------------------------------------------------------------------------
// 5. server.js 的 sed 补丁
// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[5] server.js 的 sed 补丁（让 HOST 环境变量生效）\x1b[0m');
const tmpJs = path.join(os.tmpdir(), 'server-patch-test.js');
fs.copyFileSync(SERVER_JS, tmpJs);
const SED = "s|app.listen(PORT, '0.0.0.0'|app.listen(PORT, process.env.HOST \\|\\| '0.0.0.0'|";
const s1 = spawnSync(BASH, ['-c', `sed -i "${SED}" "${tmpJs.split(path.sep).join('/')}"`], { encoding: 'utf8' });
check(s1.status === 0, 'sed 执行成功', s1.stderr);
const patched = fs.readFileSync(tmpJs, 'utf8');
check(/app\.listen\(PORT, process\.env\.HOST \|\| '0\.0\.0\.0'/.test(patched),
      "已改成 app.listen(PORT, process.env.HOST || '0.0.0.0'",
      (patched.split('\n').find(l => l.includes('app.listen')) || '').trim());
const syn = spawnSync(process.execPath, ['--check', tmpJs], { encoding: 'utf8' });
check(syn.status === 0, '改完的 server.js 语法仍然合法', syn.stderr);
// 幂等：再跑一次不应该再变化
const before = patched;
spawnSync(BASH, ['-c', `sed -i "${SED}" "${tmpJs.split(path.sep).join('/')}"`], { encoding: 'utf8' });
check(fs.readFileSync(tmpJs, 'utf8') === before, '重复执行 sed 不会二次破坏（幂等）');
check(/grep -q "app\.listen\(PORT, '0\.0\.0\.0'"/.test(src), 'bootstrap.sh 里加了 grep 守卫，避免无脑 sed');
fs.unlinkSync(tmpJs);

// ---------------------------------------------------------------------------
// 6. Node 下载地址提取（喂真实目录索引样本）
// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[6] Node 下载地址提取逻辑\x1b[0m');
const sample = JSON.stringify([
  { name: 'node-v22.20.0-darwin-arm64.tar.gz', type: 'file' },
  { name: 'node-v22.20.0-linux-arm64.tar.xz', type: 'file' },
  { name: 'node-v22.20.0-linux-x64.tar.gz', type: 'file' },
  { name: 'node-v22.20.0-linux-x64.tar.xz', type: 'file' },
  { name: 'node-v22.20.0-win-x64.zip', type: 'file' },
  { name: 'node-v22.21.0-linux-x64.tar.xz', type: 'file' },
]);
for (const arch of ['x64', 'arm64']) {
  const cmd = `printf '%s' '${sample}' | tr ',' '\\n' | grep -o "node-v22\\.[0-9.]*-linux-${arch}\\.tar\\.xz" | head -1`;
  const r = spawnSync(BASH, ['-c', cmd], { encoding: 'utf8' });
  const got = (r.stdout || '').trim();
  check(/^node-v22\.\d+\.\d+-linux-(x64|arm64)\.tar\.xz$/.test(got),
        `arch=${arch} 提取到合法文件名`, '得到: ' + JSON.stringify(got));
  check(got.includes('linux-' + arch + '.tar.xz') && !got.includes('darwin') && !got.includes('win-'),
        `arch=${arch} 没有误选到 darwin/win 包`, got);
}

// ---------------------------------------------------------------------------
// 7. deploy.cjs / deploy.config.example 一致性
// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[7] 配置项与脚本一致性\x1b[0m');
const example = fs.readFileSync(path.join(ROOT, 'deploy', 'deploy.config.example.txt'), 'utf8');
const deploySrc = fs.readFileSync(path.join(ROOT, 'deploy', 'deploy.cjs'), 'utf8');
for (const k of ['SERVER_IP', 'SSH_PORT', 'SSH_USER', 'WEB_PORT', 'ADMIN_PORT', 'ADMIN_USER', 'ADMIN_PASS', 'DOMAIN', 'USE_HTTPS']) {
  check(example.includes(k + '='), `模板里有 ${k}`);
  check(deploySrc.includes(k), `deploy.cjs 读取了 ${k}`);
}
check(/deploy\/\.ssh\//.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')), '.gitignore 忽略了 deploy/.ssh/（私钥）');
check(/deploy\/deploy\.config\.txt/.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')), '.gitignore 忽略了 deploy/deploy.config.txt');
check(!/[^\x00-\x7F]/.test(fs.readFileSync(path.join(ROOT, 'deploy', 'deploy.bat'), 'utf8')),
      'deploy.bat 是纯 ASCII（不会被代码页搞坏）');

// ---------------------------------------------------------------------------
if (process.argv.includes('--dump')) {
  console.log('\n===== onlystyle-web.conf =====\n' + webOut);
  console.log('\n===== onlystyle-proxy.inc =====\n' + proxyOut);
  console.log('\n===== onlystyle-domain.conf =====\n' + domOut);
}
console.log('\n' + '-'.repeat(64));
console.log(`  \x1b[1m结果：${pass} 通过 / ${fail} 失败\x1b[0m`);
console.log('-'.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
