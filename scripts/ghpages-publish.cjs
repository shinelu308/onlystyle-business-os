/* 发布 dist-gh → GitHub Pages（shinelu308/onlystyle-web，公开仓，只含构建产物） */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'onlystyle-web';
const OWNER = 'shinelu308';
const DIST = path.resolve(__dirname, '../../website/dist-gh');
const API = 'https://api.github.com';
// 沙箱里 cmd.exe 不可用 → 全部用 git.exe 绝对路径 + shell:false
const GIT = 'C:/Program Files/Git/cmd/git.exe';
function git(args, opts) {
  const r = spawnSync(GIT, args, Object.assign({ encoding: 'utf8', shell: false }, opts || {}));
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' 失败: ' + (r.stderr || r.stdout || '').slice(0, 300));
  return r.stdout || '';
}

function tok() {
  const r = spawnSync(GIT, ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', shell: false });
  return (r.stdout || '').split('\n').find((l) => l.startsWith('password=')).slice(9).trim();
}
const T = tok();
const H = { Authorization: 'token ' + T, 'User-Agent': OWNER, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };

async function api(method, url, body) {
  const r = await fetch(API + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { s: r.status, j };
}

(async () => {
  // 1) 建仓（已存在则复用）
  let r = await api('POST', '/user/repos', {
    name: REPO, private: false, has_issues: false, has_wiki: false, has_projects: false, auto_init: false,
    description: 'ONLYSTYLE 官网（构建产物 · GitHub Pages）',
  });
  if (r.s === 422) { console.log('仓库已存在，复用'); }
  else if (r.s !== 201) { console.log('建仓失败', r.s, JSON.stringify(r.j).slice(0, 300)); process.exit(1); }
  else console.log('✓ 仓库已创建：' + OWNER + '/' + REPO + '（公开）');

  // 2) 推送产物
  git(['init', '-b', 'main'], { cwd: DIST });
  git(['add', '-A'], { cwd: DIST });
  git(['-c', 'user.name=shinelu308', '-c', 'user.email=shinelu308@users.noreply.github.com',
    'commit', '-m', 'publish: ONLYSTYLE 官网静态站点'], { cwd: DIST });
  const url = 'https://' + OWNER + ':' + T + '@github.com/' + OWNER + '/' + REPO + '.git';
  try { git(['remote', 'remove', 'origin'], { cwd: DIST }); } catch (e) {}
  git(['remote', 'add', 'origin', url], { cwd: DIST });
  git(['push', '-f', 'origin', 'main'], { cwd: DIST });
  git(['remote', 'remove', 'origin'], { cwd: DIST }); // 推完摘掉带 token 的 remote
  console.log('✓ 构建产物已推送 main');

  // 3) 开启 Pages（main 分支根目录）
  r = await api('POST', '/repos/' + OWNER + '/' + REPO + '/pages', { source: { branch: 'main', path: '/' } });
  if (r.s === 201) console.log('✓ GitHub Pages 已开启');
  else if (r.s === 409) console.log('Pages 已存在，沿用');
  else { console.log('Pages 开启返回', r.s, JSON.stringify(r.j).slice(0, 300)); }

  // 4) 等首次构建完成并探活
  const LIVE = 'https://' + OWNER + '.github.io/' + REPO + '/';
  process.stdout.write('==> 等待首次部署');
  let up = false;
  for (let i = 0; i < 36; i++) {
    await new Promise((s) => setTimeout(s, 5000));
    process.stdout.write('.');
    try {
      const res = await fetch(LIVE, { headers: { 'User-Agent': OWNER } });
      if (res.status === 200) { const t = await res.text(); if (t.includes('ONLYSTYLE')) { up = true; break; } }
    } catch (e) {}
  }
  console.log('');
  console.log(up ? '✓ 已上线：' + LIVE : '✗ 3 分钟内未探活，稍后手动打开 ' + LIVE + '（Pages 首次构建偶尔要几分钟）');
  process.exitCode = up ? 0 : 1;
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
