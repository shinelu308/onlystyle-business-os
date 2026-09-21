#!/usr/bin/env node
/**
 * 内容单向同步 —— 把一份 DB 的「内容域」搬到线上，业务数据原样不动。
 * ---------------------------------------------------------------------------
 *  用法：
 *    node scripts/content-sync.cjs --from <源DB>                 # 同步到线上库
 *    node scripts/content-sync.cjs --from <源DB> --dry-run       # 只看差异，不写
 *    node scripts/content-sync.cjs --from <源DB> --target <DB>   # 指定目标库（默认线上库）
 *    node scripts/content-sync.cjs --from <源DB> --force         # 跳过「服务在跑」检查
 *
 *  为什么必须只同步内容域：
 *    broadband_os.db 里同时躺着两类数据 ——
 *      · 内容域：content_* 表 + content_settings（官网/后台的文案、导航、logo、案例）
 *      · 业务域：customers / contracts / supplier_lines / spatial_nodes /
 *               project_lines / departments / staff / leads
 *    你本机那份 DB 常常只有测试客户、0 份合同，整库覆盖 = 线上真实业务直接清零。
 *    所以这里**只**动内容域，业务表连碰都不碰（代码里有 PROTECTED 断言把关）。
 *
 *  安全护栏：
 *    1. 源库 = 目标库  → 直接拒绝
 *    2. 3100 正在监听（= sql.js 进程持有内存副本）→ 默认拒绝：
 *       运行中的服务会在下次写库时用内存整库落盘，把你的同步结果覆盖掉。
 *       必须先把服务停掉：pm2 stop onlystyle-api
 *    3. 写之前自动备份目标库到 backups/
 *    4. 只同步结构一致的表；结构不一致直接报错，不做「猜着迁」
 *
 *  不做的事：不调用 npm / 不联网 / 不启动服务。同步完请自行 pm2 start。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TARGET = path.join(ROOT, 'biz-os', 'backend', 'broadband_os.db');
const BACKUP_DIR = path.join(ROOT, 'backups');
const API_PORT = 3100;

/* ── 内容域：整表替换 ───────────────────────────────────────────────── */
const CONTENT_TABLES = [
  'content_home_blocks',
  'content_cases',
  'content_services',
  'content_articles',
  'content_industries',
  'content_partners',
  'content_pages',
  'content_media',
];

/* ── content_settings：整表替换，但保留目标库自己的共享令牌 ───────────
   admin.content_token 同时是「内容写接口共享令牌」和「staff token 的 HMAC 签名密钥」，
   两边本来就不同（各自首次启动随机生成）。保留目标库那份可以避免：
   CI 脚本里存的老令牌失效、已登录运营被强制退出。 */
const CONTENT_SETTINGS_KEEP = ['admin.content_token'];

/* ── system_settings：品牌类白名单 ─────────────────────────────────────
   官网 /api/content/site 会把 general 组投影成 brand.logo（logo_url）
   与 brand.logoSubtitle（logo_subtitle）；后台的侧栏品牌字、登录页标题、
   浏览器标签分别来自 site_abbreviation / company_name / site_name。
   这些都算「品牌」，本地改了就该同步过来 —— 否则会漂移成
   「官网是新的，后台还写着占位符 XX宽带技术服务有限公司 / BOS」。

   ⚠️ 故意不在白名单里的两类：
     1) 微信密钥（wechat_appsecret / appid / 模板ID）—— 同步过去会立刻
        启用真实推送，这种副作用不该由一次内容同步悄悄打开；
     2) customer_types —— 改它会让存量客户的分类变成「列表外的值」，
        下拉框显示空白（线上 11 个客户里 9 个会中招）。要改必须连
        客户记录一起迁移，不能由内容同步顺手做掉。 */
const SITE_SETTING_KEYS = ['logo_url', 'logo_subtitle', 'site_abbreviation', 'site_name', 'company_name'];

/* ── 业务域：永不同步（断言用）─────────────────────────────────────── */
const PROTECTED = [
  'customers', 'contracts', 'supplier_lines', 'spatial_nodes', 'project_lines',
  'departments', 'staff', 'leads', 'sqlite_sequence',
];

