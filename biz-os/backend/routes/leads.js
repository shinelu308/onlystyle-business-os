/**
 * 线索接口（官网表单写入口 + 后台读/改）
 *
 * 归属：架构方案 §6 要求「leads 直接复用 BOS 的客户体系，官网线索和销售跟进进同一个池子」。
 * 落地方式：
 *   1. 永远先写 leads 表（原始留痕，谁也别丢）
 *   2. 按手机号匹配已有客户 → 命中就挂 customer_id（归因到老客户）
 *   3. 没命中且填了公司名 → 建一条客户（cust_type='官网线索'）并挂上
 *   4. 没命中又没公司名 → 留在 leads 里人工分诊，不污染客户表
 *
 * 接口一览：
 *   POST /           公开（官网表单）。**限流**，否则客户池会被机器人灌满
 *   GET  /           后台列表（鉴权）。status 筛选 + q 关键词 + limit/offset
 *   GET  /stats      后台统计（鉴权）
 *   PUT  /:id        后台改状态 / 写跟进备注（鉴权）
 *
 * ⚠️ 鉴权用 lib/admin-auth.js（与 /api/content/admin/* 同一份实现）。
 *    此前 GET / 没挂鉴权 = 匿名可读全部客户手机号，是个洞。
 */
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');
const { auth } = require('../lib/admin-auth');

/* ── 线索状态：**唯一真相源** ──
   后台列表/统计/筛选下拉都从这里取（随 GET / 的 statuses 下发），
   前端不许再写一份，否则加状态时必然两边漂移。key 只增不改。 */
const STATUSES = [
  { key: 'new', label: '待跟进', tone: 'info' },
  { key: 'contacted', label: '已联系', tone: 'warn' },
  { key: 'quoted', label: '已报价', tone: 'brand' },
  { key: 'won', label: '已成交', tone: 'ok' },
  { key: 'lost', label: '已流失', tone: 'muted' },
];
const STATUS_KEYS = STATUSES.map((s) => s.key);

/* ── 极简限流：内存计数，单机够用 ── */
const HITS = new Map(); // key -> number[]（时间戳）
const WINDOW_MS = 60 * 60 * 1000;

function rateLimited(key, max) {
  const now = Date.now();
  const arr = (HITS.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= max) {
    HITS.set(key, arr);
    return true;
  }
  arr.push(now);
  HITS.set(key, arr);
  return false;
}

// 偶尔清理，避免内存里堆垃圾
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of HITS) {
    const keep = arr.filter((t) => now - t < WINDOW_MS);
    if (keep.length) HITS.set(k, keep);
    else HITS.delete(k);
  }
}, 10 * 60 * 1000).unref?.();

const clean = (s, max = 500) => String(s == null ? '' : s).trim().slice(0, max);

