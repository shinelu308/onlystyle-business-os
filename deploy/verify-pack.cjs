/**
 * 真实打包边界验证（dry-run，不连服务器）：
 *   node deploy/verify-pack.cjs            # 正常跑
 *   VERBOSE=1 node deploy/verify-pack.cjs  # 打印 deploy.cjs 完整输出
 *
 * 验的是 selfcheck 证明不了的那半截：
 *   selfcheck 只能证明「白名单正则匹配得上文件名」，
 *   证明不了「tar 包里真有它、且别的本机上传素材没被带出去」。
 *   线上官网导航/页脚 + 后台侧栏/登录页四处取的都是 /uploads/<这张图>，
 *   包里漏了就是四处裂图；多带了就是本机开发素材外泄 + 安装包虚胖。
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
const TAR_BIN = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');

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
    '# 临时配置（verify-pack.cjs 创建，跑完删除）\nSERVER_IP=127.0.0.1\nSSH_USER=root\nSSH_PORT=22\nWEB_PORT=8080\nADMIN_PORT=8081\n',
    'utf8');
  created = true;
  console.log('  info 已写入临时 deploy.config.txt（SERVER_IP=127.0.0.1）');
} else {
  console.log('  info 复用已存在的 deploy.config.txt（不改动它）');
}

try {
  const r = spawnSync(NODE, [path.join(ROOT, 'deploy', 'deploy.cjs'), '--dry-run', '--skip-build'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1048576 });

  // 🔴 deploy.cjs 的 say()/ok() 带 ANSI 颜色码（形如 \x1b[36m）。
  //    不剥掉的话 `\S+` 会把结尾的 \x1b[0m 一起吞进文件名 —— 断言会拿一个
  //    「带转义码的名字」去比对真实文件名，然后误报「白名单失效」。必须先清洗。
  const out = ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '');
  if (process.env.VERBOSE) console.log(out);

  check(r.status === 0, 'deploy.cjs --dry-run 退出码为 0', 'status=' + r.status);
  check(/试运行结束/.test(out), '确实停在 --dry-run（未连服务器）');
  check(/3\/6\s+打包安装包/.test(out), '走到了「3/6 打包安装包」这一步');

  const m = out.match(/品牌素材（随包发布）:\s*(\S+)/);
  check(!!m, '打包输出里打印了「品牌素材（随包发布）」', m ? m[1] : '没有这一行');
  const name = m ? m[1] : '';

  console.log('\n[2] tar 包内容');
  const tarball = path.join(os.tmpdir(), 'onlystyle-deploy.tar.gz');
  check(fs.existsSync(tarball), 'tarball 已生成', tarball);

  const lt = spawnSync(TAR_BIN, ['-tzf', tarball], { encoding: 'utf8', maxBuffer: 64 * 1048576 });
  const list = (lt.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
  console.log('    包内条目数: ' + list.length);

  const uploadEntries = list.filter((f) => /biz-os\/backend\/uploads\/.+/.test(f));
  console.log('    uploads 相关条目: ' + (uploadEntries.join(', ') || '（无）'));

  check(uploadEntries.length === 1, '包里恰好 1 个 uploads 条目（只带品牌素材）', uploadEntries.join(', '));
  check(!!name && list.indexOf('app/biz-os/backend/uploads/' + name) >= 0,
        '包内路径 = app/biz-os/backend/uploads/' + name);
  check(!list.some((f) => /logo_brand\.png$/.test(f)), '包里没有旧的固定名 logo_brand.png');
  check(uploadEntries.every((f) => /logo_brand\.[0-9a-f]{8}\./.test(f)),
        '带上的是内容寻址文件名（immutable 缓存下换图才可见）');

  console.log('\n[3] 白名单反向验证（本机开发素材不能漏出去）');
  const uploadsDir = path.join(ROOT, 'biz-os', 'backend', 'uploads');
  const all = fs.readdirSync(uploadsDir);
  const others = all.filter((f) => f !== name);
  const leaked = others.filter((f) => list.indexOf('app/biz-os/backend/uploads/' + f) >= 0);
  console.log('    本机 uploads 共 ' + all.length + ' 个文件，除品牌素材外 ' + others.length + ' 个');
  if (others.length) {
    console.log('    例如: ' + others.slice(0, 5).join(', ') + (others.length > 5 ? ' …' : ''));
  }
  check(leaked.length === 0, '本机 uploads 其余文件一个都没被打包（白名单真的在起作用）',
        leaked.slice(0, 5).join(', '));
} finally {
  if (created) {
    try { fs.unlinkSync(CONF); console.log('\n  已删除临时 deploy.config.txt（还原原状）'); }
    catch (e) { console.log('\n  ⚠️ 临时 deploy.config.txt 删除失败，请手动删除：' + CONF); }
  }
}

console.log('\n' + '-'.repeat(60));
console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('-'.repeat(60));
process.exit(fail ? 1 : 0);
