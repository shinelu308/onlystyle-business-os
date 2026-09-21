/**
 * 真实打包边界验证（dry-run，不连服务器）：
 *   node deploy/verify-pack.cjs            # 正常跑
 *   VERBOSE=1 node deploy/verify-pack.cjs  # 打印 deploy.cjs 完整输出
 *
 * 验的是 selfcheck 证明不了的那半截：
 *   selfcheck 只能证明「白名单正则匹配得上文件名」，
 *   证明不了「tar 包里真有它、且别的本机上传素材没被带出去」。
 *
 *   随包发布的 uploads 有**两类**白名单：
 *     · 品牌图形  logo_brand.<sha8>.(png|svg|webp)     —— 官网导航/页脚/后台侧栏/登录页四处共用
 *     · 资质证书  uploads/certs/cert_<sha8>.(png|jpg|webp) —— 官网「关于我们」页
 *   漏了就是线上裂图；多带了就是本机开发素材外泄 + 安装包虚胖。
 *
 * ⚠️ 会临时创建 deploy/deploy.config.txt（若原本不存在），跑完自动删除还原。
 *    --skip-build 复用现有 website/dist，避免每次重复构建。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = (() => {
  let d = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'deploy', 'deploy.cjs'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('定位不到项目根目录');
})();

const NODE = process.execPath;
const CONF = path.join(ROOT, 'deploy', 'deploy.config.txt');
const TAR_BIN = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe')
  : 'tar';

const BRAND_RE = /^logo_brand\.[0-9a-f]{8}\.(png|svg|webp)$/i;
const CERT_RE = /^cert_[0-9a-f]{8}\.(png|jpg|webp)$/i;

let pass = 0;
let fail = 0;
const check = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  [' + extra + ']' : '')); }
};

const HAD_CONF = fs.existsSync(CONF);
let created = false;

console.log('\n[1] 准备与执行');
if (!HAD_CONF) {
  fs.writeFileSync(CONF,
    '# 临时配置（verify-pack.cjs 创建，跑完删除）\nSERVER_IP=127.0.0.1\nSSH_USER=root\nSSH_PORT=22\nAPP_DIR=/opt/business-os\nDOMAIN=onlystyle.com.cn\n',
    'utf8');
  created = true;
  console.log('  info 已写入临时 deploy.config.txt（SERVER_IP=127.0.0.1）');
} else {
  console.log('  info 复用已存在的 deploy.config.txt（不改动它）');
}

try {
  const r = spawnSync(NODE, [path.join(ROOT, 'deploy', 'deploy.cjs'), '--dry-run', '--skip-build'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1048576 });

  // 🔴 deploy.cjs 的 say()/ok() 带 ANSI 颜色码，不剥掉会污染文件名解析
  const out = ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '');
  if (process.env.VERBOSE) console.log(out);

  check(r.status === 0, 'deploy.cjs --dry-run 退出码为 0', 'status=' + r.status);
  check(/试运行结束/.test(out), '确实停在 --dry-run（未连服务器）');
  check(/打包安装包/.test(out), '走到了「打包安装包」这一步');
  check(/pm2 定义（随包发布）: ecosystem\.config\.js/.test(out), '打包输出里打印了「pm2 定义（随包发布）」');

  console.log('\n[2] tar 包内容');
  const tarball = path.join(os.tmpdir(), 'onlystyle-deploy.tar.gz');
  check(fs.existsSync(tarball), 'tarball 已生成', tarball);

  const lt = spawnSync(TAR_BIN, ['-tzf', tarball], { encoding: 'utf8', maxBuffer: 64 * 1048576 });
  const list = (lt.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
  console.log('    包内条目数: ' + list.length);

  // pm2 定义必须在包里（bootstrap.sh 靠它启动两个进程）
  check(list.indexOf('app/ecosystem.config.js') >= 0, '包内有 app/ecosystem.config.js');
  check(list.indexOf('app/website/serve.cjs') >= 0, '包内有 app/website/serve.cjs（pm2 onlystyle-web 的入口，漏了官网进程起不来）');
  check(list.some((f) => /^app\/website\/dist\/index\.html$/.test(f)), '包内有 app/website/dist/index.html');

  // ⚠️ tar -t 会同时列出**目录条目**（形如 .../uploads/certs/，带结尾斜杠）。
  //    不排掉的话，白名单断言会拿目录名去匹配文件名正则，误报「夹带了非白名单文件」。
  const uploadEntries = list.filter((f) => !f.endsWith('/') && /^app\/biz-os\/backend\/uploads\/.+/.test(f));
  console.log('    uploads 相关条目 ' + uploadEntries.length + ' 个:');
  uploadEntries.slice(0, 12).forEach((f) => console.log('      ' + f));
  if (uploadEntries.length > 12) console.log('      …');

  const brandEntries = uploadEntries.filter((f) => BRAND_RE.test(path.basename(f)) && !/\/certs\//.test(f));
  const certEntries = uploadEntries.filter((f) => /\/certs\//.test(f));
  check(brandEntries.length === 1, '包里恰好 1 个品牌图形（logo_brand.<hash>）', brandEntries.join(', '));
  check(certEntries.every((f) => CERT_RE.test(path.basename(f))),
        '证书图全部是内容寻址名 cert_<hash>.<ext>', certEntries.filter((f) => !CERT_RE.test(path.basename(f))).join(', '));
  check(uploadEntries.every((f) => BRAND_RE.test(path.basename(f)) || CERT_RE.test(path.basename(f))),
        '包内 uploads 条目**全部**落在两类白名单内（没有夹带本机素材）',
        uploadEntries.filter((f) => !BRAND_RE.test(path.basename(f)) && !CERT_RE.test(path.basename(f))).join(', '));
  check(!list.some((f) => /logo_brand\.png$/.test(f)), '包里没有旧的固定名 logo_brand.png');

  console.log('\n[3] 白名单反向验证（本机开发素材不能漏出去）');
  const uploadsDir = path.join(ROOT, 'biz-os', 'backend', 'uploads');
  const topFiles = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
    : [];
  const certDir = path.join(uploadsDir, 'certs');
  const certFiles = fs.existsSync(certDir) ? fs.readdirSync(certDir) : [];

  const allowedTop = topFiles.filter((f) => BRAND_RE.test(f));
  const shouldSkipTop = topFiles.filter((f) => !BRAND_RE.test(f));
  const allowedCert = certFiles.filter((f) => CERT_RE.test(f));
  const shouldSkipCert = certFiles.filter((f) => !CERT_RE.test(f));

  console.log('    本机 uploads 顶层 ' + topFiles.length + ' 个（应带 ' + allowedTop.length + '，应跳 ' + shouldSkipTop.length + '）');
  console.log('    本机 uploads/certs ' + certFiles.length + ' 个（应带 ' + allowedCert.length + '，应跳 ' + shouldSkipCert.length + '）');

  const leakedIt = (names, prefix) => names.filter((n) => list.indexOf(prefix + n) >= 0);
  const leakedTop = leakedIt(shouldSkipTop, 'app/biz-os/backend/uploads/');
  const leakedCert = leakedIt(shouldSkipCert, 'app/biz-os/backend/uploads/certs/');
  check(leakedTop.length === 0, '顶层非品牌文件一个都没被打包（白名单真的在起作用）', leakedTop.slice(0, 5).join(', '));
  check(leakedCert.length === 0, 'certs/ 下非证书文件一个都没被打包', leakedCert.slice(0, 5).join(', '));
  if (shouldSkipTop.length) console.log('    例如被正确排除: ' + shouldSkipTop.slice(0, 5).join(', '));
} finally {
  if (created) {
    try {
      fs.unlinkSync(CONF);
      console.log('\n  已删除临时 deploy.config.txt（还原原状）');
    } catch (e1) {
      // 某些环境（IDE 文件拦截器 / 只读挂载）会让 unlinkSync 失败，再试一次强制删除
      try {
        fs.rmSync(CONF, { force: true });
        console.log('\n  已删除临时 deploy.config.txt（还原原状）');
      } catch (e2) {
        console.log('\n  ⚠️ 临时 deploy.config.txt 删除失败，请手动删除：' + CONF);
      }
    }
  }
}

console.log('\n' + '-'.repeat(60));
console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('-'.repeat(60));
process.exit(fail ? 1 : 0);
