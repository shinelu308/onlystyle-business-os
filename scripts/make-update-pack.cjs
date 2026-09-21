#!/usr/bin/env node
'use strict';
/**
 * 生成「累积更新包」—— 固定文件名，自动叠加，永远只有一个下载地址。
 *
 * 解决的问题
 * ---------------------------------------------------------------
 * 以前每轮改动各打一个 zip（v1 / v2 / v3…），用户得逐个下载、自己判断先后，
 * 漏掉一个就会出现「版本对不齐」的诡异现象（某处是新逻辑、某处还是旧的）。
 *
 * 做法：不维护任何「已发布清单」，直接以 git 基线为准 ——
 *   本包 = 服务器上「与你本地仓库基线（默认 origin/main）不同的全部文件」
 *        = 已跟踪文件的改动(覆盖) + 未跟踪的新文件(新增)
 * 于是天然自洽：
 *   · 你还没同步过的文件 → 一直在包里（自动叠加，绝不漏）
 *   · 你已同步并 push 过的   → 自动从包里消失（绝不重复收）
 *
 * 用法
 * ---------------------------------------------------------------
 *   node scripts/make-update-pack.cjs                  # 基线 origin/main
 *   node scripts/make-update-pack.cjs --base 3d273da   # 指定基线
 *   node scripts/make-update-pack.cjs --dry-run        # 只看清单，不打包
 *
 * 输出
 * ---------------------------------------------------------------
 *   biz-os/backend/uploads/_dl/onlystyle-update.zip
 *   ⚠️ _dl/ 在 server.js 的缓存策略里被排除出 immutable，保证每次下载都是新包。
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_REL = 'biz-os/backend/uploads/_dl/onlystyle-update.zip';
const OUT = path.join(ROOT, OUT_REL);
const URL = 'https://www.onlystyle.com.cn/uploads/_dl/onlystyle-update.zip';
// 包内说明文件。故意放在仓库 .gitignore 已忽略的 `_sync-to-local/` 下 ——
// 否则解压后 `git add -A` 会把它当新文件提交进仓库（已经发生过一次）。
const MANIFEST_REL = '_sync-to-local/README-UPDATE.txt';

// ===== 绝不进包（防御性：即使被 git 跟踪/未忽略也拦掉）=====
const DENY = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)dist\//,
  /\.db($|\.|-|_)/,          // broadband_os.db / *.db.2026-xx.backup / *.db.920
  /\.sqlite3?($|-)/,
  /\.log$/,
  /(^|\/)backups\//,
  /(^|\/)logs\//,
  /(^|\/)\.ssh\//,
  /\.htpasswd$/,
  /^deploy\/deploy\.config\.txt$/,
  /^biz-os\/backend\/uploads\/_dl\//,   // 下载区自己（防止自我递归）
  /^\.codebuddy\//,
  /^\.workbuddy\//,
  /^_sync-to-local/,
  /\.(tar\.gz|tgz|zip)$/,
  /vite\.config\.js\.timestamp-/,
];

// ===== 敏感内容二次扫描：命中即中止 =====
const SENSITIVE_CONTENT = [
  /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/,
  /wechat_appsecret["'\s:]+[A-Za-z0-9]{16,}/,
];

const C = {
  g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m',
};
const ok = (m) => console.log(`${C.g}✓${C.x} ${m}`);
const info = (m) => console.log(`${C.d}${m}${C.x}`);
const warn = (m) => console.log(`${C.y}!${C.x} ${m}`);
function die(m) {
  console.error(`${C.r}✗ ${m}${C.x}`);
  process.exit(1);
}

function git(args) {
  const r = spawnSync('git', ['-C', ROOT].concat(args), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    die(`git ${args.join(' ')} 失败：${(r.stderr || '').trim() || 'exit ' + r.status}`);
  }
  return r.stdout;
}

// -z 输出按 NUL 切分，避免文件名含空格/中文时被拆错
function gitList(args) {
  return git(args.concat(['-z'])).split('\0').filter(Boolean);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { base: 'origin/main', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i];
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('用法: node scripts/make-update-pack.cjs [--base <git-ref>] [--dry-run]');
      process.exit(0);
    } else die(`未知参数：${argv[i]}`);
  }
  return out;
}

function denied(p) {
  return DENY.some((re) => re.test(p));
}

/**
 * 该文件在基线里是否已有一份「内容完全相同」的副本。
 * 用于给未跟踪文件去重：像 ecosystem.config.js / uploads 素材这类文件，
 * 用户本地仓库早就提交过了，只是服务器这边因为 .gitignore 没跟踪，
 * 在 git diff 里会显示成「新增/已删除」。靠内容比对才能正确识别出「其实早就同步过了」。
 */
function baseHasIdentical(base, p) {
  const rev = spawnSync('git', ['-C', ROOT, 'rev-parse', '--verify', '--quiet', `${base}:${p}`], { encoding: 'utf8' });
  if (rev.status !== 0) return false;
  const h = spawnSync('git', ['-C', ROOT, 'hash-object', '--', p], { encoding: 'utf8', cwd: ROOT });
  if (h.status !== 0) return false;
  return h.stdout.trim() === rev.stdout.trim();
}

