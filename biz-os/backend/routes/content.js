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

/**
 * 分类 → 星球行业键。
 * 设计稿给的星球贴图只有 3 个行业（estate / medical / culture），
 * 后台却有 4 个分类（商业地产 / 公共公益 / 文化旅游 / 零售医药）。
 * 这里**不写死成 4 个分支**：已知分类映射到有贴图的键，未知分类走稳定哈希键，
 * 前端遇到没有贴图的行业会程序化生成一颗行星 ——
 * 于是「后台新增一个分类」天然就等于「多出一条轨道」，不需要改前端。
 */
const INDUSTRY_BY_CATEGORY = {
  商业地产: 'estate',
  公共公益: 'medical',
  文化旅游: 'culture',
  零售医药: 'retail',
};

/** 字符串 → 稳定短键（djb2 → base36）。同一个分类每次必须得到同一个键，否则轨道会漂移 */
function stableKey(s) {
  let h = 5381;
  const str = String(s || 'other');
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function industryKey(category, ext) {
  if (ext && ext.industry) return String(ext.industry);
  if (INDUSTRY_BY_CATEGORY[category]) return INDUSTRY_BY_CATEGORY[category];
  return 'cat-' + stableKey(category);
}

/**
 * 详情面板的「关键成果」。
 * 优先用后台显式填的 ext.results；没填就从结构化 metrics 派生（「45% 销售额增长」）。
 * 派生这一步是为了让**已有的 4 条案例不改数据就能直接出成果列表**。
 */
function resultsOf(ext, metrics) {
  if (ext && Array.isArray(ext.results) && ext.results.length) return ext.results.map(String);
  return (metrics || [])
    .map((m) => [m && m.value, m && m.label].filter(Boolean).join(' '))
    .filter(Boolean);
}

/**
 * 内容行 → 前端形状（解析 JSON 字段、把 0/1 转成布尔）
 *
 * ⚠️ mapCase 额外投影了案例星系的字段（industry / results / color / textureKey）。
 *    这些字段的真相源是 `ext` 这一列 JSON —— **不新增数据库列**，
 *    所以老数据零改动、后台老表单也不会把它们覆盖没。
 */
const mapService = (r) => ({ ...r, points: parse(r.points, []) });
const mapCase = (r) => {
  const ext = parse(r.ext, {});
  const metrics = parse(r.metrics, []);
  return {
    ...r,
    metrics,
    featured: !!r.featured,
    ext,
    // ── 案例星系（/cases） ──
    industry: industryKey(r.category, ext),
    industryLabel: r.category || '其他',
    results: resultsOf(ext, metrics),
    color: (ext && ext.color) || '',
    textureKey: (ext && (ext.textureKey || ext.texture)) || '',
  };
};
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

/**
 * buildSite 只允许导出的顶层组（白名单）。
 * 🔴 这里必须是白名单、不能是黑名单：content_settings 是一张通用 KV 表，
 *    由后台「系统设置」页写入，除了官网字段还躺着 admin.content_token
 *    （= /api/content/admin/* 全部写接口的共享令牌 + 内容鉴权的签名密钥）
 *    和 system 组内部键。而 /api/content/site 与 /bootstrap 都是公开无鉴权接口，
 *    早期只过滤 /^content\./，导致令牌被公开 JSON 原样吐出 → 拿到即可改站。
 *    新增官网字段时，把它的组名加到这里即可。
 */
const SITE_GROUPS = ['brand', 'contact', 'legal', 'seo', 'nav', 'footer'];

/**
 * 读后台「系统设置」的 general 组。
 * 品牌图形（logo）与副标题的**唯一写入点**在那里（后台设置页有上传 UI），
 * 官网的 brand 从这里「投影」出来 —— 保证「后台改一次，官网 + 后台四处同步」。
 */
function readGeneral(db) {
  const g = {};
  for (const r of db.all("SELECT setting_key, setting_value FROM system_settings WHERE setting_group = 'general'")) {
    g[r.setting_key] = r.setting_value;
  }
  return g;
}

/** KV 设置 → 扁平对象（brand.name → { brand: { name } }） */
function buildSite(db) {
  const rows = db.all('SELECT key, value FROM content_settings');
  const out = {};
  for (const r of rows) {
    const [k1, k2] = r.key.split('.');
    if (SITE_GROUPS.indexOf(k1) === -1) continue; // 白名单外一律不外泄
    if (!out[k1]) out[k1] = {};
    out[k1][k2 || 'value'] = r.value;
  }
  out.brand = out.brand || {};

  // ── 品牌图形 / 副标题：投影自 system_settings.general（后台上传入口在那里）。
  //    官网自己不再画死 logo，只消费这里给的地址；地址为空时前端回落到矢量兜底。
  //    ⚠️ 以前官网没有这个字段，所以「后台换了 logo 官网永远不变」。
  const gen = readGeneral(db);
  out.brand.logo = gen.logo_url || '';
  out.brand.logoSubtitle = gen.logo_subtitle || '';

  // 品牌名拆两段（ONLY + STYLE）供 logo 双色渲染。
  // 🔴 必须按 STYLE 后缀切，不能按长度折半：ONLYSTYLE 有 9 个字符，
  //    Math.ceil(9/2) = 5 会切出 ["ONLYS","TYLE"]。规则与后台侧栏 applyBrandingSettings() 逐字一致。
  const n = String(out.brand.name || 'ONLYSTYLE');
  const m = n.match(/^(.*?)(STYLE)$/i);
  out.brand.nameParts = (m && m[1]) ? [m[1], m[2].toUpperCase()] : [n];

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