// ---------------------------------------------------------------------------
const C = { r: '\x1b[0m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', e: '\x1b[31m', d: '\x1b[90m' };
const say = (s) => console.log(`\n${C.b}${C.c}==> ${s}${C.r}`);
const ok = (s) => console.log(`    ${C.g}✓${C.r} ${s}`);
const warn = (s) => console.log(`    ${C.y}!${C.r} ${s}`);
const info = (s) => console.log(`    ${C.d}${s}${C.r}`);
function die(s) { console.log(`\n${C.e}${C.b}[x] ${s}${C.r}\n`); process.exit(1); }

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const valOf = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };

/** 用后端的 sql.js（已是依赖，不额外装东西）。
 *  ⚠️ require('sql.js') 返回的是**初始化函数**（不是 SQL 命名空间），
 *     必须 await 调用一次才拿到 { Database }。backend/database.js 也是这么用的。 */
function loadSqlJs() {
  for (const p of [
    path.join(ROOT, 'biz-os', 'backend', 'node_modules', 'sql.js'),
    'sql.js',
  ]) {
    try {
      const mod = require(p);
      return (mod && mod.default) ? mod.default : mod;
    } catch (_) { /* 继续找 */ }
  }
  die('找不到 sql.js —— 请在 biz-os/backend 下先 npm install');
}

function openDb(SQL, file) {
  const buf = fs.readFileSync(file);
  return new SQL.Database(buf);
}

/** 只读查询 → 二维数组 */
function rows(db, sql) {
  const r = db.exec(sql);
  return r[0] ? r[0].values : [];
}
function one(db, sql) {
  const r = rows(db, sql);
  return r[0] ? r[0][0] : undefined;
}
function tableNames(db) {
  return rows(db, "SELECT name FROM sqlite_master WHERE type='table'").map((r) => r[0]);
}
function columns(db, table) {
  return rows(db, `PRAGMA table_info(${table})`).map((r) => r[1]);
}
function tableExists(db, t) {
  return tableNames(db).indexOf(t) >= 0;
}

const portOpen = (port, timeout = 700) => new Promise((resolve) => {
  const s = net.createConnection({ host: '127.0.0.1', port });
  const done = (v) => { try { s.destroy(); } catch (_) {} resolve(v); };
  s.setTimeout(timeout);
  s.once('connect', () => done(true));
  s.once('timeout', () => done(false));
  s.once('error', () => done(false));
});

