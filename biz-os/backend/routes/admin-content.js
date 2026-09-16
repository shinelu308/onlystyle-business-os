/**
 * 内容中台 · 后台写接口（必须鉴权）
 * 契约：design/内容中台-API契约.md 第四节
 *
 * 为什么单独加鉴权：BOS 目前零鉴权 —— 所有 /api/* 匿名可调，
 * 连 POST /api/staff/login 都是明文比对。公开读接口无所谓，
 * 但写接口一旦裸奔，任何人 POST 一下就能改官网内容。
 * 这里用最简的共享令牌（X-Admin-Token），令牌在首次启动时生成并打印一次。
 *
 * 用「列白名单 + 参数化」拼 SQL：表名来自固定映射，列名来自 PRAGMA 实际结构，
 * 值一律走占位符 —— 不给注入留口子。
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDatabase } = require('../database');
const { bumpContentVersion, getContentVersion } = require('../content-schema');
const { verifyStaffToken, safeEqual } = require('../content-auth');

/* ── 类型 → 表映射（外部只能传这些 key，杜绝任意表名）── */
const TYPES = {
  pages: { table: 'content_pages', pk: 'id' },
  services: { table: 'content_services', pk: 'id' },
  industries: { table: 'content_industries', pk: 'id' },
  cases: { table: 'content_cases', pk: 'id' },
  articles: { table: 'content_articles', pk: 'id' },
  partners: { table: 'content_partners', pk: 'id' },
  'home-blocks': { table: 'content_home_blocks', pk: 'id' },
  media: { table: 'content_media', pk: 'id' },
  settings: { table: 'content_settings', pk: 'key' },
};

const OK = (res, data) => res.json({ ok: true, data, version: getContentVersion(getDatabase()) });
const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });

/* ── 鉴权：两把钥匙都认 ──
   ① 共享令牌 admin.content_token —— 给脚本 / e2e / CI 用，首次启动打印一次；
   ② 登录签发的 staff token —— 运营在后台点按钮时自动带上，不用手贴密钥。
   两者都由 content-auth.js 提供（safeEqual / verifyStaffToken）。 */
function auth(req, res, next) {
  const db = getDatabase();
  const row = db.get("SELECT value FROM content_settings WHERE key = 'admin.content_token'");
  const token = req.headers['x-admin-token'] || req.query.token || '';

  // ① 共享令牌（定长比较，避免时序侧信道）
  if (row && row.value && token && safeEqual(token, row.value)) {
    req.contentAuth = { kind: 'shared' };
    return next();
  }

  // ② 登录签发的 staff token（无状态 HMAC，校验签名 + 过期）
  const payload = verifyStaffToken(db, token);
  if (payload) {
    req.contentAuth = { kind: 'staff', sid: payload.sid, role: payload.role };
    return next();
  }

  if (!row || !row.value) return fail(res, 503, 'admin token 未初始化，请重启服务端一次');
  return fail(res, 401, 'unauthorized');
}

/* ── 结构工具 ── */

/** 可写列（排除主键与时间戳，这两个由系统维护） */
function columnsOf(db, table, pk) {
  return db
    .all(`PRAGMA table_info(${table})`)
    .map((r) => r.name)
    .filter((n) => n !== pk && n !== 'created_at' && n !== 'updated_at');
}

/** 对象/数组自动序列化；布尔转 0/1 */
function norm(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** 行 → 输出形状（把可 JSON 解析的字符串还原） */
function shape(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('{'))) {
      try {
        out[k] = JSON.parse(v);
        continue;
      } catch {
        /* 不是 JSON，保持原样 */
      }
    }
    out[k] = v;
  }
  return out;
}

function typeOf(req, res) {
  const t = TYPES[req.params.type];
  if (!t) {
    fail(res, 400, `unknown type: ${req.params.type}`);
    return null;
  }
  return t;
}

/* ════════ 固定路径必须注册在动态 /:type 之前 ════════
   Express 按注册顺序匹配。'/:type' 只有一段，会吃掉 /publish 这类单段固定路径，
   结果就是 POST /publish → 400 unknown type: publish。
   多段路径（/settings/batch、/:type/reorder）天然不冲突，单段的一律往上提。 */

router.get('/version', (req, res) => OK(res, { version: getContentVersion(getDatabase()) }));

