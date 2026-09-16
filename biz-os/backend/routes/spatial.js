const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');
const { generateXlsx, sendExcelResponse, parseImportData } = require('../services/csvService');

// 获取所有空间节点（含多条线路信息），支持搜索
router.get('/', (req, res) => {
  const db = getDatabase();
  const { search } = req.query;
  let sql = 'SELECT sn.* FROM spatial_nodes sn WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (sn.node_id LIKE ? OR sn.node_name LIKE ? OR sn.node_type LIKE ?)';
    var like = '%' + search + '%';
    params.push(like, like, like);
  }
  sql += ' ORDER BY sn.node_name';
  const nodes = db.all(sql, ...params);
  // 为每个节点加载关联线路
  for (let i = 0; i < nodes.length; i++) {
    const lines = db.all(`
      SELECT sl.line_id, sl.provider, sl.circuit_number, sl.total_bandwidth, sl.expire_date as line_expire_date
      FROM project_lines pl
      JOIN supplier_lines sl ON pl.line_id = sl.line_id
      WHERE pl.node_id = ?
    `, nodes[i].node_id);
    nodes[i].lines = lines;
  }
  res.json(nodes);
});

// 导出 CSV
router.get('/export', async (req, res) => {
  const db = getDatabase();
  const rows = db.all('SELECT * FROM spatial_nodes ORDER BY node_id');
  var fields = ['node_id', 'node_name', 'node_type'];
  var data = rows.map(function(r) { return fields.map(function(f) { return r[f] || ''; }); });
  var buf = await generateXlsx(fields, data);
  sendExcelResponse(res, '项目管理_空间节点.xlsx', buf);
});

// 下载模板
router.get('/template', async (req, res) => {
  var fields = ['node_id', 'node_name', 'node_type'];
  var buf = await generateXlsx(fields, []);
  sendExcelResponse(res, '项目管理_导入模板.xlsx', buf);
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
      if (!r.node_id || !r.node_name || !r.node_type) {
        errors.push('第' + (i + 2) + '行: 缺少必填字段');
        continue;
      }
      try {
        db.run('INSERT INTO spatial_nodes (node_id, node_name, node_type) VALUES (?,?,?)',
          r.node_id, r.node_name, r.node_type);
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

// 获取单个节点
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const row = db.get('SELECT * FROM spatial_nodes WHERE node_id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该空间节点' });
  const lines = db.all(`
    SELECT sl.line_id, sl.provider, sl.circuit_number, sl.total_bandwidth, sl.expire_date as line_expire_date
    FROM project_lines pl
    JOIN supplier_lines sl ON pl.line_id = sl.line_id
    WHERE pl.node_id = ?
  `, row.node_id);
  row.lines = lines;
  res.json(row);
});

// 创建
router.post('/', (req, res) => {
  const db = getDatabase();
  const { node_id, node_name, node_type, lines } = req.body;
  if (!node_id || !node_name || !node_type) {
    return res.status(400).json({ error: '缺少必填字段' });
  }
  try {
    db.run('INSERT INTO spatial_nodes (node_id, node_name, node_type) VALUES (?,?,?)',
      node_id, node_name, node_type);
    // 插入线路关联
    if (lines && lines.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        db.run('INSERT INTO project_lines (node_id, line_id) VALUES (?,?)', node_id, lines[i]);
      }
    }
    res.json({ success: true, node_id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 更新
router.put('/:id', (req, res) => {
  const db = getDatabase();
  const { node_name, node_type, lines } = req.body;
  try {
    db.run("UPDATE spatial_nodes SET node_name=?, node_type=?, updated_at=datetime('now','localtime') WHERE node_id=?",
      node_name, node_type, req.params.id);
    // 重新设置线路关联
    db.run('DELETE FROM project_lines WHERE node_id = ?', req.params.id);
    if (lines && lines.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        db.run('INSERT INTO project_lines (node_id, line_id) VALUES (?,?)', req.params.id, lines[i]);
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  try {
    // 先解除关联合同对节点的引用，避免外键约束冲突
    db.run("UPDATE contracts SET node_id = NULL, updated_at=datetime('now','localtime') WHERE node_id = ?", req.params.id);
    // 删除项目-线路关联
    db.run('DELETE FROM project_lines WHERE node_id = ?', req.params.id);
    // 最后删除节点
    db.run('DELETE FROM spatial_nodes WHERE node_id = ?', req.params.id);
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
    return res.status(400).json({ error: '缺少待删除节点ID列表' });
  }
  try {
    const run = db.run.bind(db);
    for (let i = 0; i < ids.length; i++) {
      run("UPDATE contracts SET node_id = NULL, updated_at=datetime('now','localtime') WHERE node_id = ?", ids[i]);
      run('DELETE FROM project_lines WHERE node_id = ?', ids[i]);
      run('DELETE FROM spatial_nodes WHERE node_id = ?', ids[i]);
    }
    res.json({ success: true, count: ids.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
