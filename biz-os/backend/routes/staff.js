const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');
const { signStaffToken } = require('../content-auth');

// 获取所有人员
router.get('/', (req, res) => {
  const db = getDatabase();
  const { dept_id, status } = req.query;
  let sql = 'SELECT s.*, d.dept_name FROM staff s LEFT JOIN departments d ON s.dept_id = d.dept_id';
  const params = [];
  const conditions = [];
  if (dept_id) {
    conditions.push('s.dept_id = ?');
    params.push(dept_id);
  }
  if (status) {
    conditions.push('s.status = ?');
    params.push(status);
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY s.created_at DESC';
  const rows = db.all(sql, ...params);
  // 不返回密码
  const safe = rows.map(r => { const { password, ...rest } = r; return rest; });
  res.json(safe);
});

// 获取单个人员
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const row = db.get('SELECT s.*, d.dept_name FROM staff s LEFT JOIN departments d ON s.dept_id = d.dept_id WHERE s.staff_id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该人员' });
  const { password, ...safe } = row;
  res.json(safe);
});

// 创建人员
router.post('/', (req, res) => {
  const db = getDatabase();
  const { staff_id, name, username, password, phone, email, dept_id, position, role, wechat_openid, avatar } = req.body;
  if (!staff_id || !name || !username || !password) {
    return res.status(400).json({ error: '编号、姓名、账号、密码不能为空' });
  }
  try {
    db.run('INSERT INTO staff (staff_id, name, username, password, phone, email, dept_id, position, role, wechat_openid, avatar) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      staff_id, name, username, password, phone || '', email || '', dept_id || null, position || '', role || 'operator', wechat_openid || '', avatar || '');
    res.json({ success: true, staff_id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 更新人员
router.put('/:id', (req, res) => {
  const db = getDatabase();
  const { name, username, password, phone, email, dept_id, position, role, status, wechat_openid, avatar } = req.body;
  try {
    if (password) {
      db.run("UPDATE staff SET name=?, username=?, password=?, phone=?, email=?, dept_id=?, position=?, role=?, status=?, wechat_openid=?, avatar=?, updated_at=datetime('now','localtime') WHERE staff_id=?",
        name, username, password, phone || '', email || '', dept_id || null, position || '', role || 'operator', status || 'active', wechat_openid || '', avatar || '', req.params.id);
    } else {
      db.run("UPDATE staff SET name=?, username=?, phone=?, email=?, dept_id=?, position=?, role=?, status=?, wechat_openid=?, avatar=?, updated_at=datetime('now','localtime') WHERE staff_id=?",
        name, username, phone || '', email || '', dept_id || null, position || '', role || 'operator', status || 'active', wechat_openid || '', avatar || '', req.params.id);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 删除人员
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  try {
    db.run('DELETE FROM staff WHERE staff_id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ===== 登录认证 =====
router.post('/login', (req, res) => {
  const db = getDatabase();
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入账号和密码' });
  }
  const user = db.get('SELECT s.*, d.dept_name FROM staff s LEFT JOIN departments d ON s.dept_id = d.dept_id WHERE s.username = ? AND s.password = ? AND s.status = ?', username, password, 'active');
  if (!user) {
    return res.status(401).json({ error: '账号或密码错误，或账号已禁用' });
  }
  const { password: _, ...safe } = user;
  /* 登录成功时签发内容中台令牌：运营在后台改官网内容时用它做 X-Admin-Token。
     只在原有响应上**加**一个字段，{ success, user } 结构保持不变 ——
     前端 doLogin() 依赖 result.success / result.user，改结构会把登录打坏。 */
  let token = '';
  try {
    token = signStaffToken(db, user);
  } catch (e) {
    console.error('[Staff] 签发内容令牌失败:', e.message);
  }
  res.json({ success: true, user: safe, token });
});

module.exports = router;
