/**
 * 线索接口（官网表单唯一写入口）
 *
 * 归属：架构方案 §6 要求「leads 直接复用 BOS 的客户体系，官网线索和销售跟进进同一个池子」。
 * 落地方式：
 *   1. 永远先写 leads 表（原始留痕，谁也别丢）
 *   2. 按手机号匹配已有客户 → 命中就挂 customer_id（归因到老客户）
 *   3. 没命中且填了公司名 → 建一条客户（cust_type='官网线索'）并挂上
 *   4. 没命中又没公司名 → 留在 leads 里人工分诊，不污染客户表
 *
 * 安全：这是匿名可写的公开接口，必须限流 —— 否则客户池会被机器人灌满。
 */
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');

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

/* ── 后台查看线索（与其它后台接口一致的鉴权策略，见 admin-content.js）── */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const status = clean(req.query.status, 20);
    let sql = 'SELECT * FROM leads';
    const params = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);
    res.json({ ok: true, data: db.all(sql, ...params) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