// ---------------------------------------------------------------------------
(async function main() {
  console.log(`\n${C.b}  ONLYSTYLE · 内容单向同步${C.r}`);

  const from = valOf('--from');
  if (!from) die('缺少 --from <源DB>。例：node scripts/content-sync.cjs --from D:/dev/broadband_os.db --dry-run');
  const srcPath = path.resolve(from);
  const dstPath = path.resolve(valOf('--target') || DEFAULT_TARGET);
  const dryRun = has('--dry-run');

  say('1/5  检查输入');
  if (!fs.existsSync(srcPath)) die(`源库不存在：${srcPath}`);
  if (!fs.existsSync(dstPath)) die(`目标库不存在：${dstPath}`);
  if (fs.realpathSync(srcPath) === fs.realpathSync(dstPath)) die('源库与目标库是同一个文件，没什么可同步的');
  ok(`源库   ${srcPath}  (${(fs.statSync(srcPath).size / 1024).toFixed(0)} KB)`);
  ok(`目标库 ${dstPath}  (${(fs.statSync(dstPath).size / 1024).toFixed(0)} KB)`);

  // 护栏 1：服务在跑就不能写（sql.js 会用内存副本整库覆盖）
  //   --dry-run 是只读的，不写库，所以不必停服。
  if (!dryRun) {
    const running = await portOpen(API_PORT);
    if (running) {
      if (has('--force')) {
        warn(`检测到 ${API_PORT} 正在监听，但指定了 --force —— 同步结果可能随即被运行中的服务覆盖！`);
      } else {
        die(`检测到 ${API_PORT} 正在监听：运行中的服务持有 DB 内存副本，` +
            `会在下次写库时把你的同步结果整库覆盖掉。\n` +
            `    请先停服：  pm2 stop onlystyle-api\n` +
            `    同步完再启：pm2 start onlystyle-api\n` +
            `    （确实要顶着风险同步，加 --force）`);
      }
    } else {
      ok(`端口 ${API_PORT} 未监听（服务已停，可以安全写入）`);
    }
  } else {
    info('--dry-run 只读，不断言服务状态');
  }

  const initSqlJs = loadSqlJs();
  const SQL = await initSqlJs();
  const src = openDb(SQL, srcPath);
  const dst = openDb(SQL, dstPath);

  say('2/5  校验结构（结构不一致就拒绝，不猜着迁）');
  const targets = CONTENT_TABLES.concat(['content_settings']);
  for (const t of targets) {
    if (!tableExists(src, t)) die(`源库缺表 ${t}`);
    if (!tableExists(dst, t)) die(`目标库缺表 ${t}`);
    const a = columns(src, t).join(',');
    const b = columns(dst, t).join(',');
    if (a !== b) die(`表 ${t} 结构不一致：\n      源库: ${a}\n      目标库: ${b}`);
  }
  ok(`${targets.length} 张内容表结构一致`);

  // 断言：绝不动业务表
  const overlap = targets.filter((t) => PROTECTED.indexOf(t) >= 0);
  if (overlap.length) die(`内部错误：同步清单里混进了业务表 ${overlap.join(', ')}`);
  ok('同步清单与业务表零交集（业务数据不会被碰）');

  say('3/5  差异预览');
  const vBefore = one(dst, "SELECT value FROM content_settings WHERE key='content.version'");
  const vAfter = one(src, "SELECT value FROM content_settings WHERE key='content.version'");
  console.log(`    content.version  目标 ${C.b}${vBefore}${C.r}  →  源 ${C.b}${vAfter}${C.r}`);
  for (const t of CONTENT_TABLES) {
    const a = one(src, `SELECT COUNT(*) FROM ${t}`);
    const b = one(dst, `SELECT COUNT(*) FROM ${t}`);
    const flag = String(a) === String(b) ? '' : `  ${C.y}← 行数不同${C.r}`;
    console.log(`    ${t.padEnd(20)} 源 ${String(a).padStart(4)}  目标 ${String(b).padStart(4)}${flag}`);
  }

  // 品牌类配置（system_settings 白名单）也会被覆盖，这里一并预览
  for (const k of SITE_SETTING_KEYS) {
    const a = one(src, `SELECT setting_value FROM system_settings WHERE setting_key='${k}'`);
    const b = one(dst, `SELECT setting_value FROM system_settings WHERE setting_key='${k}'`);
    if (a === undefined) { console.log(`    ${k.padEnd(20)} 源库无此键，跳过`); continue; }
    const flag = String(a) === String(b) ? '' : `  ${C.y}← 将改为${C.r}`;
    console.log(`    ${k.padEnd(20)} ${String(b).slice(0, 24)}  →  ${String(a).slice(0, 24)}${flag}`);
  }

  // 业务数据现状（同步后应当一字不变）
  const bizBefore = {};
  for (const t of PROTECTED) {
    if (tableExists(dst, t)) bizBefore[t] = one(dst, `SELECT COUNT(*) FROM ${t}`);
  }

  if (dryRun) {
    console.log(`\n${C.g}${C.b}  --dry-run：以上为差异预览，未写入任何内容。${C.r}\n`);
    return;
  }

  say('4/5  备份目标库');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backup = path.join(BACKUP_DIR, `broadband_os.db.pre-content-sync.${stamp}`);
  fs.copyFileSync(dstPath, backup);
  ok(`已备份 → ${path.relative(ROOT, backup)}`);
  info(`回滚：cp "${backup}" "${dstPath}"`);

  say('5/5  写入内容域');
  dst.run('BEGIN');
  try {
    // 内容设置：整表替换，但保留目标库的共享令牌
    // 键名来自本文件内部常量（不是外部输入），直接内联安全；
    // ⚠️ 不能用 db.exec + `IN (?)` —— exec 不支持参数绑定，会静默查不到行。
    const keepIn = CONTENT_SETTINGS_KEEP.map((k) => `'${k}'`).join(',');
    const keepRows = rows(dst,
      `SELECT key, value, grp, updated_at FROM content_settings WHERE key IN (${keepIn})`
    );
    dst.run('DELETE FROM content_settings');
    const cols = columns(src, 'content_settings');
    const srcRows = rows(src, `SELECT ${cols.join(', ')} FROM content_settings`);
    const keepKeys = CONTENT_SETTINGS_KEEP;
    const stmtIns = dst.prepare(`INSERT INTO content_settings (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(',')})`);
    for (const r of srcRows) {
      if (keepKeys.indexOf(r[0]) >= 0) continue;   // 目标库自己那份令牌不进来源覆盖
      stmtIns.run(r);
    }
    stmtIns.free();
    for (const r of keepRows) {
      stmtIns2(dst, `INSERT INTO content_settings (key, value, grp, updated_at) VALUES (?,?,?,?)`, r);
    }
    ok(`content_settings 已同步（保留 ${CONTENT_SETTINGS_KEEP.join(', ')}）`);

    // 内容数据表：整表替换
    for (const t of CONTENT_TABLES) {
      const c = columns(src, t);
      const data = rows(src, `SELECT ${c.join(', ')} FROM ${t}`);
      dst.run(`DELETE FROM ${t}`);
      const st = dst.prepare(`INSERT INTO ${t} (${c.join(', ')}) VALUES (${c.map(() => '?').join(',')})`);
      for (const r of data) st.run(r);
      st.free();
      info(`${t} ← ${data.length} 行`);
    }

    // 站点配置白名单
    for (const k of SITE_SETTING_KEYS) {
      const v = one(src, `SELECT setting_value FROM system_settings WHERE setting_key='${k}'`);
      if (v === undefined) { warn(`源库没有 system_settings.${k}，跳过`); continue; }
      dst.run("UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key=?", v, k);
      info(`system_settings.${k} ← ${String(v).slice(0, 60)}`);
    }

    dst.run('COMMIT');
  } catch (e) {
    try { dst.run('ROLLBACK'); } catch (_) {}
    die(`写入失败，已回滚（目标库未改动）：${e.message}\n    备份仍在：${backup}`);
  }

  fs.writeFileSync(dstPath, Buffer.from(dst.export()));
  ok(`已写入 ${path.relative(ROOT, dstPath)}`);

  // 收尾校验：业务表必须一字不变
  const dst2 = openDb(SQL, dstPath);
  let drift = [];
  for (const t of PROTECTED) {
    if (!tableExists(dst2, t)) continue;
    const now = one(dst2, `SELECT COUNT(*) FROM ${t}`);
    if (String(now) !== String(bizBefore[t])) drift.push(`${t}: ${bizBefore[t]} → ${now}`);
  }
  console.log('');
  if (drift.length) {
    warn(`业务数据行数发生变化（请核对是否预期）：\n      ${drift.join('\n      ')}`);
    warn(`如需回滚：cp "${backup}" "${dstPath}"`);
  } else {
    ok('业务数据零变化（客户 / 合同 / 线路 / 节点 / 员工 / 线索 全部原样）');
  }
  ok(`内容版本 content.version = ${one(dst2, "SELECT value FROM content_settings WHERE key='content.version'")}`);

  console.log(`\n${C.g}${C.b}  同步完成。${C.r} 别忘了启服务：${C.c}pm2 start onlystyle-api${C.r}\n`);
})().catch((e) => { console.error(`${C.e}FATAL${C.r}`, e && e.message ? e.message : e); process.exit(2); });

/** 小工具：单行 INSERT（避免 prepare 的样板重复） */
function stmtIns2(db, sql, row) {
  const st = db.prepare(sql);
  st.run(row);
  st.free();
}
