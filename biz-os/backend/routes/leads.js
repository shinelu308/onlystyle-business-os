/**
 * 线索接口（官网表单写入口 + 后台读/改/转正）
 *
 * 🔴 模型：**线索池 与 客户库彻底分家**（这里改过一次设计，别再退回去）
 *   线索 = 还没被我们确认为客户的人（官网表单、渠道介绍…）→ 只住 leads 表
 *   客户 = 已被人工确认的业务主体                      → 只住 customers 表
 *
 *   旧设计是「官网提交时若填了公司名，就直接往 customers 插一条 cust_type='官网线索'」，
 *   后果有三（都是用户实际反馈出来的）：
 *     ① 客户管理列表里混进一堆根本没签约的线索，得人工分辨哪个是真客户；
 *     ② 数据看板「在管客户总数」/ stats.total_customers 被这些未签约线索撑虚；
 *     ③ cust_type 语义被污染 —— 它描述「客户是什么类型」，不是「这条属于什么阶段」；
 *        而 '官网线索' 又不在 /api/customers/config/types 的可选列表里，
 *        编辑那条客户时下拉根本匹配不上，处处别扭。
 *
 *   现在的流程：
 *     1. 官网提交 → **永远只写 leads**（原始留痕，谁也别丢）
 *     2. 按手机号匹配已有客户 → 命中就挂 customer_id。这是**归因**：
 *        老客户主动来询，不是这条线索带来的新客户，所以不计入「本月新增客户」。
 *     3. 未命中 → 留在线索池，人工分诊
 *     4. 人工点「转为客户」→ 才真正创建 customers 记录（POST /:id/convert）
 *
 * 接口一览：
 *   POST /              公开（官网表单）。**限流**，否则线索池会被机器人灌满
 *   GET  /              后台列表（鉴权）。status 筛选 + q 关键词 + limit/offset
 *   GET  /stats         后台统计（鉴权）
 *   POST /:id/convert   线索转正为客户（鉴权）← 唯一会创建客户的入口
 *   PUT  /:id           后台改状态 / 写跟进备注（鉴权）
 *   DELETE /:id         后台删除线索（鉴权）
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

    // ── 1. 归因：手机号命中已有客户才挂 customer_id（老客户来询，不产生新客户）──
    //     🔴 绝不在这里建客户。线索没被确认之前就不该有 customers 记录，
    //        否则客户管理和看板都会被未签约线索撑虚。建客户请走 POST /:id/convert。
    let customerId = '';
    const existing = db.get('SELECT customer_id FROM customers WHERE contact_phone = ? LIMIT 1', phone);
    if (existing) customerId = existing.customer_id;

    // ── 2. 写线索（原始留痕）──
    db.run(
      `INSERT INTO leads (name, phone, company, interest, message, source_page, utm, status, customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      name, phone, company, interest, message, sourcePage, utm, customerId
    );

    const row = db.get('SELECT * FROM leads ORDER BY id DESC LIMIT 1');
    console.log(`[Lead] ${name} / ${phone}${company ? ' / ' + company : ''}${customerId ? ' （归因到老客户 ' + customerId + '）' : ' （待分诊）'}`);

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
        // 已转正：真的建了客户（converted_at 非空）
        converted: one("SELECT COUNT(*) AS c FROM leads WHERE converted_at IS NOT NULL AND converted_at <> ''"),
        // 已归因：手机号命中老客户。这是「老客户来询」，不是这条线索带来的新客户，
        // 所以它虽然挂上了 customer_id，也绝不能算成线索转化。
        attributed: one("SELECT COUNT(*) AS c FROM leads WHERE customer_id IS NOT NULL AND customer_id <> ''"),
        // 待分诊：既没归因、也没转正 —— 才是真正需要人工处理的那批
        unattributed: one("SELECT COUNT(*) AS c FROM leads WHERE (customer_id IS NULL OR customer_id = '') AND (converted_at IS NULL OR converted_at = '')"),
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

/* ══════════ 后台：线索转正为客户 ══════════
   这是**唯一**会创建 customers 记录的入口（官网表单不再自动建）。

   三种情形都要正确处理，否则会建出重复客户：
     ① 线索已挂老客户（提交时手机号命中过）→ 不新建，只标记转正 + 状态置为已成交
     ② 手机号现在已存在于客户表（比如别人先手工建了）→ 直接归因，不新建
     ③ 都没有 → 新建客户。cust_type 必须在可配置列表里，
        否则客户表单的下拉会匹配不上（旧设计就是这么坏掉的）。
   幂等：已转正的线索再调一次，直接返回原客户，不会重复建。 */
