const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'broadband_os.db');

let _db = null;
let _SQL = null;

/**
 * SQL.js 数据库包装器，提供类似 better-sqlite3 的 API
 */
class DatabaseWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
  }

  // 执行 DDL / 无参数查询
  exec(sql) {
    this._db.exec(sql);
  }

  // 查询所有行，返回对象数组
  all(sql, ...params) {
    const stmt = this._db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  // 查询单行，返回对象或 undefined
  get(sql, ...params) {
    const rows = this.all(sql, ...params);
    return rows.length > 0 ? rows[0] : undefined;
  }

  // 执行 INSERT/UPDATE/DELETE，不返回行
  run(sql, ...params) {
    try {
      if (params.length > 0) {
        // SQL.js v1.10+ 的 db.run() 直接支持 params 数组，且会正确抛出异常
        this._db.run(sql, params);
      } else {
        this._db.run(sql);
      }
    } catch (e) {
      // 确保抛出异常，让上层 catch 捕获
      throw e;
    }
    // 自动保存到文件
    this.save();
  }

  // 持久化到磁盘
  save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

async function initializeDatabase() {
  if (_db) return _db;

  _SQL = await initSqlJs();

  // ========== 安全机制：自动备份 ==========
  // 每次启动时，将现有 DB 备份为 .backup 文件
  // 即使意外删除主库，也可从备份还原
  if (fs.existsSync(DB_PATH)) {
    var backupPath = DB_PATH + '.' + new Date().toISOString().split('T')[0] + '.backup';
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(DB_PATH, backupPath);
      console.log('[DB] 已自动备份到 ' + backupPath);
    }
  }

  // 如果存在旧数据库，加载它
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new _SQL.Database(fileBuffer);
  } else {
    sqlDb = new _SQL.Database();
  }

  _db = new DatabaseWrapper(sqlDb);
  initSchema();

  // ========== 内容运营域（官网/小程序/公众号的内容源）==========
  // 与宽带业务完全解耦：只加自己的表，不动存量任何一张表。
  // 用 try 包住 —— 内容域出问题不能拖垮主业务启动。
  try {
    var contentSchema = require('./content-schema');
    contentSchema.initContentSchema(_db);
    contentSchema.seedContent(_db);
    contentSchema.migrateContentPermissions(_db);
  } catch (e) {
    console.error('[Content] 内容域初始化失败（不影响主业务）:', e.message);
  }

  // 迁移：将旧版 associated_line 转为 project_lines 多对多
  var plCount = _db.get('SELECT COUNT(*) as c FROM project_lines');
  if (!plCount || plCount.c === 0) {
    var nodes = _db.all("SELECT node_id, associated_line FROM spatial_nodes WHERE associated_line IS NOT NULL AND associated_line != ''");
    for (var ni = 0; ni < nodes.length; ni++) {
      _db.run('INSERT OR IGNORE INTO project_lines (node_id, line_id) VALUES (?, ?)', nodes[ni].node_id, nodes[ni].associated_line);
    }
    if (nodes.length > 0) console.log('[Migrate] project_lines 迁移完成: ' + nodes.length + ' 条');
  }

  // 迁移：为 customers 表添加 address 列（兼容旧数据库）
  try { _db.run("ALTER TABLE customers ADD COLUMN address TEXT DEFAULT ''"); } catch(e) { /* 已存在则忽略 */ }

  // 迁移：为 contracts 表添加 billing_cycle 列（月费/季费/年费）
  try { _db.run("ALTER TABLE contracts ADD COLUMN billing_cycle TEXT DEFAULT '月'"); } catch(e) { /* 已存在则忽略 */ }
  // 迁移：为 contracts 表添加 renewed_from 列（续约来源合同ID，用于撤销续约）
  try { _db.run("ALTER TABLE contracts ADD COLUMN renewed_from TEXT DEFAULT NULL"); } catch(e) { /* 已存在则忽略 */ }
  // 迁移：为 supplier_lines 表添加设备照片、安装位置、备注列
  try { _db.run("ALTER TABLE supplier_lines ADD COLUMN device_photos TEXT DEFAULT '[]'"); } catch(e) { /* 已存在则忽略 */ }
  try { _db.run("ALTER TABLE supplier_lines ADD COLUMN install_location TEXT DEFAULT ''"); } catch(e) { /* 已存在则忽略 */ }
  try { _db.run("ALTER TABLE supplier_lines ADD COLUMN remarks TEXT DEFAULT ''"); } catch(e) { /* 已存在则忽略 */ }
  // 迁移：移除 staff 表 role 字段的 CHECK 约束（支持自定义角色名称如"技术"）
  try {
    _db.run("ALTER TABLE staff RENAME TO staff_old");
    _db.exec(`
      CREATE TABLE staff (
        staff_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        dept_id TEXT,
        position TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'operator',
        status TEXT DEFAULT 'active' CHECK(status IN ('active','disabled')),
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
      );
    `);
    _db.run("INSERT INTO staff SELECT * FROM staff_old");
    _db.run("DROP TABLE staff_old");
    console.log('[Migrate] staff 表 role 约束已移除，支持自定义角色');
  } catch(e) { /* 表可能已被迁移 */ }
  // 迁移：为 staff 表添加 wechat_openid 字段
  try { _db.run("ALTER TABLE staff ADD COLUMN wechat_openid TEXT DEFAULT ''"); console.log('[Migrate] staff 表添加 wechat_openid 列'); } catch(e) { /* 已存在则忽略 */ }

  seedData();

  // 迁移：确保所有默认系统设置存在（兼容新增配置项）
  ensureDefaultSettings();

  // 启动时实时更新所有合同到期状态（兼容手动创建/导入/编辑后的状态校正）
  updateContractStatuses();
  console.log('[DB] 合同到期状态已更新');

  return _db;
}

