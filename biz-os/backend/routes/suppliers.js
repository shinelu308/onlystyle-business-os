const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../database');
const { generateXlsx, sendExcelResponse, parseImportData } = require('../services/csvService');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// 获取所有运营商大线（支持搜索）
router.get('/', (req, res) => {
  const db = getDatabase();
  const { search } = req.query;
  let sql = 'SELECT * FROM supplier_lines WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (line_id LIKE ? OR provider LIKE ? OR circuit_number LIKE ?)';
    var like = '%' + search + '%';
    params.push(like, like, like);
  }
  sql += ' ORDER BY expire_date ASC';
  const rows = db.all(sql, ...params);
  res.json(rows);
});

// 导出 Excel
router.get('/export', async (req, res) => {
  const db = getDatabase();
  const rows = db.all('SELECT line_id,provider,circuit_number,total_bandwidth,purchase_date,expire_date,cost_annual,install_location,remarks FROM supplier_lines ORDER BY line_id');
  var fields = ['line_id', 'provider', 'circuit_number', 'total_bandwidth', 'purchase_date', 'expire_date', 'cost_annual', 'install_location', 'remarks'];
  var data = rows.map(function(r) {
    return fields.map(function(f) { return r[f] || ''; });
  });
  var buf = await generateXlsx(fields, data);
  sendExcelResponse(res, '线路管理_运营商线路.xlsx', buf);
});

// 下载模板
router.get('/template', async (req, res) => {
  var fields = ['line_id', 'provider', 'circuit_number', 'total_bandwidth', 'purchase_date', 'expire_date', 'cost_annual', 'install_location', 'remarks'];
  var buf = await generateXlsx(fields, []);
  sendExcelResponse(res, '线路管理_导入模板.xlsx', buf);
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
      if (!r.line_id || !r.provider || !r.circuit_number || !r.total_bandwidth || !r.purchase_date || !r.expire_date) {
        errors.push('第' + (i + 2) + '行: 缺少必填字段');
        continue;
      }
      try {
        db.run('INSERT INTO supplier_lines (line_id, provider, circuit_number, total_bandwidth, purchase_date, expire_date, cost_annual, install_location, remarks) VALUES (?,?,?,?,?,?,?,?,?)',
          r.line_id, r.provider, r.circuit_number, parseInt(r.total_bandwidth), r.purchase_date, r.expire_date, parseFloat(r.cost_annual) || 0, r.install_location || '', r.remarks || '');
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

// 获取单条
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const row = db.get('SELECT * FROM supplier_lines WHERE line_id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该线路' });
  res.json(row);
});

// 上传设备照片（多图片，base64 方式）
router.post('/upload-photos', (req, res) => {
  const { photos } = req.body;
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: '未提供照片数据' });
  }
  var savedFiles = [];
  for (var i = 0; i < photos.length; i++) {
    try {
      var photo = photos[i];
      var matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        savedFiles.push({ error: '第' + (i + 1) + '张照片格式无效' });
        continue;
      }
      var ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      var data = Buffer.from(matches[2], 'base64');
      var filename = 'device_' + Date.now() + '_' + i + '.' + ext;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), data);
      savedFiles.push(filename);
    } catch (e) {
      savedFiles.push({ error: e.message });
    }
  }
  res.json({ files: savedFiles });
});

// 创建
router.post('/', (req, res) => {
  const db = getDatabase();
  const { line_id, provider, circuit_number, total_bandwidth, purchase_date, expire_date, cost_annual, device_photos, install_location, remarks } = req.body;
  if (!line_id || !provider || !circuit_number || !total_bandwidth || !purchase_date || !expire_date) {
    return res.status(400).json({ error: '缺少必填字段' });
  }
  try {
    db.run('INSERT INTO supplier_lines (line_id, provider, circuit_number, total_bandwidth, purchase_date, expire_date, cost_annual, device_photos, install_location, remarks) VALUES (?,?,?,?,?,?,?,?,?,?)',
      line_id, provider, circuit_number, total_bandwidth, purchase_date, expire_date, cost_annual || 0,
      JSON.stringify(device_photos || []), install_location || '', remarks || '');
    res.json({ success: true, line_id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 更新
router.put('/:id', (req, res) => {
  const db = getDatabase();
  const { provider, circuit_number, total_bandwidth, purchase_date, expire_date, cost_annual, device_photos, install_location, remarks } = req.body;
  try {
    db.run("UPDATE supplier_lines SET provider=?, circuit_number=?, total_bandwidth=?, purchase_date=?, expire_date=?, cost_annual=?, device_photos=?, install_location=?, remarks=?, updated_at=datetime('now','localtime') WHERE line_id=?",
      provider, circuit_number, total_bandwidth, purchase_date, expire_date, cost_annual || 0,
      JSON.stringify(device_photos || []), install_location || '', remarks || '', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  try {
    db.run('DELETE FROM project_lines WHERE line_id = ?', req.params.id);
    db.run('DELETE FROM supplier_lines WHERE line_id = ?', req.params.id);
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
      db.run('DELETE FROM project_lines WHERE line_id = ?', ids[i]);
      db.run('DELETE FROM supplier_lines WHERE line_id = ?', ids[i]);
    }
    res.json({ success: true, count: ids.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
