/**
 * 逐页截图自检：新站 6 页，整页 + 首屏。
 * 用法: node scripts/shots.cjs [baseUrl]
 * 输出: ../design/site-audit/new/*.png
 *
 * ⚠️ 两点必须做，否则截出来是假的：
 *   1) 预热滚动——页面用 IntersectionObserver 做进入动画，不滚到底下半部分全是空的
 *   2) user-data-dir 建在工作区外——留在项目里会瞬间产生几万文件，工作区监听被拖死
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Users\\Shine Lu\\.cache\\puppeteer\\chrome\\win64-148.0.7778.97\\chrome-win64\\chrome.exe';
const PROFILE = path.join(process.env.TEMP || 'C:/Windows/Temp', 'shots-website-' + Date.now());
const BASE = process.argv[2] || 'http://127.0.0.1:3201';
const OUT = path.resolve(__dirname, '../../design/site-audit/new');

const PAGES = [
  ['home', '/'],
  ['about', '/about'],
  ['services', '/services'],
  ['cases', '/cases'],
  ['news', '/news'],
  ['contact', '/contact'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 步进滚到底，触发所有进场动画，再回到顶部
 *
 * ⚠️ 必须显式 behavior:'instant'。设计系统里写了 `html { scroll-behavior: smooth }`，
 *    不加的话每次 scrollTo 都变成平滑动画，步进和回顶全在竞速 ——
 *    结果就是首屏截图停在半路（Hero 大字根本不在画面里）。
 */
async function warmScroll(page) {
  await page.evaluate(async () => {
    const to = (y) => window.scrollTo({ top: y, behavior: 'instant' });
    const step = 400;
    const wait = 150;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      to(y);
      await new Promise((r) => setTimeout(r, wait));
    }
    to(document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    to(0);
    await new Promise((r) => setTimeout(r, 500));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: PROFILE,
    args: ['--no-proxy-server', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });

  const report = [];
  for (const [name, url] of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('JS: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    page.on('requestfailed', (r) => errors.push(`REQ: ${r.url()} ${r.failure()?.errorText || ''}`));

    await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1400);
    await warmScroll(page);

    const fold = path.join(OUT, `${name}-fold.png`);
    await page.screenshot({ path: fold });
    const full = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: full, fullPage: true });

    const info = await page.evaluate(() => ({
      title: document.title,
      h1: [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()),
      h2: [...document.querySelectorAll('h2')].map((e) => e.textContent.trim()),
      brokenImgs: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      docH: document.documentElement.scrollHeight,
    }));
    report.push({ name, url, ...info, errors });
    console.log(
      `${name.padEnd(9)} H=${String(info.docH).padStart(5)} h1=${info.h1.length} h2=${info.h2.length} ` +
      `broken=${info.brokenImgs.length} err=${errors.length}`
    );
    if (info.brokenImgs.length) console.log('   broken: ' + info.brokenImgs.join(', '));
    if (errors.length) errors.slice(0, 6).forEach((e) => console.log('   ! ' + e.slice(0, 160)));
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  console.log('\n-> ' + OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