function getDatabase() {
  if (!_db) throw new Error('数据库未初始化，请先调用 initializeDatabase()');
  return _db;
}

function initSchema() {
  // 启用外键约束
  _db.run('PRAGMA foreign_keys = ON');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_lines (
      line_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK(provider IN ('中国电信','中国联通','中国移动')),
      circuit_number TEXT NOT NULL,
      total_bandwidth INTEGER NOT NULL,
      purchase_date TEXT NOT NULL,
      expire_date TEXT NOT NULL,
      cost_annual REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS spatial_nodes (
      node_id TEXT PRIMARY KEY,
      node_name TEXT NOT NULL,
      node_type TEXT NOT NULL CHECK(node_type IN ('园区','单体楼宇','独立散点')),
      associated_line TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 项目-线路 多对多关联表（支持一个项目绑定多条线路）
    CREATE TABLE IF NOT EXISTS project_lines (
      node_id TEXT NOT NULL,
      line_id TEXT NOT NULL,
      PRIMARY KEY (node_id, line_id),
      FOREIGN KEY (node_id) REFERENCES spatial_nodes(node_id) ON DELETE CASCADE,
      FOREIGN KEY (line_id) REFERENCES supplier_lines(line_id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      customer_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      cust_type TEXT NOT NULL DEFAULT '',
      parent_id TEXT,
      wechat_openid TEXT,
      contact_person TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (parent_id) REFERENCES customers(customer_id)
    );

    CREATE TABLE IF NOT EXISTS contracts (
      contract_id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      biz_type TEXT NOT NULL CHECK(biz_type IN ('宽带自运营','宽带直售','IT外包')),
      node_id TEXT,
      allocated_bw INTEGER,
      start_date TEXT NOT NULL,
      duration_months INTEGER NOT NULL,
      end_date TEXT NOT NULL,
      monthly_fee REAL DEFAULT 0,
      status TEXT DEFAULT '进行中' CHECK(status IN ('进行中','即将到期','已到期','已续约')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
      FOREIGN KEY (node_id) REFERENCES spatial_nodes(node_id)
    );

    CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
    CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_spatial_nodes_line ON spatial_nodes(associated_line);
    CREATE INDEX IF NOT EXISTS idx_customers_parent ON customers(parent_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_lines_expire ON supplier_lines(expire_date);
    CREATE INDEX IF NOT EXISTS idx_project_lines_node ON project_lines(node_id);
    CREATE INDEX IF NOT EXISTS idx_project_lines_line ON project_lines(line_id);

    -- ========== 组织架构 & 人员管理 ==========
    CREATE TABLE IF NOT EXISTS departments (
      dept_id TEXT PRIMARY KEY,
      dept_name TEXT NOT NULL,
      parent_id TEXT,
      dept_head TEXT DEFAULT '',
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','disabled')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (parent_id) REFERENCES departments(dept_id)
    );

    CREATE TABLE IF NOT EXISTS staff (
      staff_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      dept_id TEXT,
      position TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'operator',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','disabled')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
    );

    CREATE INDEX IF NOT EXISTS idx_staff_dept ON staff(dept_id);
    CREATE INDEX IF NOT EXISTS idx_staff_username ON staff(username);
    CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id);

    -- ========== 系统设置 ==========
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT DEFAULT '',
      setting_group TEXT NOT NULL DEFAULT 'general',
      description TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

function seedData() {
  // ⚠️ 安全检测：只有当所有主表都为空时才插入演示数据
  // 只要有任何用户数据存在，就绝不覆盖
  var lineCount = _db.get('SELECT COUNT(*) as c FROM supplier_lines');
  var nodeCount = _db.get('SELECT COUNT(*) as c FROM spatial_nodes');
  var custCount = _db.get('SELECT COUNT(*) as c FROM customers');
  if ((lineCount && lineCount.c > 0) || (nodeCount && nodeCount.c > 0) || (custCount && custCount.c > 0)) {
    console.log('[DB] 检测到已有数据，跳过演示数据插入 (lines=' + (lineCount?lineCount.c:0) + ', nodes=' + (nodeCount?nodeCount.c:0) + ', customers=' + (custCount?custCount.c:0) + ')');
    return;
  }

  console.log('[Seed] 初始化演示数据...');

  // 运营商大线
  const lines = [
    ['LINE-2026-001', '中国电信', 'SZ-TEL-10G-005', 10000, '2026-01-01', '2026-07-16', 120000],
    ['LINE-2026-002', '中国联通', 'GZ-UNI-5G-012', 5000, '2026-03-01', '2026-09-01', 60000],
    ['LINE-2026-003', '中国移动', 'BJ-CM-1G-008', 1000, '2026-05-01', '2027-05-01', 18000],
    ['LINE-2026-004', '中国电信', 'SZ-TEL-1G-020', 1000, '2026-02-01', '2026-06-20', 24000],
    ['LINE-2026-005', '中国联通', 'SH-UNI-500M-003', 500, '2026-04-15', '2026-07-01', 12000]
  ];
  for (const l of lines) {
    _db.run('INSERT INTO supplier_lines (line_id, provider, circuit_number, total_bandwidth, purchase_date, expire_date, cost_annual) VALUES (?,?,?,?,?,?,?)', ...l);
  }

  // 空间节点
  const nodes = [
    ['NODE-001', '深圳南山科技园A区', '园区', 'LINE-2026-001'],
    ['NODE-002', '深圳南山科技园B区', '园区', 'LINE-2026-001'],
    ['NODE-003', '东方大厦', '单体楼宇', 'LINE-2026-002'],
    ['NODE-004', '广州天河商务中心', '单体楼宇', 'LINE-2026-002'],
    ['NODE-005', '北京望京SOHO', '单体楼宇', 'LINE-2026-003'],
    ['NODE-006', '上海浦东张江机房', '独立散点', 'LINE-2026-005'],
    ['NODE-007', '深圳福田华强北商铺', '独立散点', 'LINE-2026-004']
  ];
  for (const n of nodes) {
    _db.run('INSERT INTO spatial_nodes (node_id, node_name, node_type, associated_line) VALUES (?,?,?,?)', ...n);
  }

  // 项目-线路关联（多对多 seed）
  const projectLines = [
    ['NODE-001', 'LINE-2026-001'],
    ['NODE-001', 'LINE-2026-005'],  // 双线路示例
    ['NODE-002', 'LINE-2026-001'],
    ['NODE-003', 'LINE-2026-002'],
    ['NODE-004', 'LINE-2026-002'],
    ['NODE-005', 'LINE-2026-003'],
    ['NODE-006', 'LINE-2026-005'],
    ['NODE-007', 'LINE-2026-004']
  ];
  for (const pl of projectLines) {
    _db.run('INSERT INTO project_lines (node_id, line_id) VALUES (?,?)', ...pl);
  }

  // 客户主体（含连锁母子结构）
  const customers = [
    ['CUST-001', '美味连锁餐饮总部', '连锁店', null, 'oUpSzwAAAA', '王总', '13800001111', '深圳市南山区科技园南区R2-B栋8楼'],
    ['CUST-002', '美味连锁餐饮（南山店）', '连锁店', 'CUST-001', 'oUpSzwBBBB', '李店长', '13800002222', '深圳市南山区海岸城购物中心B1-08'],
    ['CUST-003', '美味连锁餐饮（福田店）', '连锁店', 'CUST-001', 'oUpSzwCCCC', '张店长', '13800003333', '深圳市福田区COCO Park北区L1-12'],
    ['CUST-004', '星际科技有限公司', '园区租户', null, 'oUpSzwDDDD', '赵总', '13800004444', '深圳南山科技园A区A1栋12楼'],
    ['CUST-005', '云端数据技术公司', '园区租户', null, 'oUpSzwEEEE', '钱总', '13800005555', '深圳南山科技园A区A2栋5楼'],
    ['CUST-006', '智慧教育集团', '园区租户', null, 'oUpSzwFFFF', '孙总', '13800006666', '深圳南山科技园B区B3栋20楼'],
    ['CUST-007', '创新科技工作室', '散客', null, null, '周生', '13800007777', '深圳市福田区华强北赛格广场12C'],
    ['CUST-008', '星巴克咖啡（科技园店）', '园区租户', null, 'oUpSzwGGGG', '陈店长', '13800008888', '深圳南山科技园A区A1栋1楼大厅'],
    ['CUST-009', '好邻连锁超市总部', '连锁店', null, 'oUpSzwHHHH', '刘总', '13800009999', '广州市天河区天河路228号广晟大厦18楼'],
    ['CUST-010', '好邻连锁超市（宝安店）', '连锁店', 'CUST-009', 'oUpSzwIIII', '吴店长', '13800010001', '深圳市宝安区宝安中心区壹方城B2-01'],
    ['CUST-011', '华强北赛格大厦', '楼宇', null, null, '物业部', '13800011111', '深圳市福田区华强北路1002号']
  ];
  for (const c of customers) {
    _db.run('INSERT INTO customers (customer_id, company_name, cust_type, parent_id, wechat_openid, contact_person, contact_phone, address) VALUES (?,?,?,?,?,?,?,?)', ...c);
  }

  // 业务合同
  const contracts = [
    ['HT-2026-001', 'CUST-004', '宽带自运营', 'NODE-001', 100, '2025-06-18', 12, '2026-06-18', 3000, '即将到期'],
    ['HT-2026-002', 'CUST-005', '宽带自运营', 'NODE-001', 200, '2025-06-23', 12, '2026-06-23', 5000, '即将到期'],
    ['HT-2026-003', 'CUST-006', '宽带自运营', 'NODE-002', 150, '2025-07-16', 12, '2026-07-16', 4000, '即将到期'],
    ['HT-2026-004', 'CUST-002', '宽带直售', 'NODE-001', 50, '2026-03-01', 24, '2028-03-01', 1500, '进行中'],
    ['HT-2026-005', 'CUST-003', '宽带直售', 'NODE-007', 30, '2026-04-01', 12, '2027-04-01', 800, '进行中'],
    ['HT-2026-006', 'CUST-001', 'IT外包', null, null, '2026-01-01', 12, '2026-12-31', 10000, '进行中'],
    ['HT-2026-007', 'CUST-007', '宽带直售', 'NODE-006', 100, '2025-05-01', 12, '2026-05-01', 2000, '已到期'],
    ['HT-2026-008', 'CUST-008', '宽带自运营', 'NODE-001', 80, '2025-06-01', 12, '2026-06-01', 2500, '已到期']
  ];
  for (const ct of contracts) {
    _db.run('INSERT INTO contracts (contract_id, customer_id, biz_type, node_id, allocated_bw, start_date, duration_months, end_date, monthly_fee, status) VALUES (?,?,?,?,?,?,?,?,?,?)', ...ct);
  }

  // ===== 组织架构 =====
  const deptCount = _db.get('SELECT COUNT(*) as c FROM departments');
  if (!deptCount || deptCount.c === 0) {
    const depts = [
      ['DEPT-001', '总经办', null, '系统管理员', '公司最高管理层', 1],
      ['DEPT-002', '运营部', 'DEPT-001', '张经理', '负责日常运营与客户服务', 2],
      ['DEPT-003', '技术部', 'DEPT-001', '李主管', '负责网络维护与技术支持', 3],
      ['DEPT-004', '销售部', 'DEPT-001', '王经理', '负责业务拓展与客户签约', 4],
      ['DEPT-005', '财务部', 'DEPT-001', '刘总监', '负责财务核算与成本管控', 5],
      ['DEPT-006', '客服组', 'DEPT-002', '陈组长', '客户咨询与投诉处理', 6],
      ['DEPT-007', '运维组', 'DEPT-003', '赵组长', '网络运维与故障处理', 7],
      ['DEPT-008', '政企销售组', 'DEPT-004', '周组长', '政企客户销售', 8],
      ['DEPT-009', '园区销售组', 'DEPT-004', '吴组长', '园区客户销售', 9]
    ];
    for (const d of depts) {
      _db.run('INSERT INTO departments (dept_id, dept_name, parent_id, dept_head, description, sort_order) VALUES (?,?,?,?,?,?)', ...d);
    }
    console.log('[Seed] 组织架构数据初始化完成');
  }

  // ===== 人员账号 =====
  const staffCount = _db.get('SELECT COUNT(*) as c FROM staff');
  if (!staffCount || staffCount.c === 0) {
    const staffs = [
      ['STAFF-001', '系统管理员', 'admin', 'admin123', '13800000001', 'admin@bos.com', 'DEPT-001', '系统管理员', 'admin'],
      ['STAFF-002', '张经理', 'zhang', '123456', '13800000002', 'zhang@bos.com', 'DEPT-002', '运营经理', 'manager'],
      ['STAFF-003', '李主管', 'li', '123456', '13800000003', 'li@bos.com', 'DEPT-003', '技术主管', 'manager'],
      ['STAFF-004', '王经理', 'wang', '123456', '13800000004', 'wang@bos.com', 'DEPT-004', '销售经理', 'manager'],
      ['STAFF-005', '刘总监', 'liucw', '123456', '13800000005', 'liucw@bos.com', 'DEPT-005', '财务总监', 'manager'],
      ['STAFF-006', '陈组长', 'chen', '123456', '13800000006', 'chen@bos.com', 'DEPT-006', '客服组长', 'operator'],
      ['STAFF-007', '赵组长', 'zhao', '123456', '13800000007', 'zhao@bos.com', 'DEPT-007', '运维组长', 'operator'],
      ['STAFF-008', '周组长', 'zhou', '123456', '13800000008', 'zhou@bos.com', 'DEPT-008', '销售组长', 'operator'],
      ['STAFF-009', '吴组长', 'wu', '123456', '13800000009', 'wu@bos.com', 'DEPT-009', '销售组长', 'operator'],
      ['STAFF-010', '孙客服', 'sun', '123456', '13800000010', 'sun@bos.com', 'DEPT-006', '客服专员', 'viewer']
    ];
    for (const s of staffs) {
      _db.run('INSERT INTO staff (staff_id, name, username, password, phone, email, dept_id, position, role) VALUES (?,?,?,?,?,?,?,?,?)', ...s);
    }
    console.log('[Seed] 人员账号数据初始化完成');
  }

  // ===== 系统设置 =====
  const settingCount = _db.get('SELECT COUNT(*) as c FROM system_settings');
  if (!settingCount || settingCount.c === 0) {
    const settings = [
      // 常规配置
      ['site_name', '智能业务管理系统 (BOS)', 'general', '系统名称'],
      ['site_abbreviation', 'BOS', 'general', '系统缩写'],
      ['company_name', 'XX宽带技术服务有限公司', 'general', '公司名称'],
      ['logo_url', '', 'general', 'Logo 图片 URL'],
      ['logo_subtitle', '智能业务管理', 'general', 'Logo 副标题'],
      ['reminder_days_before', '30', 'general', '到期提前提醒天数'],
      ['auto_renew_enabled', 'true', 'general', '自动续约提醒开关'],
      ['cron_schedule', '0 9 * * *', 'general', '定时任务Cron表达式'],
      // 微信配置
      ['wechat_appid', 'wx0000000000000000', 'wechat', '微信公众号AppID'],
      ['wechat_appsecret', '', 'wechat', '微信公众号AppSecret'],
      ['wechat_template_id_expire', 'XXXXXXXXX_template_expire', 'wechat', '到期提醒模板ID'],
      ['wechat_template_id_renew', 'XXXXXXXXX_template_renew', 'wechat', '续约成功模板ID'],
      ['wecom_webhook_url', 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxx', 'wechat', '企微机器人Webhook'],
      ['wechat_redirect_uri', 'https://bos.example.com/wechat/callback', 'wechat', '微信OAuth回调地址'],
      ['wechat_token', '', 'wechat', '微信服务器配置Token（用于回调验证）'],
      // 业务配置
      ['customer_types', '["园区租户","连锁店","散客","楼宇"]', 'biz', '客户分类（JSON数组）'],
      ['contract_biz_types', '["宽带自运营","宽带直售","IT外包"]', 'biz', '合同业务类型（JSON数组）']
    ];
    for (const s of settings) {
      _db.run('INSERT INTO system_settings (setting_key, setting_value, setting_group, description) VALUES (?,?,?,?)', ...s);
    }
    console.log('[Seed] 系统设置数据初始化完成');
  }

  console.log('[Seed] 演示数据初始化完成！');
}

/**
 * 确保所有默认系统设置项存在（兼容后续新增的配置项）
 */
function ensureDefaultSettings() {
  var defaults = [
    ['wechat_token', '', 'wechat', '微信服务器配置Token（用于回调验证）'],
    ['reminder_staff_contacts', '[]', 'wechat', '管理通知接收人（JSON数组：[{"name":"张三","openid":"","enabled":true}]）'],
    ['wechat_template_id_management', '', 'wechat', '管理通知模板ID（合并发送给管理人员的微信模板）'],
    ['reminder_advance_days', '[60,30,15,7,3,1]', 'general', '到期提前通知时间段（JSON数组，天）']
  ];
  for (var i = 0; i < defaults.length; i++) {
    var existing = _db.get('SELECT COUNT(*) as c FROM system_settings WHERE setting_key = ?', defaults[i][0]);
    if (!existing || existing.c === 0) {
      _db.run('INSERT INTO system_settings (setting_key, setting_value, setting_group, description) VALUES (?,?,?,?)', ...defaults[i]);
      console.log('[Migrate] 补充默认配置项: ' + defaults[i][0]);
    }
  }
}

function updateContractStatuses() {
  const today = new Date().toISOString().split('T')[0];
  _db.run(`UPDATE contracts SET status = '已到期', updated_at = datetime('now','localtime') WHERE end_date < ? AND status NOT IN ('已到期','已续约')`, today);
  _db.run(`UPDATE contracts SET status = '即将到期', updated_at = datetime('now','localtime') WHERE end_date >= ? AND end_date <= date(?, '+30 days') AND status NOT IN ('即将到期','已到期','已续约')`, today, today);
  _db.run(`UPDATE contracts SET status = '进行中', updated_at = datetime('now','localtime') WHERE end_date > date(?, '+30 days') AND status IN ('即将到期')`, today);
}

module.exports = { initializeDatabase, getDatabase, updateContractStatuses };
