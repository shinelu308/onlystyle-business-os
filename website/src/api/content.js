/**
 * 内容中台公开读接口封装（依 design/内容中台-API契约.md）
 *
 * 统一响应格式：成功 { ok:true, data, version } / 失败 { ok:false, error }
 * 开发期 /api 由 Vite 代理到 BOS（biz-os/backend，3100）；生产由 nginx 同域反代。
 *
 * ⚠️ 这里的方法**失败时一律 throw**，由 useContent 静默回落兜底。
 *    不要在这里吞异常 —— 否则页面分不清拿到的是真数据还是兜底。
 */

const BASE = '/api/content';

/**
 * 接口不可用时的短路：**带冷却窗口，不是永久标志位**。
 *
 * 为什么要冷却而不是一次性关门：
 *   · 后端没起 / 接口整体挂掉时，短路能避免每个 key 各发一次请求、把控制台刷满；
 *   · 但如果做成永久标志位，生产环境一次网络抖动就会让整个会话永远退回兜底，
 *     用户刷新都救不回来。设 20 秒冷却，既能抑制刷屏，又能自动恢复。
 */
const COOLDOWN_MS = 20000;
let downUntil = 0;

export const isApiDown = () => Date.now() < downUntil;
const markDown = () => {
  downUntil = Date.now() + COOLDOWN_MS;
};

async function req(path, { timeout = 6000, method = 'GET', body } = {}) {
  if (isApiDown()) throw new Error('content api unavailable (cooling down)');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });

    // 后端没起时 Vite 代理返回 500/502，nginx 生产环境返回 HTML —— 都算接口不可用
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      markDown();
      throw new Error(`content api unavailable (${r.status})`);
    }

    const json = await r.json();
    if (!r.ok || json.ok === false) throw new Error(json.error || `请求失败（${r.status}）`);
    return json.data;
  } catch (e) {
    // 网络层失败（连不上 / 超时 / 代理 5xx / 返回非 JSON）→ 进入冷却
    if (e.name === 'AbortError' || e instanceof TypeError || /unavailable/.test(e.message)) {
      markDown();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ── 读接口 ── */

export const getBootstrap = () => req('/bootstrap');
export const getSite = () => req('/site');
/**
 * ⚠️ 契约里 /home 的 data 是 **{ blocks: [...] }**，不是裸数组 ——
 *    这里是唯一一个 data 为对象而非数组的列表接口。忘了拆 .blocks 的后果很隐蔽：
 *    首屏用兜底数组正常渲染 → onMounted 拿到对象 → 重渲染时抛 TypeError →
 *    DOM 就停在首屏那一版，表现成「后台改了内容前台死活不动」。
 */
export const getHomeBlocks = () => req('/home').then((d) => (Array.isArray(d) ? d : (d && d.blocks) || []));
export const getPage = (slug) => req(`/pages/${encodeURIComponent(slug)}`);
export const getServices = () => req('/services');
export const getIndustries = () => req('/industries');
export const getCategories = () => req('/categories');
export const getPartners = () => req('/partners');

export function getCases({ category, featured, limit } = {}) {
  const q = new URLSearchParams();
  if (category && category !== '全部') q.set('category', category);
  if (featured) q.set('featured', '1');
  if (limit) q.set('limit', String(limit));
  const s = q.toString();
  return req('/cases' + (s ? `?${s}` : ''));
}

export function getArticles({ category, limit, offset } = {}) {
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  if (limit) q.set('limit', String(limit));
  if (offset) q.set('offset', String(offset));
  const s = q.toString();
  return req('/articles' + (s ? `?${s}` : ''));
}

/* ── 唯一写接口：线索提交 ── */

export async function submitLead(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* 非 JSON 响应 */
    }
    if (!r.ok || (json && json.ok === false)) {
      throw new Error((json && json.error) || `提交失败（${r.status}）`);
    }
    return json?.data ?? json;
  } finally {
    clearTimeout(timer);
  }
}
