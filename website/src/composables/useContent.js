/**
 * 内容读取：有接口走接口，失败静默回落兜底。
 *
 * 为什么这么设计
 * ─────────────
 * · 官网是「内容运营域」的一个分发端点，内容真相源在 BOS 内容中台；
 * · 但后端没起 / 接口挂了 / 首次部署还没接通时，官网**必须照常可用** ——
 *   不能因为后端不在就白屏。兜底数据就是干这个的；
 * · 页面代码完全不感知数据来自哪边，接口通了不需要改任何页面。
 *
 * 缓存
 * ────
 * 同一 key 全站只请求一次。SiteNav / SiteFooter / 页面都读 site，实际只发一个请求。
 *
 * 失败为什么不报错
 * ────────────────
 * 开发期后端经常不在，把错误打满控制台只会淹没真正的问题。
 * 需要排查时把下面 CATCH 分支的注释打开即可。
 */

import { ref, onMounted, getCurrentInstance } from 'vue';

/** key -> 远端返回的数据。命中即代表「这次会话已经拿到过真数据」 */
const CACHE = new Map();

/** 同一 key 并发调用只发一次请求 */
const INFLIGHT = new Map();

function load(key, fetcher) {
  if (CACHE.has(key)) return Promise.resolve(CACHE.get(key));
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);

  const p = fetcher()
    .then((v) => {
      if (v != null) CACHE.set(key, v);
      return v;
    })
    .finally(() => INFLIGHT.delete(key));

  INFLIGHT.set(key, p);
  return p;
}

/**
 * @param {string}   key       缓存键，全站唯一即可（如 'site' / 'cases' / 'page:about'）
 * @param {*}        fallback  兜底数据；接口不可用时的值
 * @param {Function} fetcher   () => Promise<data>
 * @returns {{ data: import('vue').Ref, live: import('vue').Ref<boolean>, refresh: Function }}
 *          live=true 表示当前数据来自内容中台，false 表示用的兜底
 */
export function useContent(key, fallback, fetcher) {
  const data = ref(CACHE.has(key) ? CACHE.get(key) : fallback);
  const live = ref(CACHE.has(key));

  const refresh = async () => {
    if (!fetcher) return;
    try {
      const v = await load(key, fetcher);
      if (v != null) {
        // 形状哨兵：接口形状和兜底不一致时，页面往往在**重渲染阶段**才炸，
        // 而那时首屏 DOM 已经画好了 —— 报错被吞掉，页面就"冻"在旧数据上。
        // 症状是「后台改了内容前台不动」，极难定位。这里提前吼一声。
        if (Array.isArray(v) !== Array.isArray(fallback)) {
          console.warn(
            `[content] ${key} 接口形状与兜底不符：接口=${Array.isArray(v) ? 'array' : typeof v}` +
            `，兜底=${Array.isArray(fallback) ? 'array' : typeof fallback}。请核对 design/内容中台-API契约.md`
          );
        }
        data.value = v;
        live.value = true;
      }
    } catch (e) {
      // CATCH: 静默回落兜底。排查接口问题时打开下面这行。
      // console.warn(`[content] ${key} 回落兜底：`, e.message);
      void e;
    }
  };

  // 在组件 setup 中调用时等挂载后再拉，避免阻塞首屏渲染
  if (getCurrentInstance()) onMounted(refresh);
  else refresh();

  return { data, live, refresh };
}

/** 应用启动前预热（可选）：一次把首屏要的内容拉回来，减少请求瀑布 */
export async function prefetch(entries) {
  await Promise.all(
    entries.map(([key, fetcher]) =>
      load(key, fetcher).catch(() => null)
    )
  );
}
