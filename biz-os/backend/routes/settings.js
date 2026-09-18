const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDatabase } = require('../database');
const brandLogo = require('../lib/brand-logo');

// ---------------------------------------------------------------------------
// Logo 图片上传 —— 品牌图形的**唯一写入口**
//
// 这张图同时用在四处：官网顶部导航 / 官网页脚 / 后台侧栏 / 后台登录页，
// 其中 3 处是**深色底**。所以落盘的那张图必须是「带透明通道、且背景已去干净」的，
// 否则深色底上就是一块白方块。
//
// 三道保险（缺一道就会漏）：
//   ① 前端 canvas 阶段会自动去白底并输出 PNG（用户零操作）；
//   ② 服务端这里再核一遍 —— 接口能被脚本绕过，只靠前端等于没锁门；
//   ③ 文件名内容寻址 logo_brand.<sha8>.png —— 既避开 /uploads/* 的 immutable
//      一年长缓存（换图必须换名），又正好落在 deploy.cjs 的 BRAND_ASSET 白名单里
//      （否则从后台上传的 logo 打包时会被漏掉，部署上线就是裂图）。
// ---------------------------------------------------------------------------
router.post('/upload-logo', (req, res) => {
  const { image_data } = req.body;
  if (!image_data) return res.status(400).json({ error: '缺少图片数据' });

  // 识别图片格式 (data:image/png;base64,...)
  var matches = String(image_data).match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: '图片格式不合法，仅支持 PNG/JPG/GIF' });

  var ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  var raw;
  try {
    raw = Buffer.from(matches[2], 'base64');
  } catch (e) {
    return res.status(400).json({ error: '图片内容无法解码（base64 不合法）' });
  }
  if (!raw.length) return res.status(400).json({ error: '图片内容为空' });
  if (raw.length > 8 * 1024 * 1024) return res.status(400).json({ error: '图片过大（上限 8MB）' });

  // 🔴 JPEG / GIF 没有 alpha 通道，纯 JS 也解不了像素 —— 直接拒绝，并告诉用户怎么走。
  //    以前这里不校验、直接落盘，于是「白底 JPG」静默进线，深色底上就是白方块。
  if (ext !== 'png') {
    return res.status(400).json({
      code: 'NEED_PNG',
      error: ext.toUpperCase() + ' 没有透明通道，放到深色底（官网顶部导航、后台侧栏等）会显示成白方块。' +
             '请在「品牌标识」里重新选这张图上传一次 —— 浏览器会自动补上透明背景并转成 PNG。'
    });
  }

  var result;
  try {
    result = brandLogo.prepareBrandLogo(raw, { tol: 26, maxSize: 512 });
  } catch (e) {
    return res.status(400).json({ code: e.code || 'BAD_IMAGE', error: e.message });
  }

  var hash = crypto.createHash('sha256').update(result.buf).digest('hex').slice(0, 8);
  var filename = 'logo_brand.' + hash + '.png';
  var dir = path.join(__dirname, '..', 'uploads');
  var filepath = path.join(dir, filename);

  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, result.buf);

    // 上传即落库，不再依赖前端补一次「保存配置」——少一个能失败的环节。
    var db = getDatabase();
    db.run("UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key='logo_url'",
           '/uploads/' + filename);

    // 清理同族旧文件（**必须在落库之后**，否则中途出错会让 DB 指向不存在的文件）：
    //   ① uploads 里堆多张 logo_brand.*.png，打包白名单带哪张就不确定了；
    //   ② deploy/selfcheck.cjs 第 8 节断言「有且仅有一个」，堆着会让自检失真。
    var cleaned = [];
    fs.readdirSync(dir).forEach(function (f) {
      if (f === filename) return;
      if (/^logo_brand\.[0-9a-f]{8}\.(png|svg|webp)$/i.test(f)) {
        try { fs.unlinkSync(path.join(dir, f)); cleaned.push(f); } catch (e) { /* 删不掉就算了，不影响本次上传 */ }
      }
    });

    res.json({
      success: true,
      url: '/uploads/' + filename,
      changed: !!result.changed,
      reason: result.reason,
      detail: result.detail,
      width: result.width,
      height: result.height,
      size: result.buf.length,
      cleaned: cleaned
    });
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
    admin: { name: '管理员', pages: ['dashboard','suppliers','spatial','customers','leads','contracts','content','settings'] },
    manager: { name: '经理', pages: ['dashboard','suppliers','spatial','customers','leads','contracts','content','settings'] },
    operator: { name: '专员', pages: ['dashboard','suppliers','spatial','customers','leads','contracts'] },
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
