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

// 合法的页面权限 key —— 必须与前端 pages/settings.js 的 PAGE_LABELS 一致。
// 前端矩阵是按 PAGE_LABELS 渲染的：这里多一个 key 前端会找不到列，少一个则权限静默失效。
const ROLE_PAGE_KEYS = ['dashboard', 'suppliers', 'spatial', 'customers', 'leads', 'contracts', 'content', 'settings'];

// 保存角色权限配置（同时承担「角色新增 / 改名 / 删除」的落库）
//
// 校验要点（每一条都对应一类真实故障）：
//  ① pages 必须是「已知页面 key」的数组 —— 否则矩阵渲染空列、权限静默失效；
//  ② 必须保留 admin 角色且含 settings —— 否则保存后没有任何人能进入系统设置，**直接自锁**；
//  ③ name 必须非空、≤20 字、不重名 —— 矩阵与人员列表都按 name 展示，重名会分不清；
//  ④ 删掉/改名后仍被人员引用的角色 → 返回 warnings（不阻断），
//     避免出现「人还在、权限没了」的静默故障。
router.put('/role-permissions', (req, res) => {
  const db = getDatabase();
  const body = req.body || {};
  const permissions = body.permissions;

  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions 必须是一个对象（角色key -> {name, pages}）' });
  }
  const roleKeys = Object.keys(permissions);
  if (!roleKeys.length) return res.status(400).json({ error: '至少需要保留一个角色' });

  const clean = {};
  const seenNames = {};
  for (let i = 0; i < roleKeys.length; i++) {
    const rk = roleKeys[i];
    const r = permissions[rk];
    if (!r || typeof r !== 'object') return res.status(400).json({ error: `角色 "${rk}" 的配置格式不对` });

    const name = String(r.name == null ? '' : r.name).trim();
    if (!name) return res.status(400).json({ error: `角色 "${rk}" 缺少名称` });
    if (name.length > 20) return res.status(400).json({ error: `角色名称 "${name}" 超过 20 个字` });
    if (seenNames[name]) return res.status(400).json({ error: `角色名称 "${name}" 重复了` });
    seenNames[name] = true;

    const rawPages = Array.isArray(r.pages) ? r.pages : [];
    const pages = [];
    for (let p = 0; p < rawPages.length; p++) {
      const pk = String(rawPages[p]);
      if (ROLE_PAGE_KEYS.indexOf(pk) < 0) {
        return res.status(400).json({ error: `角色 "${name}" 含未知权限项 "${pk}"` });
      }
      if (pages.indexOf(pk) < 0) pages.push(pk); // 去重
    }
    clean[rk] = { name: name, pages: pages };
  }

  // ② 防自锁：没有 admin 或 admin 丢掉 settings，保存后就没人能再改权限了
  if (!clean.admin) {
    return res.status(400).json({ error: '必须保留 admin（管理员）角色，否则将无人能进入「系统设置」' });
  }
  if (clean.admin.pages.indexOf('settings') < 0) {
    return res.status(400).json({ error: '管理员角色必须保留「系统设置」权限，否则保存后无人能再修改权限' });
  }

  // ④ 非阻断告警：被删除或被改 key 的角色仍挂在人员身上
  const warnings = [];
  try {
    const staffRows = db.all('SELECT staff_id, name, role FROM staff') || [];
    for (let s = 0; s < staffRows.length; s++) {
      if (!clean[staffRows[s].role]) {
        warnings.push(`${staffRows[s].name}(${staffRows[s].staff_id}) 仍在使用角色 "${staffRows[s].role}"，保存后将失去所有页面权限`);
      }
    }
  } catch (e) { /* 读不到人员表不应影响权限保存 */ }

  try {
    const exists = db.get("SELECT * FROM system_settings WHERE setting_key = 'role_permissions'");
    const jsonStr = JSON.stringify(clean);
    if (exists) {
      db.run("UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key='role_permissions'", jsonStr);
    } else {
      db.run("INSERT INTO system_settings (setting_key, setting_value, setting_group, description) VALUES ('role_permissions', ?, 'system', '角色权限配置')", jsonStr);
    }
    res.json({ success: true, roles: Object.keys(clean).length, warnings: warnings });
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
