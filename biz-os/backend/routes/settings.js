const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../database');

// Logo 图片上传
router.post('/upload-logo', (req, res) => {
  const { image_data } = req.body;
  if (!image_data) return res.status(400).json({ error: '缺少图片数据' });

  // 识别图片格式 (data:image/png;base64,...)
  var matches = image_data.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: '图片格式不合法，仅支持 PNG/JPG/GIF' });

  var ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  var base64Data = matches[2];
  var filename = 'logo_' + Date.now() + '.' + ext;
  var filepath = path.join(__dirname, '..', 'uploads', filename);

  try {
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
    var url = '/uploads/' + filename;
    res.json({ success: true, url: url });
  } catch (e) {
    res.status(500).json({ error: '保存图片失败: ' + e.message });
  }
});

// 获取所有设置（按分组返回）
router.get('/', (req, res) => {
  const db = getDatabase();
  const rows = db.all('SELECT * FROM system_settings ORDER BY setting_group, setting_key');
  // 按 group 分组
  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.setting_group]) grouped[r.setting_group] = {};
    grouped[r.setting_group][r.setting_key] = { value: r.setting_value, description: r.description };
  });
  res.json({ list: rows, grouped });
});

// 按分组获取设置
router.get('/group/:group', (req, res) => {
  const db = getDatabase();
  const rows = db.all('SELECT * FROM system_settings WHERE setting_group = ? ORDER BY setting_key', req.params.group);
  res.json(rows);
});

// ===== 角色权限管理（必须放在 /:key 路由之前）=====

// 获取角色权限配置
router.get('/role-permissions', (req, res) => {
  const db = getDatabase();
  const row = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'role_permissions'");
  var defaultPerms = {
    admin: { name: '管理员', pages: ['dashboard','suppliers','spatial','customers','contracts','content','settings'] },
    manager: { name: '经理', pages: ['dashboard','suppliers','spatial','customers','contracts','content','settings'] },
    operator: { name: '专员', pages: ['dashboard','suppliers','spatial','customers','contracts'] },
    viewer: { name: '观察员', pages: ['dashboard','customers','contracts'] }
  };
  if (row && row.setting_value) {
    try {
      var parsed = JSON.parse(row.setting_value);
      return res.json(parsed);
    } catch(e) { /* fall through */ }
  }
  res.json(defaultPerms);
});

// 保存角色权限配置
router.put('/role-permissions', (req, res) => {
  const db = getDatabase();
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ error: 'permissions 必须是对象' });
  }
  try {
    var exists = db.get("SELECT * FROM system_settings WHERE setting_key = 'role_permissions'");
    var jsonStr = JSON.stringify(permissions);
    if (exists) {
      db.run("UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key='role_permissions'", jsonStr);
    } else {
      db.run("INSERT INTO system_settings (setting_key, setting_value, setting_group, description) VALUES ('role_permissions', ?, 'system', '角色权限配置')", jsonStr);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 更新单条设置
router.put('/:key', (req, res) => {
  const db = getDatabase();
  const { setting_value } = req.body;
  try {
    const exist = db.get('SELECT * FROM system_settings WHERE setting_key = ?', req.params.key);
    if (!exist) return res.status(404).json({ error: '未找到该设置项' });
    db.run("UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key=?", setting_value, req.params.key);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 批量更新设置（一个分组内的所有设置）
router.put('/batch/:group', (req, res) => {
  const db = getDatabase();
  const { settings } = req.body; // { key: value, ... }
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings 必须是键值对对象' });
  }
  try {
    const keys = Object.keys(settings);
    for (const key of keys) {
      db.run("UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key=?", settings[key], key);
    }
    res.json({ success: true, updated: keys.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
