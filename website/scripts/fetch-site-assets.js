/**
 * 把线上现有站点的图片素材迁到工程里（一次性，也用于后续更新）
 * 来源：https://www.onlystyle.com.cn/img/*
 * 用法: node scripts/fetch-site-assets.js
 *
 * ⚠️ 线上是 hash 命名（如 xinyushikang.55c0edeb.png），对外可能已被引用。
 *    这里去掉 hash 存成干净文件名，上线时若要兼容旧链接需在 nginx 做 301（见技术方案风险 3）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/media/site');
const BASE = 'https://www.onlystyle.com.cn/img/';

// [线上文件名, 存到本地的名字]
const ITEMS = [
  // 合作伙伴 logo（线上首页实际引用的 4 个，阿里云是 base64 内联不在这里）
  ['tencent.a755ee33.png', 'partner-tencent.png'],
  ['shypt.7119e021.png', 'partner-shypt.png'],
  ['unicom.1aa28dfc.png', 'partner-unicom.png'],
  ['telecom.cebbc42d.png', 'partner-telecom.png'],
  // 案例封面
  ['xinyushikang.55c0edeb.png', 'case-xinyushikang.png'],
  ['dashijie.c032c298.png', 'case-dashijie.png'],
  ['guilin.2771a2e0.png', 'case-guilin.png'],
  ['gattefosse.2123cff4.png', 'case-gattefosse.png'],
  // 新闻配图
  ['news1.4718e205.jpg', 'news-1.jpg'],
  ['news2.e876091d.jpg', 'news-2.jpg'],
  ['news3.ccbfaa12.jpg', 'news-3.jpg'],
  // 联系页微信二维码
  ['qrcode_wx.aa8780a8.png', 'qrcode-wx.png'],
];

fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fail = 0, bytes = 0;
for (const [src, name] of ITEMS) {
  const out = path.join(OUT, name);
  if (fs.existsSync(out) && fs.statSync(out).size > 512) {
    console.log(`SKIP ${name}`);
    ok++; bytes += fs.statSync(out).size;
    continue;
  }
  try {
    const r = await fetch(BASE + src, { redirect: 'follow' });
    if (!r.ok) { console.log(`FAIL ${r.status}  ${src}`); fail++; continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(out, buf);
    ok++; bytes += buf.length;
    console.log(`OK   ${name.padEnd(26)} ${(buf.length / 1024).toFixed(0).padStart(6)}KB`);
  } catch (e) {
    console.log(`ERR  ${name.padEnd(26)} ${e.message}`);
    fail++;
  }
}
console.log(`\n完成: 成功 ${ok} / 失败 ${fail}，共 ${(bytes / 1048576).toFixed(2)} MB`);
console.log('输出: ' + OUT);
