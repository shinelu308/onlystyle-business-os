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
 * 不改写 /api/ —— 由「后台数据快照」接管（见 snapshot()）：
 * 构建时从本地后台拉真实数据内联进页面（window.__SNAP__），
 * 前端 content.js 发请求前同步直读 → 线上显示后台真实 logo / 配置 / 内容。
 * 后台不在线时自动跳过 → 线上走内置兜底。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'website');
const DIST = path.join(WEB, 'dist-gh');
const SUB = '/onlystyle-web';
const BOS = 'http://localhost:3100';
const BIZ_UPLOADS = path.join(ROOT, 'biz-os', 'backend', 'uploads');

// 前端会调用的全部公开读接口（website/src/api/content.js + 各页面）
// key = 快照名（sw.js 里查表用），val = 后端真实路径
const SNAP_ENDPOINTS = [
  ['site', '/api/content/site'],
  ['home', '/api/content/home'],
  ['cases', '/api/content/cases'],
  ['partners', '/api/content/partners'],
  ['services', '/api/content/services'],
  ['pages/about', '/api/content/pages/about'],
  ['pages/products', '/api/content/pages/products'],
];

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
  // 🔴 站内路由链接也要改写：embed 页的 target=_top 导航（静态 HTML）
  //    和案例星球返回按钮（编译进 JS 的 href:"/"）都是裸根路径 ——
  //    子路径部署下点击会跳到 github.io 根目录 = 404。
  //    （Vue router-link 是运行时按 BASE_URL 算的，本来就对，不用管。）
  s = s.split('href="/"').join('href="' + SUB + '/"');
  s = s.split('href:"/"').join('href:"' + SUB + '/"');
  for (const r of ['cases', 'products', 'about', 'contact']) {
    s = s.split('href="/' + r + '"').join('href="' + SUB + '/' + r + '"');
  }
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

// ─────────────────────────────────────────────────────────────
// 后台数据快照：把本地后台的真实数据内联进页面，线上前端直读
// ─────────────────────────────────────────────────────────────
async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('application/json')) throw new Error('HTTP ' + r.status + ' ' + ct);
    const json = await r.json();
    if (json.ok === false) throw new Error(json.error || 'ok:false');
    return json; // 原样信封 { ok, data, version }
  } finally {
    clearTimeout(timer);
  }
}

async function snapshot() {
  // 1) 逐个拉接口（个别失败只跳过该项；全部失败 = 后台不在线 → 整体跳过）
  const snaps = {};
  for (const [key, api] of SNAP_ENDPOINTS) {
    try {
      snaps[key] = await fetchJson(BOS + api);
      console.log('   ✓ 快照 ' + key + '（' + JSON.stringify(snaps[key].data).length + ' B）');
    } catch (e) {
      console.log('   ✗ 跳过 ' + key + '：' + e.message);
    }
  }
  const keys = Object.keys(snaps);
  if (!keys.length) {
    console.log('⚠️  后台不在线或全部接口失败 → 本次构建不带数据快照（线上走内置兜底）');
    return;
  }

  // 2) 扫描快照里的 /uploads/ 引用：拷文件进产物 + 改写为子路径（logo 就在这里）
  let body = JSON.stringify(snaps);
  const ups = new Set();
  for (const m of body.matchAll(/"\/uploads\/([\w./-]+)"/g)) ups.add(m[1]);
  for (const rel of ups) {
    const src = path.join(BIZ_UPLOADS, rel);
    if (!fs.existsSync(src)) {
      console.log('   ⚠️  uploads 引用文件不存在，跳过：' + rel);
      body = body.split('"/uploads/' + rel + '"').join('""');
      continue;
    }
    const dst = path.join(DIST, 'uploads', rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    body = body.split('"/uploads/' + rel + '"').join('"' + SUB + '/uploads/' + rel + '"');
  }
  if (ups.size) console.log('   ✓ 拷贝 uploads 资源 ' + ups.size + ' 个 → dist-gh/uploads/');
  // /media/ 引用：星球贴图等已由 vite 从 public/media 拷进 dist，只改写路径
  body = body.split('"/media/').join('"' + SUB + '/media/');

  // 3) 内联进 index.html / 404.html：window.__SNAP__ 在业务 JS 之前执行，
  //    前端 content.js 发请求前同步直读（首屏即命中，无 SW 时序问题）
  const tag = '<script>window.__SNAP__=' + body + ';</script>';
  for (const f of ['index.html', '404.html']) {
    const p = path.join(DIST, f);
    if (!fs.existsSync(p)) continue;
    let s = fs.readFileSync(p, 'utf8');
    if (s.includes('window.__SNAP__')) continue;
    s = s.replace('</head>', tag + '</head>');
    fs.writeFileSync(p, s);
  }
  console.log('==> 快照已内联 index.html / 404.html（' + keys.length + ' 项，' + (body.length / 1024).toFixed(1) + ' KB）');
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
snapshot()
  .catch((e) => console.log('⚠️  快照阶段异常（不影响构建产物，线上走兜底）：' + e.message))
  .then(() => {
    audit();
    console.log('\n完成：' + DIST);
  });
