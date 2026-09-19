#!/usr/bin/env node
/**
 * GitHub Pages 构建脚本（免费外网链接）
 * ---------------------------------------------------------------------------
 *   node scripts/ghpages-build.cjs          # 构建到 website/dist-gh
 *
 * 与本地/根域部署完全隔离：
 *   · 产物输出到 website/dist-gh（website/dist 不动，3201 预览不受影响）
 *   · --base=/onlystyle-web/   → 资产与路由都挂在子路径下
 *   · 绝对路径改写             → /media/ /xxx-design/ /xxx-embed.html → 子路径版
 *   · 404.html = index.html    → GitHub Pages 的 SPA 回退（/contact 直链可用）
 *   · .nojekyll                → 跳过 Jekyll 处理
 * 不改写 /api/ —— 在 GitHub Pages 上接口 404，前端按设计回落内置兜底数据。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'website');
const DIST = path.join(WEB, 'dist-gh');
const SUB = '/onlystyle-web';

// 需要从「根绝对路径」改写为「子路径」的前缀（含 /embed 页自身）
const PREFIXES = [
  'media/', 'contact-design/', 'about-design/', 'products-design/',
  'contact-embed.html', 'about-embed.html', 'products-embed.html', 'favicon.svg',
];

function build() {
  console.log('==> vite build --base=' + SUB + '/');
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build',
    '--base=' + SUB + '/', '--outDir', 'dist-gh', '--emptyOutDir'],
    { cwd: WEB, stdio: 'inherit' });
}

function rewriteFile(f) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const p of PREFIXES) {
    s = s.split('"' + '/' + p).join('"' + SUB + '/' + p);
    s = s.split("'" + '/' + p).join("'" + SUB + '/' + p);
  }
  // CSS 里不带引号的 url(/media/...)
  s = s.replace(/url\((\s*)\/media\//g, 'url($1' + SUB + '/media/');
  if (s !== before) fs.writeFileSync(f, s);
}

function walk(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, cb);
    else cb(f);
  }
}

function post() {
  let changed = 0;
  walk(DIST, (f) => {
    const ext = path.extname(f);
    if (['.html', '.js', '.css', '.svg'].includes(ext)) { rewriteFile(f); changed++; }
  });
  console.log('==> 路径改写完成，扫描 ' + changed + ' 个文本文件');

  // 404.html = SPA 回退；.nojekyll = 跳过 Jekyll（下划线文件不被忽略）
  fs.copyFileSync(path.join(DIST, 'index.html'), path.join(DIST, '404.html'));
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
  console.log('==> 404.html(SPA 回退) + .nojekyll 已生成');
}

// 自检：还有没有漏网的根绝对引用（排除 /api/ 与 /onlystyle-web/ 本身）
function audit() {
  const bad = [];
  walk(DIST, (f) => {
    if (!['.html', '.js', '.css'].includes(path.extname(f))) return;
    const s = fs.readFileSync(f, 'utf8');
    const m = s.match(/["'(](\/(?!api\/|onlystyle-web\/)[a-z][\w-]*\/[^"'()\s]{2,60})/g) || [];
    for (const x of m) {
      if (!bad.includes(x)) bad.push(x);
    }
  });
  if (bad.length) {
    console.log('⚠️  以下根绝对引用未改写（请确认是否需要）:');
    bad.slice(0, 20).forEach((x) => console.log('   ' + x));
  } else {
    console.log('✓ 自检通过：除 /api/ 外无根绝对引用');
  }
}

build();
post();
audit();
console.log('\n完成：' + DIST);
