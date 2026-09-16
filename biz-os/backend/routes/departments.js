const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');

// 获取所有部门列表（平铺）
router.get('/', (req, res) => {
  const db = getDatabase();
  const rows = db.all('SELECT d.*, p.dept_name as parent_name FROM departments d LEFT JOIN departments p ON d.parent_id = p.dept_id ORDER BY d.sort_order ASC');
  res.json(rows);
});

// 获取部门树形结构
router.get('/tree', (req, res) => {
  const db = getDatabase();
  const all = db.all('SELECT * FROM departments ORDER BY sort_order ASC');
  // 构建树
  const map = {};
  const roots = [];
  all.forEach(d => { map[d.dept_id] = { ...d, children: [] }; });
  all.forEach(d => {
    if (d.parent_id && map[d.parent_id]) {
      map[d.parent_id].children.push(map[d.dept_id]);
    } else {
      roots.push(map[d.dept_id]);
    }
  });
  // 统计每个部门的人员数量
  function countStaff(dept) {
    const staffCount = db.get('SELECT COUNT(*) as c FROM staff WHERE dept_id = ? AND status = ?', dept.dept_id, 'active');
    dept.staff_count = staffCount ? staffCount.c : 0;
    dept.subtotal = dept.staff_count;
    if (dept.children) {
      for (const child of dept.children) {
        dept.subtotal += countStaff(child);
      }
    }
    return dept.subtotal;
  }
  roots.forEach(r => countStaff(r));
  res.json(roots);
});

// 获取单个部门
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const row = db.get('SELECT * FROM departments WHERE dept_id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该部门' });
  res.json(row);
});

// 创建部门
router.post('/', (req, res) => {
  const db = getDatabase();
  const { dept_id, dept_name, parent_id, dept_head, description, sort_order } = req.body;
  if (!dept_id || !dept_name) {
    return res.status(400).json({ error: '部门编号和名称不能为空' });
  }
  try {
    db.run('INSERT INTO departments (dept_id, dept_name, parent_id, dept_head, description, sort_order) VALUES (?,?,?,?,?,?)',
      dept_id, dept_name, parent_id || null, dept_head || '', description || '', sort_order || 0);
    res.json({ success: true, dept_id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 更新部门
router.put('/:id', (req, res) => {
  const db = getDatabase();
  const { dept_name, parent_id, dept_head, description, sort_order, status } = req.body;
  try {
    db.run("UPDATE departments SET dept_name=?, parent_id=?, dept_head=?, description=?, sort_order=?, status=?, updated_at=datetime('now','localtime') WHERE dept_id=?",
      dept_name, parent_id || null, dept_head || '', description || '', sort_order || 0, status || 'active', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 删除部门
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  try {
    // 检查是否有子部门
    const hasChild = db.get('SELECT COUNT(*) as c FROM departments WHERE parent_id = ?', req.params.id);
    if (hasChild && hasChild.c > 0) {
      return res.status(400).json({ error: '该部门下存在子部门，请先删除子部门' });
    }
    // 检查是否有人员
    const hasStaff = db.get('SELECT COUNT(*) as c FROM staff WHERE dept_id = ?', req.params.id);
    if (hasStaff && hasStaff.c > 0) {
      return res.status(400).json({ error: '该部门下存在人员，请先移除人员' });
    }
    db.run('DELETE FROM departments WHERE dept_id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
