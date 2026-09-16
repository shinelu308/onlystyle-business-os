const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');
const { generateXlsx, sendExcelResponse, parseImportData } = require('../services/csvService');

// 获取所有客户（含连锁关系），支持搜索，含合同过期状态
router.get('/', (req, res) => {
  const db = getDatabase();
  const { search } = req.query;
  const today = new Date().toISOString().split('T')[0];
  let sql = `
    SELECT c.*, p.company_name as parent_name
    FROM customers c
    LEFT JOIN customers p ON c.parent_id = p.customer_id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    sql += ' AND (c.customer_id LIKE ? OR c.company_name LIKE ? OR c.cust_type LIKE ? OR c.contact_person LIKE ? OR c.contact_phone LIKE ? OR c.address LIKE ?)';
    var like = '%' + search + '%';
    params.push(like, like, like, like, like, like);
  }
  sql += ' ORDER BY c.company_name';
  const rows = db.all(sql, ...params);

  // 为每个客户追加合同过期状态
  for (let i = 0; i < rows.length; i++) {
    const custId = rows[i].customer_id;
    const expiredCount = db.get("SELECT COUNT(*) as c FROM contracts WHERE customer_id = ? AND status = '已到期'", custId);
    const expiringCount = db.get("SELECT COUNT(*) as c FROM contracts WHERE customer_id = ? AND status = '即将到期'", custId);
    const activeCount = db.get("SELECT COUNT(*) as c FROM contracts WHERE customer_id = ? AND status IN ('进行中','已续约')", custId);
    const nearestEnd = db.get("SELECT end_date FROM contracts WHERE customer_id = ? AND end_date >= ? ORDER BY end_date ASC LIMIT 1", custId, today);
    rows[i].expired_contracts = (expiredCount && expiredCount.c) || 0;
    rows[i].expiring_contracts = (expiringCount && expiringCount.c) || 0;
    rows[i].active_contracts = (activeCount && activeCount.c) || 0;
    rows[i].nearest_end_date = nearestEnd ? nearestEnd.end_date : null;
  }

  res.json(rows);
});

// 获取可配置的客户分类
router.get('/config/types', (req, res) => {
  const db = getDatabase();
  const setting = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'customer_types'");
  if (setting && setting.setting_value) {
    try { res.json(JSON.parse(setting.setting_value)); return; }
    catch(e) { /* fall through */ }
  }
  res.json(['园区租户','连锁店','散客','楼宇']);
});

// 获取连锁店结构树
router.get('/tree', (req, res) => {
  const db = getDatabase();
  const parents = db.all("SELECT * FROM customers WHERE parent_id IS NULL ORDER BY company_name");
  const result = parents.map(p => {
    const children = db.all("SELECT * FROM customers WHERE parent_id = ? ORDER BY company_name", p.customer_id);
    return { ...p, children };
  });
  res.json(result);
});

// 客户全景视图
router.get('/:id/overview', (req, res) => {
  const db = getDatabase();
  const customer = db.get('SELECT * FROM customers WHERE customer_id = ?', req.params.id);
  if (!customer) return res.status(404).json({ error: '未找到该客户' });

  const branches = db.all('SELECT * FROM customers WHERE parent_id = ?', customer.customer_id);
  const contracts = db.all(`
    SELECT c.*, sn.node_name
    FROM contracts c
    LEFT JOIN spatial_nodes sn ON c.node_id = sn.node_id
    WHERE c.customer_id = ?
    ORDER BY c.end_date ASC
  `, customer.customer_id);

  res.json({ customer, branches, contracts });
});

// 导出 CSV
router.get('/export', async (req, res) => {
  const db = getDatabase();
  const rows = db.all('SELECT customer_id,company_name,cust_type,parent_id,contact_person,contact_phone,address FROM customers ORDER BY customer_id');
  var fields = ['customer_id', 'company_name', 'cust_type', 'parent_id', 'contact_person', 'contact_phone', 'address'];
  var data = rows.map(function(r) { return fields.map(function(f) { return r[f] || ''; }); });
  var buf = await generateXlsx(fields, data);
  sendExcelResponse(res, '客户管理_客户列表.xlsx', buf);
});

// 下载模板
router.get('/template', async (req, res) => {
  var fields = ['customer_id', 'company_name', 'cust_type', 'parent_id', 'contact_person', 'contact_phone', 'address'];
  var buf = await generateXlsx(fields, []);
  sendExcelResponse(res, '客户管理_导入模板.xlsx', buf);
});

// 导入 CSV 或 XLSX
router.post('/import', async (req, res) => {
  const db = getDatabase();
  const { csv, file, format } = req.body;
  if (!csv && !file) return res.status(400).json({ error: '缺少数据，请上传 CSV 或 XLSX 文件' });
  try {
    var records = await parseImportData(file || csv, format || 'csv');
    var imported = 0, errors = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r.customer_id || !r.company_name || !r.cust_type) {
        errors.push('第' + (i + 2) + '行: 缺少必填字段');
        continue;
      }
      try {
        db.run('INSERT INTO customers (customer_id, company_name, cust_type, parent_id, contact_person, contact_phone, address) VALUES (?,?,?,?,?,?,?)',
          r.customer_id, r.company_name, r.cust_type, r.parent_id || null, r.contact_person || '', r.contact_phone || '', r.address || '');
        imported++;
      } catch (e) {
        errors.push('第' + (i + 2) + '行: ' + e.message);
      }
    }
    res.json({ success: true, imported: imported, errors: errors });
  } catch (e) {
    res.status(400).json({ error: '数据解析失败: ' + e.message });
  }
});

// 获取单个客户
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const row = db.get(`
    SELECT c.*, p.company_name as parent_name
    FROM customers c
    LEFT JOIN customers p ON c.parent_id = p.customer_id
    WHERE c.customer_id = ?
  `, req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该客户' });
  res.json(row);
});

// 创建
router.post('/', (req, res) => {
  const db = getDatabase();
  const { customer_id, company_name, cust_type, parent_id, wechat_openid, contact_person, contact_phone, address } = req.body;
  if (!customer_id || !company_name || !cust_type) {
    return res.status(400).json({ error: '缺少必填字段' });
  }
  try {
    db.run('INSERT INTO customers (customer_id, company_name, cust_type, parent_id, wechat_openid, contact_person, contact_phone, address) VALUES (?,?,?,?,?,?,?,?)',
      customer_id, company_name, cust_type, parent_id || null, wechat_openid || null, contact_person || '', contact_phone || '', address || '');
    res.json({ success: true, customer_id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 更新
router.put('/:id', (req, res) => {
  const db = getDatabase();
  const { company_name, cust_type, parent_id, wechat_openid, contact_person, contact_phone, address } = req.body;
  try {
    db.run("UPDATE customers SET company_name=?, cust_type=?, parent_id=?, wechat_openid=?, contact_person=?, contact_phone=?, address=?, updated_at=datetime('now','localtime') WHERE customer_id=?",
      company_name, cust_type, parent_id || null, wechat_openid || null, contact_person || '', contact_phone || '', address || '', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  try {
    db.run('UPDATE customers SET parent_id = NULL WHERE parent_id = ?', req.params.id);
    db.run('DELETE FROM customers WHERE customer_id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 批量删除
router.post('/batch-delete', (req, res) => {
  const db = getDatabase();
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '缺少待删除ID列表' });
  }
  try {
    for (let i = 0; i < ids.length; i++) {
      db.run('UPDATE customers SET parent_id = NULL WHERE parent_id = ?', ids[i]);
      db.run('DELETE FROM customers WHERE customer_id = ?', ids[i]);
    }
    res.json({ success: true, count: ids.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
