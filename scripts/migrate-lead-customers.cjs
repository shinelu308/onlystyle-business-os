#!/usr/bin/env node
'use strict';
/**
 * 一次性数据迁移：把「官网线索被误建成客户」的记录退回线索池
 *
 * 背景
 * ---------------------------------------------------------------
 * 旧版 POST /api/leads 在「手机号没命中已有客户、但填了公司名」时，
 * 会直接往 customers 插一条 cust_type='官网线索' 的记录。
 * 于是**未签约的线索变成了「客户」**：混进客户管理列表、被算进数据看板的
 * 「在管客户总数」。用户反馈的就是这个。
 *
 * 现在流程已经改掉（线索只进 leads 表，人工点「转为客户」才建客户），
 * 本脚本负责把**存量**清干净。
 *
 * 判定与处理
 * ---------------------------------------------------------------
 * 命中条件（两个都满足才动）：
 *   ① customers.cust_type = '官网线索'
 *   ② 该客户**一张合同都没有**（有合同 = 后来真的签约了，是真客户，必须保留）
 * 处理：
 *   · 删除这些客户行（它们本就是流程副作用，不是人手工建的）
 *   · 把引用了它们的 leads.customer_id 清空 → 线索回到「未归因」，
 *     可在后台「客户线索」页点「转为客户」重新建档
 *   · 不丢信息：公司名/称呼/电话/需求本来就都还留在 leads 自己那一行里
 *
 * 安全设计
 * ---------------------------------------------------------------
 * · 默认 **dry-run**，只打印将发生什么；要真改必须显式加 --apply
 * · --apply 前自动把整库备份到 backups/
 * · 动态扫描所有含 customer_id 列的表，只要存在别的引用就**拒绝删除**
 *   （现在只有 contracts/leads，将来加表也不会踩雷）
 * · 改动只发生在内存里，最后一次性写盘 —— 中途任何异常都不会留下半成品库
 *
 * ⚠️ 必须在**停掉 onlystyle-api 之后**执行：
 *    接口用 sql.js，进程内存里有一份整库副本，运行期间改文件会被它下次写盘整个覆盖掉。
 *    顺序：pm2 stop onlystyle-api → 跑本脚本 → pm2 start onlystyle-api
 *
 * 用法
 *   node scripts/migrate-lead-customers.cjs            # 预演（只看不改）
 *   node scripts/migrate-lead-customers.cjs --apply    # 真正执行
 *
 * 注：数据访问直接走项目自带的 sql.js，不用 sqlite3 命令行 ——
 *     本机 sqlite3 是 3.26（2018 年），不支持 -json，脚本会被版本差异搞挂。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB = path.join(ROOT, 'biz-os', 'backend', 'broadband_os.db');
const SQLJS_DIR = path.join(ROOT, 'biz-os', 'backend', 'node_modules', 'sql.js', 'dist');
const LEGACY_TYPE = '官网线索';

const C = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' };
const ok = (m) => console.log(`${C.g}✓${C.x} ${m}`);
const info = (m) => console.log(`${C.d}${m}${C.x}`);
const warn = (m) => console.log(`${C.y}!${C.x} ${m}`);
function die(m) { console.error(`${C.r}✗ ${m}${C.x}`); process.exit(1); }

/** 打开数据库（整库读进内存；改动只在内存，最后 save 才落盘） */
async function openDb() {
  if (!fs.existsSync(SQLJS_DIR)) die('找不到 sql.js：' + path.join('biz-os/backend/node_modules/sql.js/dist'));
  const initSqlJs = require(path.join(SQLJS_DIR, 'sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: (f) => path.join(SQLJS_DIR, f) });
  return new SQL.Database(fs.readFileSync(DB));
}

/** 查库 → 对象数组（sql.js 的 exec 只给 columns + values，这里组装成对象） */
function q(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const o = {};
    columns.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

/** SQL 字符串字面量转义（值都是我们自己写的，但仍按规范转义） */
const lit = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";

async function main() {
  const apply = process.argv.indexOf('--apply') >= 0;

  if (!fs.existsSync(DB)) die('找不到数据库：' + DB);

  console.log('');
  info(`数据库  ${DB}`);
  info(`模式    ${apply ? 'APPLY（会真的改库）' : 'DRY-RUN（只看不改，加 --apply 才执行）'}`);
  console.log('');

  const db = await openDb();

  // ---- 1. 找出所有 legacy 客户，区分「有合同（保留）/ 无合同（退回线索池）」----
  const rows = q(db, `
    SELECT c.customer_id, c.company_name, c.contact_person, c.contact_phone, c.created_at,
           (SELECT COUNT(*) FROM contracts ct WHERE ct.customer_id = c.customer_id) AS contracts,
           (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.customer_id) AS leads
    FROM customers c
    WHERE c.cust_type = ${lit(LEGACY_TYPE)}
    ORDER BY c.created_at
  `);

  if (!rows.length) {
    ok(`没有 cust_type='${LEGACY_TYPE}' 的客户 —— 数据已经是干净的，无需迁移。`);
    console.log('');
    return;
  }

  const toDelete = rows.filter((r) => !r.contracts);
  const toKeep = rows.filter((r) => r.contracts);

  console.log(`命中 cust_type='${LEGACY_TYPE}' 的客户共 ${rows.length} 条：`);
  console.log('');
  rows.forEach((r) => {
    const tag = r.contracts
      ? `${C.g}[保留]${C.x} 有 ${r.contracts} 张合同 → 是真客户`
      : `${C.y}[退回]${C.x} 无合同`;
    console.log(`  ${tag}  ${r.customer_id}  ${r.company_name}  ${r.contact_person || '-'} / ${r.contact_phone || '-'}  (${r.created_at || '-'})  关联线索 ${r.leads} 条`);
  });
  console.log('');

  if (!toDelete.length) {
    ok('需要退回的全都有合同，没有可迁移的数据。');
    console.log('');
    return;
  }

  // ---- 2. 动态检查：还有没有别的表引用这些客户 ----
  const ids = toDelete.map((r) => lit(r.customer_id)).join(',');
  const tables = q(db, "SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
  const blockers = [];
  for (const t of tables) {
    if (t === 'leads' || t === 'customers') continue;   // 这两张表本就要处理
    const cols = q(db, `PRAGMA table_info(${t})`).map((c) => c.name);
    if (cols.indexOf('customer_id') < 0) continue;
    const n = q(db, `SELECT COUNT(*) AS c FROM ${t} WHERE customer_id IN (${ids})`)[0].c;
    if (n > 0) blockers.push(`${t}（${n} 行引用）`);
  }
  if (blockers.length) {
    warn(`检测到其它引用，已中止以免破坏数据：${blockers.join('、')}`);
    warn('请先决定这些引用怎么处理，再改本脚本。');
    process.exit(1);
  }
  ok(`引用检查通过：除 leads 外没有其它表引用这 ${toDelete.length} 个客户`);

  // ---- 3. dry-run 到此为止 ----
  if (!apply) {
    console.log('');
    info('DRY-RUN 结束。将执行的动作：');
    info(`  · 删除 ${toDelete.length} 条客户行`);
    info('  · 把指向它们的 leads.customer_id 清空（线索回到「未归因」）');
    info('  · 备份整库到 backups/');
    console.log('');
    console.log(`  ${C.c}确认无误后重跑：node scripts/migrate-lead-customers.cjs --apply${C.x}`);
    console.log('');
    return;
  }

  // ---- 4. 备份（写盘之前先备份原文件）----
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const bkDir = path.join(ROOT, 'backups');
  fs.mkdirSync(bkDir, { recursive: true });
  const bk = path.join(bkDir, `broadband_os.db.pre-lead-migration.${ts}`);
  fs.copyFileSync(DB, bk);
  ok(`已备份 → ${path.relative(ROOT, bk)}`);

  // ---- 5. 执行（内存里做，失败就丢弃、文件一个字节都不变）----
  const before = {
    customers: q(db, 'SELECT COUNT(*) AS c FROM customers')[0].c,
    legacy: q(db, `SELECT COUNT(*) AS c FROM customers WHERE cust_type = ${lit(LEGACY_TYPE)}`)[0].c,
    attributedLeads: q(db, "SELECT COUNT(*) AS c FROM leads WHERE customer_id <> ''")[0].c,
  };

  try {
    db.run('BEGIN');
    db.run(`UPDATE leads SET customer_id = '' WHERE customer_id IN (${ids})`);
    db.run(`DELETE FROM customers WHERE customer_id IN (${ids})`);
    db.run('COMMIT');
  } catch (e) {
    die('执行失败（内存改动已丢弃，数据库文件未改动）：' + e.message);
  }

  const after = {
    customers: q(db, 'SELECT COUNT(*) AS c FROM customers')[0].c,
    legacy: q(db, `SELECT COUNT(*) AS c FROM customers WHERE cust_type = ${lit(LEGACY_TYPE)}`)[0].c,
    attributedLeads: q(db, "SELECT COUNT(*) AS c FROM leads WHERE customer_id <> ''")[0].c,
  };

  // ---- 6. 一次性落盘 ----
  fs.writeFileSync(DB, Buffer.from(db.export()));

  console.log('');
  ok(`迁移完成：删除 ${toDelete.length} 条误建客户`);
  info(`  客户表        ${before.customers} → ${after.customers}`);
  info(`  其中官网线索  ${before.legacy} → ${after.legacy}（应为 0）`);
  info(`  仍归因的线索  ${before.attributedLeads} → ${after.attributedLeads}（老客户来询的正常归因，保留）`);
  if (toKeep.length) info(`  保留的真客户  ${toKeep.length} 条（有合同）`);
  console.log('');
  info('回滚：pm2 stop onlystyle-api && ' +
       `cp ${path.relative(ROOT, bk)} biz-os/backend/broadband_os.db && pm2 start onlystyle-api`);
  console.log('');
}

main().catch((e) => die(e.message));
