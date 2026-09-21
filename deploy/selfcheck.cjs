/**
 * deploy/ 自检（只读，不动任何真实路径）：
 *   node deploy/selfcheck.cjs
 *   node deploy/selfcheck.cjs --dump     # 额外打印渲染后的备份脚本
 *
 * 验的是「部署工具链是否与现网真实架构一致」——现网是：
 *   应用服务器：pm2 onlystyle-api(3100) + onlystyle-web(8085)
 *   代理服务器：nginx upstream 反代，www.域名→8085 / bos.域名→3100
 *   本机：只构建 + 打包 + 上传
 *
 * 🔴 最要紧的一条回归守卫：旧版 bootstrap.sh 有一段 sed，把 server.js 改成
 *    只听 127.0.0.1。跨机代理下单机地址根本连不通 —— 这段一旦回归，
 *    线上 3100 会「pm2 online 但代理 502」。见 [1]。
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
const DEPLOY_CJS = path.join(ROOT, 'deploy', 'deploy.cjs');
const EXAMPLE = path.join(ROOT, 'deploy', 'deploy.config.example.txt');
const ECOSYSTEM = path.join(ROOT, 'ecosystem.config.js');
const NGDIR = path.join(ROOT, 'deploy', 'nginx');

let pass = 0, fail = 0;
const check = (cond, label, extra) => {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + label); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + label + (extra ? '\n       → ' + extra : '')); }
};

const src = fs.readFileSync(BOOT, 'utf8');
const dsrc = fs.readFileSync(DEPLOY_CJS, 'utf8');

function heredoc(fileSrc, tag) {
  const lines = fileSrc.split(/\r?\n/);
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
  if (h.quoted) return h.body;
  const assigns = Object.entries(vars).map(([k, v]) => `${k}='${v}'`).join('; ');
  const tmp = path.join(os.tmpdir(), 'onlystyle-heredoc-' + Math.random().toString(36).slice(2) + '.sh');
  fs.writeFileSync(tmp, `${assigns}\ncat <<XHEREDOC_END\n` + h.body + '\nXHEREDOC_END\n', 'utf8');
  const r = spawnSync(BASH, [tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  if (r.status !== 0) throw new Error('bash 展开失败: ' + r.stderr);
  return r.stdout;
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[1] bootstrap.sh 必须与「跨机代理」架构一致\x1b[0m');
// 🔴 回归守卫：旧版那段 sed 会把后端改成只听 127.0.0.1，跨机代理直接连不通
check(!/process\.env\.HOST/.test(src), '不再含 process.env.HOST 改写（旧版危险 sed 的产物）');
check(!/sed\s+-i[^\n]*HOST/.test(src), '不再对 server.js 做 HOST 相关 sed');
check(/app\.listen\(PORT, '0\.0\.0\.0'/.test(src), '改为「检测」server.js 是否监听 0.0.0.0（只告警，不改写）');
check(/APP_DIR=\/opt\/business-os/.test(src), '安装根目录为 /opt/business-os（与现网一致）');
check(/API_PORT=3100/.test(src) && /WEB_PORT=8085/.test(src), '端口常量 3100 / 8085');
check(!/pkg_install[^\n]*nginx/.test(src), '应用服务器上不再安装 nginx（入口在代理机）');
check(/pm2 start "\$ECO"/.test(src), '用 pm2 start 随包发布的 ecosystem.config.js');
check(/onlystyle-web/.test(src), '启动前校验包内有 onlystyle-web 进程定义');
check(/content-sync\.cjs/.test(src), '部署完成后提示用 content-sync 同步内容（而非整库覆盖）');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[2] 备份脚本 heredoc 转义\x1b[0m');
// BKEOF 不加引号：$APP_DIR/$LOG_DIR 需要安装时展开；
// 而 $SRC/$ITEMS/$(date) 必须用 \$ 逃逸成字面量，留到每次运行时才求值。
const bk = heredoc(src, 'BKEOF');
check(!!bk && bk.quoted === false, 'BKEOF 使用未加引号的 heredoc（需要展开 APP_DIR）');
if (bk) {
  check(/\\\$ITEMS/.test(bk.body), '正文里 $ITEMS 以 \\$ 逃逸（运行时才求值）');
  check(/\\\$\(date/.test(bk.body), '正文里 $(date ...) 以 \\$ 逃逸');
  const out = expand(bk, { APP_DIR: '/opt/business-os', BACKUP_DIR: '/opt/business-os/backups', LOG_DIR: '/opt/business-os/logs' });
  check(/\$ITEMS/.test(out), '渲染后保留字面量 $ITEMS');
  check(/\$\(date/.test(out), '渲染后保留字面量 $(date');
  check(/SRC=\/opt\/business-os\/biz-os\/backend/.test(out), 'APP_DIR 已正确展开为 /opt/business-os');
  check(!/\$\{\s*\}/.test(out), '没有出现「变量展开成空」的残缺行');
}
if (process.argv.includes('--dump')) console.log('\n===== onlystyle-backup（渲染后）=====\n' + (bk ? expand(bk, { APP_DIR: '/opt/business-os', BACKUP_DIR: '/opt/business-os/backups', LOG_DIR: '/opt/business-os/logs' }) : ''));

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[3] ecosystem.config.js —— pm2 单一真相源\x1b[0m');
const eco = fs.readFileSync(ECOSYSTEM, 'utf8');
check(/name:\s*'onlystyle-api'/.test(eco), '定义了 onlystyle-api');
check(/name:\s*'onlystyle-web'/.test(eco), '定义了 onlystyle-web');
check(/PORT:\s*'3100'/.test(eco), 'API 端口 3100');
check(/PORT:\s*'8085'/.test(eco), '官网端口 8085');
check(/instances:\s*1/.test(eco), 'instances: 1（sql.js 全量落盘，多进程会互相覆盖）');
check(/exec_mode:\s*'fork'/.test(eco), 'exec_mode: fork');
check(/script:\s*'serve\.cjs'/.test(eco), '官网进程执行 website/serve.cjs（不是 pm2 内置纯静态 serve）');
check(/WEB_ROOT:\s*'\/opt\/business-os\/website\/dist'/.test(eco), '官网静态根指向 /opt/business-os/website/dist');
check(/API_ORIGIN:\s*'http:\/\/127\.0\.0\.1:3100'/.test(eco), '官网服务把 /api 反代到 127.0.0.1:3100');
// 官网服务本体：静态 + 反代，缺一样「直连 8085」就会退回 SPA 兜底（壳对内容旧）
const webServe = fs.existsSync(path.join(ROOT, 'website', 'serve.cjs'))
  ? fs.readFileSync(path.join(ROOT, 'website', 'serve.cjs'), 'utf8') : '';
check(!!webServe, 'website/serve.cjs 存在');
check(/app\.use\('\/api',\s*proxyToApi\)/.test(webServe), 'serve.cjs 反代 /api');
check(/app\.use\('\/uploads',\s*proxyToApi\)/.test(webServe), 'serve.cjs 反代 /uploads');
check(/express\.static\(/.test(webServe), 'serve.cjs 静态部分用 express.static（自带 mp4 的 HTTP Range）');
check(/originalUrl/.test(webServe), 'serve.cjs 代理用 originalUrl（用 req.url 会丢 /api 前缀）');
check(/req\.pipe\(up\)/.test(webServe), 'serve.cjs 转发请求体（官网线索表单是 POST /api/leads）');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[4] deploy.cjs 关键行为\x1b[0m');
check(/ecosystem\.config\.js/.test(dsrc), '打包时带上根 ecosystem.config.js');
const ecoAt = dsrc.indexOf('ecoSrc');
const tarAt = dsrc.indexOf('spawnSync(tarBin');
check(ecoAt > 0 && tarAt > 0 && ecoAt < tarAt, 'ecosystem.config.js 在打包 tar 之前拷入（顺序不能反）');
// 官网服务入口也必须随包发布，否则部署后 pm2 onlystyle-web 起不来
check(/path\.join\(app, 'website', 'serve\.cjs'\)/.test(dsrc), 'deploy.cjs 把 website/serve.cjs 打进包');
const wsAt = dsrc.indexOf("'website', 'serve.cjs'");
check(wsAt > 0 && tarAt > 0 && wsAt < tarAt, 'website/serve.cjs 在打包 tar 之前拷入（顺序不能反）');
check(!/cfg\.ADMIN_PORT|cfg\.ADMIN_USER|cfg\.ADMIN_PASS/.test(dsrc), '不再引用已废弃的 ADMIN_* 配置项');
check(!/cfg\.WEB_PORT/.test(dsrc), '不再引用已废弃的 WEB_PORT 配置项');
check(/APP_DIR/.test(dsrc) && /--app-dir/.test(dsrc), '把 --app-dir 传给服务器端脚本');
check(/--domain/.test(dsrc), '把 --domain 传给服务器端脚本');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[5] deploy/nginx/ —— 代理机配置\x1b[0m');
check(fs.existsSync(NGDIR), 'deploy/nginx/ 目录存在');
const up = fs.existsSync(path.join(NGDIR, 'onlystyle-upstream.conf')) ? fs.readFileSync(path.join(NGDIR, 'onlystyle-upstream.conf'), 'utf8') : '';
const www = fs.existsSync(path.join(NGDIR, 'www.onlystyle.com.cn.conf')) ? fs.readFileSync(path.join(NGDIR, 'www.onlystyle.com.cn.conf'), 'utf8') : '';
const bos = fs.existsSync(path.join(NGDIR, 'bos.onlystyle.com.cn.conf')) ? fs.readFileSync(path.join(NGDIR, 'bos.onlystyle.com.cn.conf'), 'utf8') : '';
const inc = fs.existsSync(path.join(NGDIR, 'onlystyle-proxy.inc')) ? fs.readFileSync(path.join(NGDIR, 'onlystyle-proxy.inc'), 'utf8') : '';
check(/upstream onlystyle_api[\s\S]*?:3100/.test(up), 'upstream onlystyle_api → :3100');
check(/upstream onlystyle_web[\s\S]*?:8085/.test(up), 'upstream onlystyle_web → :8085');
check(/__APP_HOST__/.test(up), 'upstream 用 __APP_HOST__ 占位，避免写死 IP');
check(/proxy_pass http:\/\/onlystyle_api;/.test(www), 'www：/api 与 /uploads 走 api upstream（否则官网只有壳没有内容）');
check(/proxy_pass http:\/\/onlystyle_web;/.test(www), 'www：页面走 web upstream（8085）');
check(/server_name www\.onlystyle\.com\.cn onlystyle\.com\.cn;/.test(www), 'www：覆盖 www 与裸域');
check(/server_name bos\.onlystyle\.com\.cn;/.test(bos), 'bos：server_name 正确');
check(/proxy_pass http:\/\/onlystyle_api;/.test(bos), 'bos：全量走 api upstream（3100）');
check(/client_max_body_size\s+25m;/.test(www) && /client_max_body_size\s+25m;/.test(bos), '证书图 base64 体积足够（25m > 16m 后端上限）');
check(/proxy_set_header Connection\s+"";/.test(inc), '公共代理头把 Connection 置空（upstream keepalive 才生效）');
check(/\$host/.test(inc) && /\$remote_addr/.test(inc) && /\$proxy_add_x_forwarded_for/.test(inc), '公共代理头保留真实 IP 头');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[6] Node 下载地址提取逻辑\x1b[0m');
const sample = JSON.stringify([
  { name: 'node-v22.20.0-darwin-arm64.tar.gz', type: 'file' },
  { name: 'node-v22.20.0-linux-arm64.tar.xz', type: 'file' },
  { name: 'node-v22.20.0-linux-x64.tar.zip', type: 'file' },
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
console.log('\n\x1b[1m[7] 配置模板与脚本一致性\x1b[0m');
const example = fs.readFileSync(EXAMPLE, 'utf8');
for (const k of ['SERVER_IP', 'SSH_PORT', 'SSH_USER', 'APP_DIR', 'DOMAIN']) {
  check(example.includes(k + '='), `模板里有 ${k}`);
  check(dsrc.includes(k), `deploy.cjs 读取了 ${k}`);
}
for (const dead of ['ADMIN_PORT', 'ADMIN_USER', 'ADMIN_PASS']) {
  check(new RegExp('^' + dead + '=', 'm').test(example) === false, `模板里不再出现废弃项 ${dead}`);
}
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
check(/deploy\/\.ssh\//.test(gi), '.gitignore 忽略了 deploy/.ssh/（私钥）');
check(/deploy\/deploy\.config\.txt/.test(gi), '.gitignore 忽略了 deploy/deploy.config.txt');
check(!/[^\x00-\x7F]/.test(fs.readFileSync(path.join(ROOT, 'deploy', 'deploy.bat'), 'utf8')),
      'deploy.bat 是纯 ASCII（不会被代码页搞坏）');

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[8] 品牌素材随包发布\x1b[0m');
check(/name !== 'uploads'/.test(dsrc), 'beSkip 仍然排除整个 uploads 目录');
check(/BRAND_ASSET = \/\^logo_brand/.test(dsrc), 'deploy.cjs 定义了品牌素材白名单 BRAND_ASSET');
const brandCopyAt = dsrc.indexOf('BRAND_ASSET.test(f)');
check(brandCopyAt > 0 && tarAt > 0 && brandCopyAt < tarAt, '品牌素材拷贝发生在打包 tar 之前');
const brandReSrc = (dsrc.match(/const BRAND_ASSET = (\/[^\n]*?\/[a-z]*);/) || [])[1] || '';
let brandRe = null;
try { brandRe = new Function('return ' + brandReSrc)(); } catch (e) { brandRe = null; }
check(brandRe instanceof RegExp, '能从 deploy.cjs 抠出 BRAND_ASSET 正则源码并构造成功', brandReSrc || '抠不到');
check(!!brandRe && !brandRe.test('logo_brand.png') && brandRe.test('logo_brand.deadbeef.png'),
      '白名单拒绝固定名 logo_brand.png、只接受 8 位哈希名');
const brandDir = path.join(ROOT, 'biz-os', 'backend', 'uploads');
const brandFiles = (brandRe && fs.existsSync(brandDir))
  ? fs.readdirSync(brandDir).filter((f) => brandRe.test(f))
  : [];
check(brandFiles.length === 1, '本机 uploads 里有且仅有一个内容寻址品牌素材 logo_brand.<hash>.png',
      brandFiles.length ? brandFiles.join(', ') : '一个都没找到');
if (brandFiles.length) {
  const lb = fs.readFileSync(path.join(brandDir, brandFiles[0]));
  const isPng = lb[0] === 0x89 && lb[1] === 0x50 && lb[2] === 0x4E && lb[3] === 0x47;
  check(isPng, '品牌素材是真 PNG');
  check(lb[25] === 6, 'PNG colorType = 6（RGBA，带透明通道）', 'colorType = ' + lb[25]);
  const sha = require('crypto').createHash('sha256').update(lb).digest('hex').slice(0, 8);
  check(brandFiles[0].indexOf(sha) > 0, '文件名哈希 = 文件内容 sha256 前 8 位', brandFiles[0]);
}

// ---------------------------------------------------------------------------
console.log('\n' + '-'.repeat(64));
console.log(`  \x1b[1m结果：${pass} 通过 / ${fail} 失败\x1b[0m`);
console.log('-'.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