router.post('/:id/convert', auth, (req, res) => {
  try {
    const db = getDatabase();
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'id 不合法' });

    const lead = db.get('SELECT * FROM leads WHERE id = ?', id);
    if (!lead) return res.status(404).json({ ok: false, error: '线索不存在' });

    // 幂等：已转正直接返回
    if (lead.converted_at) {
      return res.json({ ok: true, data: { already: true, created: false, customer_id: lead.customer_id, lead: lead } });
    }

    const body = req.body || {};
    let customerId = clean(lead.customer_id, 40);
    let created = false;

    const linked = customerId
      ? db.get('SELECT customer_id FROM customers WHERE customer_id = ?', customerId)
      : null;

    if (!linked) {
      // ② 手机号已存在客户 → 归因，不新建（避免建出重复客户）
      const byPhone = lead.phone
        ? db.get('SELECT customer_id FROM customers WHERE contact_phone = ? LIMIT 1', lead.phone)
        : null;

      if (byPhone) {
        customerId = byPhone.customer_id;
      } else {
        // ③ 新建客户
        let types = ['园区租户', '连锁店', '散客', '楼宇'];
        const typeRow = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'customer_types'");
        if (typeRow && typeRow.setting_value) {
          try {
            const parsed = JSON.parse(typeRow.setting_value);
            if (Array.isArray(parsed) && parsed.length) types = parsed;
          } catch (e) { /* 配置损坏时退回默认，不能因为配置坏了就转不了正 */ }
        }

        const custType = clean(body.cust_type, 40) || (types.indexOf('散客') >= 0 ? '散客' : types[0]);
        if (types.indexOf(custType) < 0) {
          return res.status(400).json({ ok: false, error: '客户类型不在可选列表里：' + custType });
        }

        // 公司名缺失时用联系人姓名兜底，但绝不允许建出没有名字的客户
        const company = clean(body.company_name, 120) || clean(lead.company, 120) || clean(lead.name, 120);
        if (!company) return res.status(400).json({ ok: false, error: '这条线索既没有公司名也没有联系人，无法建客户' });

        customerId = clean(body.customer_id, 40) || newId('C');
        if (db.get('SELECT customer_id FROM customers WHERE customer_id = ?', customerId)) {
          return res.status(400).json({ ok: false, error: '客户编号 ' + customerId + ' 已存在，请换一个' });
        }

        db.run(
          `INSERT INTO customers (customer_id, company_name, cust_type, parent_id, wechat_openid, contact_person, contact_phone, address)
           VALUES (?, ?, ?, NULL, NULL, ?, ?, '')`,
          customerId, company, custType, clean(lead.name, 40), clean(lead.phone, 30)
        );
        created = true;
        console.log(`[Lead] 转正 #${id} ${lead.name} → 新建客户 ${customerId}（${custType}）`);
      }
    }

    // 转正 = 成交：状态一并置为 won（后续仍可在列表里手工改）
    db.run(
      "UPDATE leads SET customer_id = ?, converted_at = datetime('now','localtime'), status = 'won', updated_at = datetime('now','localtime') WHERE id = ?",
      customerId, id
    );

    res.json({
      ok: true,
      data: {
        customer_id: customerId,
        created: created,
        lead: db.get('SELECT * FROM leads WHERE id = ?', id)
      }
    });
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