/* 发布：bump 版本号，前端/CDN 据此失效缓存 */
router.post('/publish', auth, (req, res) => {
  try {
    OK(res, { version: bumpContentVersion(getDatabase()) });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

/* ════════ 列表 / 详情 ════════ */

router.get('/:type', auth, (req, res) => {
  const t = typeOf(req, res);
  if (!t) return;
  try {
    const db = getDatabase();
    const order = t.pk === 'key' ? 'key ASC' : 'sort ASC, id ASC';
    const rows = db.all(`SELECT * FROM ${t.table} ORDER BY ${order}`);
    OK(res, rows.map(shape));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

/* ════════ 新建 ════════ */

router.post('/:type', auth, (req, res) => {
  const t = typeOf(req, res);
  if (!t) return;
  try {
    const db = getDatabase();
    const allowed = columnsOf(db, t.table, t.pk);
    const body = req.body || {};
    const cols = allowed.filter((c) => body[c] !== undefined);
    if (!cols.length) return fail(res, 400, '没有可写入的字段');

    const sql = `INSERT INTO ${t.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    db.run(sql, ...cols.map((c) => norm(body[c])));
    bumpContentVersion(db);

    const row = db.get(`SELECT * FROM ${t.table} ORDER BY rowid DESC LIMIT 1`);
    OK(res, shape(row));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

/* ════════ 更新 ════════ */

router.put('/:type/:id', auth, (req, res) => {
  const t = typeOf(req, res);
  if (!t) return;
  try {
    const db = getDatabase();
    const allowed = columnsOf(db, t.table, t.pk);
    const body = req.body || {};
    const cols = allowed.filter((c) => body[c] !== undefined);
    if (!cols.length) return fail(res, 400, '没有可更新的字段');

    // updated_at 只有表里有这一列才补
    const hasUpdated = db.all(`PRAGMA table_info(${t.table})`).some((r) => r.name === 'updated_at');
    const sets = cols.map((c) => `${c} = ?`);
    const params = cols.map((c) => norm(body[c]));
    if (hasUpdated) sets.push("updated_at = datetime('now','localtime')");

    db.run(`UPDATE ${t.table} SET ${sets.join(', ')} WHERE ${t.pk} = ?`, ...params, req.params.id);
    bumpContentVersion(db);

    const row = db.get(`SELECT * FROM ${t.table} WHERE ${t.pk} = ?`, req.params.id);
    if (!row) return fail(res, 404, 'not found');
    OK(res, shape(row));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

/* ════════ 删除 ════════ */

router.delete('/:type/:id', auth, (req, res) => {
  const t = typeOf(req, res);
  if (!t) return;
  try {
    const db = getDatabase();
    db.run(`DELETE FROM ${t.table} WHERE ${t.pk} = ?`, req.params.id);
    bumpContentVersion(db);
    OK(res, { deleted: req.params.id });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

/* ════════ 批量调序（首页区块拖拽排序就走这里）════════ */

router.post('/:type/reorder', auth, (req, res) => {
  const t = typeOf(req, res);
  if (!t) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!ids) return fail(res, 400, 'body 需要 { ids: [...] }');
  try {
    const db = getDatabase();
    ids.forEach((id, i) => {
      db.run(`UPDATE ${t.table} SET sort = ? WHERE ${t.pk} = ?`, i + 1, id);
    });
    bumpContentVersion(db);
    OK(res, { reordered: ids.length });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

/* ════════ 设置：批量写（后台表单一次提交多个 key）════════ */

router.post('/settings/batch', auth, (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) return fail(res, 400, 'body 需要 { items: [{key, value, grp}] }');
  try {
    const db = getDatabase();
    for (const it of items) {
      if (!it || !it.key) continue;
      const exists = db.get('SELECT 1 AS x FROM content_settings WHERE key = ?', it.key);
      if (exists) {
        db.run(
          "UPDATE content_settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = ?",
          norm(it.value), it.key
        );
      } else {
        db.run('INSERT INTO content_settings (key, value, grp) VALUES (?, ?, ?)', it.key, norm(it.value), it.grp || 'general');
      }
    }
    bumpContentVersion(db);
    OK(res, { saved: items.length });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

module.exports = router;