function human(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * 删文件/目录。优先用 fs；被安全删除垫片（会尝试移入回收站并失败抛错）接管时
 * 退回 shell 的 rm。删除失败不该让整个打包流程崩掉，所以这里永不抛错。
 */
function forceRemove(p, recursive) {
  try {
    fs.rmSync(p, { recursive: !!recursive, force: true });
    return true;
  } catch (e) {
    const r = spawnSync('rm', [recursive ? '-rf' : '-f', '--', p]);
    return r.status === 0;
  }
}

function main() {
  const { base, dryRun } = parseArgs();

  // --- 基线必须可解析，否则会静默拿到一个空清单 ---
  const probe = spawnSync('git', ['-C', ROOT, 'rev-parse', '--verify', base + '^{commit}'], { encoding: 'utf8' });
  if (probe.status !== 0) die(`基线 "${base}" 无法解析。先 git fetch origin，或用 --base <sha> 指定。`);
  const baseSha = git(['rev-parse', '--short', base]).trim();
  const headSha = git(['rev-parse', '--short', 'HEAD']).trim();

  // --- 收集：改动(覆盖) / 新增 / 删除 ---
  const modified = gitList(['diff', '--name-only', '--no-renames', '--diff-filter=ACMRT', base]);
  const untracked = gitList(['ls-files', '--others', '--exclude-standard']);

  // ⚠️ 「需在本机删除」不能用 git diff 的 D 状态直接判断：
  //    服务器上被 .gitignore 忽略的文件（uploads 素材、ecosystem.config.js 等）
  //    在 index 里没有条目，diff 会把它们一律报成「相对基线已删除」—— 全是假阳性
  //    （实测把 ecosystem.config.js 同时列进了「新增」和「删除」两份清单）。
  //    正确语义：基线里有、且工作区里真的不存在 → 才需要用户在本机删掉。
  const deleted = gitList(['diff', '--name-only', '--no-renames', '--diff-filter=D', base])
    .filter((p) => !fs.existsSync(path.join(ROOT, p)));

  const entries = [];
  const seen = new Set();
  const skipped = [];
  const alreadySame = [];
  const push = (p, kind) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    if (denied(p)) { skipped.push(p); return; }
    if (!fs.existsSync(path.join(ROOT, p))) { skipped.push(p); return; }
    entries.push({ p, kind });
  };
  modified.forEach((p) => push(p, '覆盖'));
  untracked.forEach((p) => {
    // 基线里已有内容完全相同的副本 → 用户本地早就有了，不必再发（否则每轮都重复带上）
    if (baseHasIdentical(base, p)) { alreadySame.push(p); return; }
    push(p, '新增');
  });
  entries.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));

  const deletedSafe = deleted.filter((p) => !denied(p));

  console.log('');
  info(`仓库      ${ROOT}`);
  info(`基线      ${base} (${baseSha})   HEAD ${headSha}`);
  ok(`待打包 ${entries.length} 个文件（覆盖 ${entries.filter((e) => e.kind === '覆盖').length} / 新增 ${entries.filter((e) => e.kind === '新增').length}）`);
  if (deletedSafe.length) warn(`另需在本机删除 ${deletedSafe.length} 个文件（见清单）`);
  if (alreadySame.length) info(`已跳过 ${alreadySame.length} 个「基线里已有同样内容」的文件（本地早就有了）`);
  if (skipped.length) info(`已排除 ${skipped.length} 个（敏感/忽略类）`);

  if (!entries.length) {
    warn('当前没有任何待同步的改动 —— 你本地仓库已经是最新的了。');
    process.exit(0);
  }

  // --- 敏感内容扫描 ---
  for (const e of entries) {
    if (!/\.(js|cjs|mjs|json|sh|html|vue|css|txt|md|conf|inc|yml|yaml)$/i.test(e.p)) continue;
    const txt = fs.readFileSync(path.join(ROOT, e.p), 'utf8');
    for (const re of SENSITIVE_CONTENT) {
      if (re.test(txt)) die(`安全检查未通过：${e.p} 疑似含密钥，拒绝打包。`);
    }
  }

  if (dryRun) {
    console.log('');
    entries.forEach((e) => console.log(`  [${e.kind}] ${e.p}`));
    if (deletedSafe.length) {
      console.log('');
      deletedSafe.forEach((p) => console.log(`  [本机删除] ${p}`));
    }
    console.log(''); info('--dry-run，未生成 zip'); console.log('');
    return;
  }

  // --- 暂存到临时目录，保持相对路径，绝不污染仓库工作区 ---
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'onlystyle-upd-'));
  let raw = 0;
  for (const e of entries) {
    const src = path.join(ROOT, e.p);
    const dst = path.join(stage, e.p);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    e.size = fs.statSync(dst).size;
    raw += e.size;
  }

  // --- 清单 ---
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const manifest = [
    '============================================================',
    ' ONLYSTYLE · 累积更新包',
    '============================================================',
    ` 生成时间 : ${stamp}`,
    ` 文件数量 : ${entries.length}（覆盖 ${entries.filter((e) => e.kind === '覆盖').length} / 新增 ${entries.filter((e) => e.kind === '新增').length}）`,
    ` 基线     : ${base} (${baseSha})`,
    '',
    '【怎么用】',
    ' 1) 解压到本机仓库根目录，例如：',
    '    E:\\开发项目\\WorkBuddy\\2026-09-15-13-36-12\\',
    '    （压缩包内的目录结构已与仓库一致，直接覆盖即可，无需自己找位置）',
    '    ⚠️ 覆盖前先确认本机对这些文件没有未提交的改动（有就先 commit 或 git stash），',
    '       否则你刚在本地改的东西会被服务器版本盖掉。',
    '    （本说明文件放在 _sync-to-local/ 下，该目录已被 .gitignore 忽略，git add -A 不会收它）',
    ' 2) 提交并推送：',
    '      git add -A',
    '      git commit -m "sync: 服务器累积更新"',
    '      git push',
    '',
    '【为什么只有一个包】',
    ' 本包 = 服务器上「与你本地仓库基线不同的全部文件」。',
    '   · 你还没同步过的 → 一直在包里（自动叠加，不会漏）',
    '   · 你已同步并 push 过的 → 自动从包里消失（不会重复收）',
    ' 所以以后永远只下载这一个地址，不需要再管 v1 / v2 / v3。',
    '',
    '【不含什么】',
    ' · 数据库 broadband_os.db —— 它的同步方向是「本地 → 服务器」',
    '   （用 scripts/content-sync.cjs），不是反过来。本包只含代码/配置。',
    ' · node_modules / dist / 日志 / 备份 —— 服务器上会重新装、重新构建。',
    '',
    '------------------------------------------------------------',
    ` 文件清单（${entries.length} 个）`,
    '------------------------------------------------------------',
  ];
  entries.forEach((e) => manifest.push(`  [${e.kind}] ${e.p}`));
  if (deletedSafe.length) {
    manifest.push('');
    manifest.push('------------------------------------------------------------');
    manifest.push(` 需在本机删除（${deletedSafe.length} 个）`);
    manifest.push('------------------------------------------------------------');
    deletedSafe.forEach((p) => manifest.push(`  ${p}`));
    manifest.push('');
    manifest.push('（含义：文件在你仓库里有、但服务器工作区里已经没有了 —— 通常是已经不需要的');
    manifest.push('  文件，例如上一版 zip 里误被 git add 进仓库的 MANIFEST.txt。确认后 git rm 掉即可。）');
  }
  manifest.push('');
  manifest.push('============================================================');
  manifest.push('');
  // ⚠️ 说明文件必须放在 `_sync-to-local/` 里 —— 那个目录在你仓库的 .gitignore 中。
  //    之前放在包根目录叫 MANIFEST.txt，结果你 `git add -A` 时把它一起提交进仓库了
  //    （现在仓库根上就躺着一个多余的 MANIFEST.txt）。
  fs.mkdirSync(path.join(stage, '_sync-to-local'), { recursive: true });
  fs.writeFileSync(path.join(stage, MANIFEST_REL), manifest.join('\n'), 'utf8');

  // --- 打包 ---
  // 先打到临时名、再原子改名覆盖旧包。两步原因：
  //  ① zip 默认是「往已有包里追加」，不先清空的话，上一轮有、这一轮已经消失的条目会残留；
  //  ② 直接 unlink 旧包在这台机器上会被安全删除垫片接管并抛错（实测把整个脚本搞崩，
  //     表现为「跑了脚本但包还是旧的」这种很难发现的问题）。rename 覆盖不涉及删除，最稳。
  if (spawnSync('zip', ['-v']).status !== 0) die('未找到 zip 命令（需安装 zip，例如 yum install zip）');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmpZip = OUT + '.part';
  forceRemove(tmpZip);
  const zr = spawnSync('zip', ['-q', '-X', '-r', tmpZip, MANIFEST_REL].concat(entries.map((e) => e.p)), {
    cwd: stage,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (zr.status !== 0) die(`打包失败：${(zr.stderr || '').trim() || 'exit ' + zr.status}`);
  if (!fs.existsSync(tmpZip)) die('打包失败：未产出 zip 文件');
  fs.renameSync(tmpZip, OUT); // 原子替换，旧包同刻消失，不会出现「半成品包」被下载

  forceRemove(stage, true);

  const size = fs.statSync(OUT).size;
  const sha = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex').slice(0, 12);

  console.log('');
  ok(`已生成 ${OUT_REL}`);
  info(`  未压缩 ${human(raw)} → 压缩后 ${human(size)}   sha256:${sha}`);
  console.log('');
  console.log(`  ${C.c}下载地址（固定不变）${C.x}`);
  console.log(`  ${C.c}${URL}${C.x}`);
  console.log('');
  info('  改完代码后重新跑一次本脚本即可，新内容会自动叠加进同一个包。');
  console.log('');
}

main();