/** 生成一个短 id（与 BOS 其它模块的 id 风格保持一致：带前缀） */
function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/* ══════════ 公开：提交线索 ══════════ */
router.post('/', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || 'unknown';

  if (rateLimited(`ip:${ip}`, 20)) {
    return res.status(429).json({ ok: false, error: '提交过于频繁，请稍后再试' });
  }

  const name = clean(req.body?.name, 40);
  const phone = clean(req.body?.phone, 30);
  const company = clean(req.body?.company, 120);
  const interest = clean(req.body?.interest, 80);
  const message = clean(req.body?.message, 1000);
  const sourcePage = clean(req.body?.page || req.body?.source_page, 200);
  const utm = clean(req.body?.utm, 200);

  if (!name) return res.status(400).json({ ok: false, error: '请填写您的称呼' });
  if (!phone) return res.status(400).json({ ok: false, error: '请填写联系电话' });
  if (!/^[\d\s+()-]{6,20}$/.test(phone)) {
    return res.status(400).json({ ok: false, error: '电话格式看起来不对' });
  }

  // 同一手机号 10 分钟内只允许提交一次，防重复点击/刷
  if (rateLimited(`phone:${phone}`, 1)) {
    return res.status(429).json({ ok: false, error: '该号码刚提交过，我们已收到，请勿重复提交' });
  }

  try {
    const db = getDatabase();

    // ── 1. 找已有客户（手机号匹配）──
    let customerId = '';
    const existing = db.get('SELECT customer_id FROM customers WHERE contact_phone = ? LIMIT 1', phone);
    if (existing) {
      customerId = existing.customer_id;
    } else if (company) {
      // ── 2. 有公司名才建客户，避免散客灌满客户表 ──
      customerId = newId('C');
      db.run(
        `INSERT INTO customers (customer_id, company_name, cust_type, contact_person, contact_phone)
         VALUES (?, ?, ?, ?, ?)`,
        customerId, company, '官网线索', name, phone
      );
    }

    // ── 3. 写线索（原始留痕）──
    db.run(
      `INSERT INTO leads (name, phone, company, interest, message, source_page, utm, status, customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      name, phone, company, interest, message, sourcePage, utm, customerId
    );

    const row = db.get('SELECT * FROM leads ORDER BY id DESC LIMIT 1');
    console.log(`[Lead] ${name} / ${phone}${company ? ' / ' + company : ''}${customerId ? ' → 客户 ' + customerId : ''}`);

    res.json({ ok: true, data: { id: row?.id, customer_id: customerId || null } });
  } catch (e) {
    console.error('[Lead] 写入失败:', e.message);
    res.status(500).json({ ok: false, error: '提交失败，请稍后重试或直接电话联系我们' });
  }
});

/* ══════════ 后台：统计（必须排在 `/:id` 之前，否则 stats 会被当成 id）══════════ */
router.get('/stats', auth, (req, res) => {
  try {
    const db = getDatabase();
    // ⚠️ 一律用 SQL 的 date('now','localtime')，不要用 JS 的 toISOString() 取「今天」——
    //    后者是 UTC，东八区 0:00–8:00 会算成昨天（本项目已踩过一次）。
    const one = (sql, ...p) => {
      const r = db.get(sql, ...p);
      return (r && (r.c ?? r.cnt)) || 0;
    };
    const byStatus = {};
    STATUS_KEYS.forEach((k) => { byStatus[k] = 0; });
    db.all('SELECT status, COUNT(*) AS c FROM leads GROUP BY status')
      .forEach((r) => { byStatus[r.status || 'new'] = r.c; });

    res.json({
      ok: true,
      data: {
        total: one('SELECT COUNT(*) AS c FROM leads'),
        today: one("SELECT COUNT(*) AS c FROM leads WHERE date(created_at) = date('now','localtime')"),
        week: one("SELECT COUNT(*) AS c FROM leads WHERE date(created_at) >= date('now','localtime','-6 days')"),
        pending: byStatus.new || 0,
        byStatus,
        statuses: STATUSES,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════ 后台：列表 ══════════ */
router.get('/', auth, (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const status = clean(req.query.status, 20);
    const q = clean(req.query.q, 60);

    const where = [];
    const params = [];
    if (status && STATUS_KEYS.indexOf(status) >= 0) {
      where.push('status = ?');
      params.push(status);
    }
    if (q) {
      where.push('(name LIKE ? OR phone LIKE ? OR company LIKE ? OR interest LIKE ? OR message LIKE ?)');
      const like = '%' + q + '%';
      params.push(like, like, like, like, like);
    }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';

    const total = (db.get('SELECT COUNT(*) AS c FROM leads' + w, ...params) || {}).c || 0;
    const rows = db.all(
      'SELECT * FROM leads' + w + ' ORDER BY id DESC LIMIT ? OFFSET ?',
      ...params, limit, offset
    );

    // ⚠️ 信封内放对象而不是裸数组：后台用 API.content.get 会自动拆 { ok, data } 信封，
    //    裸数组会把 total / statuses 丢掉。统一成 data:{ items, total, statuses }。
    res.json({ ok: true, data: { items: rows, total: total, statuses: STATUSES } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════ 后台：改状态 / 写跟进备注 ══════════ */
router.put('/:id', auth, (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'id 不合法' });

    const row = db.get('SELECT * FROM leads WHERE id = ?', id);
    if (!row) return res.status(404).json({ ok: false, error: '线索不存在' });

    const body = req.body || {};
    const sets = [];
    const params = [];

    if (body.status !== undefined) {
      const st = clean(body.status, 20);
      if (STATUS_KEYS.indexOf(st) < 0) {
        return res.status(400).json({ ok: false, error: 'status 取值不合法：' + st });
      }
      sets.push('status = ?');
      params.push(st);
    }
    if (body.follow_note !== undefined) {
      sets.push('follow_note = ?');
      params.push(clean(body.follow_note, 1000));
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: '没有要更新的字段' });

    sets.push("updated_at = datetime('now','localtime')");
    db.run('UPDATE leads SET ' + sets.join(', ') + ' WHERE id = ?', ...params, id);

    res.json({ ok: true, data: db.get('SELECT * FROM leads WHERE id = ?', id) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══════════ 后台：删除线索 ══════════
   与 customers / staff / suppliers / contracts 等模块保持一致，线索池也要能清垃圾
   （官网表单是公开写入口，被机器人灌进来时必须能删掉）。
   ⚠️ 只删 leads 这一条留痕；**不级联删客户** —— 客户可能已被别的线索/合同引用。 */
router.delete('/:id', auth, (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'id 不合法' });

    const row = db.get('SELECT * FROM leads WHERE id = ?', id);
    if (!row) return res.status(404).json({ ok: false, error: '线索不存在' });

    db.run('DELETE FROM leads WHERE id = ?', id);
    res.json({ ok: true, data: { id: id, deleted: true } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
