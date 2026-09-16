/**
 * 从 Lovart 设计稿里抽取 <style> 作为设计系统基础
 * 「照搬」策略：不重新发明一套 CSS，直接沿用设计稿的 tokens 与组件样式
 * 用法: node scripts/extract-css.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = 'E:/开发项目/WorkBuddy/2026-09-15-13-36-12/design/ref-design/index.html';
const OUT = path.join(ROOT, 'src/styles/design-system.css');

const html = fs.readFileSync(SRC, 'utf8');
const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
if (!blocks.length) { console.error('没找到 <style> 块'); process.exit(1); }

const header = `/* ============================================================
   ONLYSTYLE 设计系统
   来源：design/ref-design/index.html（Lovart 设计稿）自动抽取
   ⚠️ 这个文件是设计稿的「原样搬运」，不要在这里手改 —— 手改会被下次抽取覆盖。
      自定义/覆盖样式一律写到 site.css。
   生成：node scripts/extract-css.js
   ============================================================ */

`;

const css = header + blocks.join('\n\n/* ---- 下一个 style 块 ---- */\n\n');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, css);
console.log(`style 块 ${blocks.length} 个 → ${OUT}`);
console.log(`体积 ${(css.length / 1024).toFixed(1)} KB，${css.split('\n').length} 行`);
