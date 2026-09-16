/**
 * 内容中台 · 公开只读接口
 * 契约：design/内容中台-API契约.md 第三节
 *
 * 统一响应格式（BOS 老接口格式不统一，这套新接口必须守住）：
 *   成功 { ok:true, data, version }    失败 { ok:false, error }
 *
 * 只返回 status=1（已发布）且 channel 含 web 的内容。
 * channel 是逗号分隔列表，用 instr 判断包含，避免 LIKE 命中 'website' 之类的误判。
 */
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');
const { getContentVersion } = require('../content-schema');

/* ── 工具 ── */

/** channel 包含判断：把 'web,wechat' 变成 ',web,wechat,' 再找 ',web,' */
const CH = (ch) => `instr(',' || IFNULL(channel,'web') || ',', ',${ch},') > 0`;

const parse = (v, dflt) => {
  if (v == null || v === '') return dflt;
  try {
    return JSON.parse(v);
  } catch {
    return dflt;
  }
};

function ok(res, data) {
  res.json({ ok: true, data, version: getContentVersion(getDatabase()) });
}
const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });

/** 内容行 → 前端形状（解析 JSON 字段、把 0/1 转成布尔） */
const mapService = (r) => ({ ...r, points: parse(r.points, []) });
const mapCase = (r) => ({ ...r, metrics: parse(r.metrics, []), featured: !!r.featured });
const mapBlock = (r) => ({ ...r, props: parse(r.props, {}), enabled: !!r.enabled });
const mapPage = (r) => ({
  ...r,
  blocks: parse(r.blocks, []),
  seo: {
    title: r.seo_title || r.title,
    description: r.seo_description || '',
    image: r.og_image || '',
  },
});

/** KV 设置 → 扁平对象（brand.name → { brand: { name } }） */
function buildSite(db) {
  const rows = db.all('SELECT key, value, grp FROM content_settings');
  const out = {};
  for (const r of rows) {
    if (/^content\./.test(r.key)) continue; // 内部键不外泄
    const [k1, k2] = r.key.split('.');
    if (!out[k1]) out[k1] = {};
    out[k1][k2 || 'value'] = r.value;
  }
  out.brand = out.brand || {};
  out.brand.nameParts = [out.brand.name || 'ONLYSTYLE'];
  // 把 ONLYSTYLE 拆成 ONLY + STYLE 供 logo 双色渲染
  const n = out.brand.name || 'ONLYSTYLE';
  const half = Math.ceil(n.length / 2);
  out.brand.nameParts = [n.slice(0, half), n.slice(half)];

  out.nav = parse(out.nav?.items, []);
  out.navCta = parse(out.nav?.cta, { text: '联系我们', to: '/contact', visible: true });
  out.footerNav = parse(out.footer?.nav, []) || out.nav;
  if (!out.footer) out.footer = {};

  // 联系方式补充派生字段
  out.contact = out.contact || {};
  out.contact.siteHref = out.contact.siteHref || `https://${out.contact.site || ''}`;
  out.contact.amap = parse(out.contact.amap, { key: '', center: [121.3986, 31.1105], zoom: 15 });

  out.legal = out.legal || {};
  out.seo = out.seo || {};
  return out;
}

/* ════════ 读接口 ════════ */

/** 首屏一次拿齐：站点配置 + 导航 + 首页区块，避免请求瀑布 */
router.get('/bootstrap', (req, res) => {
  const db = getDatabase();
  const rows = db
    .all(`SELECT * FROM content_home_blocks WHERE status = 1 AND enabled = 1 AND ${CH('web')} ORDER BY sort ASC`)
    .map(mapBlock);
  ok(res, { site: buildSite(db), homeBlocks: rows });
});

router.get('/site', (req, res) => {
  try {
    ok(res, buildSite(getDatabase()));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/home', (req, res) => {
  try {
    const rows = getDatabase()
      .all(`SELECT * FROM content_home_blocks WHERE status = 1 AND enabled = 1 AND ${CH('web')} ORDER BY sort ASC`)
      .map(mapBlock);
    ok(res, { blocks: rows });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/services', (req, res) => {
  try {
    const rows = getDatabase()
      .all(`SELECT * FROM content_services WHERE status = 1 AND ${CH('web')} ORDER BY sort ASC`)
      .map(mapService);
    ok(res, rows);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/industries', (req, res) => {
  try {
    const rows = getDatabase()
      .all(`SELECT * FROM content_industries WHERE status = 1 AND ${CH('web')} ORDER BY sort ASC`)
      .map((r) => ({ ...r, tags: parse(r.tags, []) }));
    ok(res, rows);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

/** 案例分类聚合（前端的筛选条不写死） */
router.get('/categories', (req, res) => {
  try {
    const rows = getDatabase().all(
      `SELECT category, COUNT(*) AS n FROM content_cases
       WHERE status = 1 AND ${CH('web')} AND category != ''
       GROUP BY category ORDER BY MIN(sort) ASC`
    );
    ok(res, ['全部', ...rows.map((r) => r.category)]);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/cases', (req, res) => {
  try {
    const db = getDatabase();
    const where = [`status = 1`, CH('web')];
    const params = [];
    if (req.query.category && req.query.category !== '全部') {
      where.push('category = ?');
      params.push(req.query.category);
    }
    if (req.query.featured === '1' || req.query.featured === 'true') where.push('featured = 1');

    let sql = `SELECT * FROM content_cases WHERE ${where.join(' AND ')} ORDER BY sort ASC`;
    const limit = parseInt(req.query.limit, 10);
    if (limit > 0) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    ok(res, db.all(sql, ...params).map(mapCase));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/cases/:slug', (req, res) => {
  try {
    const row = getDatabase().get(
      `SELECT * FROM content_cases WHERE slug = ? AND status = 1 AND ${CH('web')}`,
      req.params.slug
    );
    if (!row) return fail(res, 404, 'case not found');
    ok(res, mapCase(row));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/articles', (req, res) => {
  try {
    const db = getDatabase();
    const where = [`status = 1`, CH('web')];
    const params = [];
    if (req.query.category && req.query.category !== '全部') {
      where.push('category = ?');
      params.push(req.query.category);
    }
    let sql = `SELECT * FROM content_articles WHERE ${where.join(' AND ')}
               ORDER BY is_top DESC, sort ASC`;
    const limit = parseInt(req.query.limit, 10);
    const offset = parseInt(req.query.offset, 10);
    if (limit > 0) {
      sql += ' LIMIT ?';
      params.push(limit);
      if (offset > 0) {
        sql += ' OFFSET ?';
        params.push(offset);
      }
    }
    ok(res, db.all(sql, ...params));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/articles/:slug', (req, res) => {
  try {
    const row = getDatabase().get(
      `SELECT * FROM content_articles WHERE slug = ? AND status = 1 AND ${CH('web')}`,
      req.params.slug
    );
    if (!row) return fail(res, 404, 'article not found');
    ok(res, row);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/partners', (req, res) => {
  try {
    const rows = getDatabase().all(
      `SELECT * FROM content_partners WHERE status = 1 AND ${CH('web')} ORDER BY sort ASC`
    );
    ok(res, rows);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/pages/:slug', (req, res) => {
  try {
    const row = getDatabase().get(
      `SELECT * FROM content_pages WHERE slug = ? AND status = 1 AND ${CH('web')}`,
      req.params.slug
    );
    if (!row) return fail(res, 404, 'page not found');
    ok(res, mapPage(row));
  } catch (e) {
    fail(res, 500, e.message);
  }
});

module.exports = router;
