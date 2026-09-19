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

/* ── 构建期快照直读（GitHub Pages 静态托管专用）──────────────────
 * ghpages-build.cjs 构建时把后台真实数据以 window.__SNAP__ 内联进页面。
 * 命中即同步返回、不发网络请求：静态托管上 /api/* 本就不存在，
 * 与其每次请求 404 后再回落兜底（首屏 logo/配置全丢），不如直接用
 * 构建时烧录的后台快照。非快照环境无此变量，走网络的默认行为完全不变。
 * 返回值约定：null = 无快照环境（继续走网络）；
 *            undefined = 快照环境但未含该 key（视为接口不可用，进冷却）。
 */
function snapGet(path) {
  const snap = typeof window !== 'undefined' ? window.__SNAP__ : null;
  if (!snap) return null;
  const key = path.replace(/^\//, '').split('?')[0];
  return Object.prototype.hasOwnProperty.call(snap, key) ? snap[key] : undefined;
}

async function req(path, { timeout = 6000, method = 'GET', body } = {}) {
  // 快照直读优先（仅 GET；拦截 /api/leads 等写接口不受影响）
  if (method === 'GET') {
    const hit = snapGet(path);
    if (hit !== null) {
      if (hit === undefined) {
        markDown();
        throw new Error(`snapshot miss: ${path}`);
      }
      return hit.data;
    }
  }
  if (isApiDown()) throw new Error('content api unavailable (cooling down)');

  // 预览模式（后台实时预览面板的 iframe 会带 ?preview=1 打开官网）：
  // 所有读接口追加 pv=时间戳 → 后端识别后下发 no-store，绕过 60 秒 HTTP 缓存，保存即见。
  // 普通访客的页面 URL 没有这个参数，照常走 60 秒缓存，线上行为不变。
  let url = BASE + path;
  try {
    if (new URLSearchParams(location.search).get('preview') === '1') {
      url += (path.indexOf('?') >= 0 ? '&' : '?') + 'pv=' + Date.now();
    }
  } catch { /* 非浏览器环境忽略 */ }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
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
