<script setup>
/**
 * 关于我们（2026-09-19 全新设计版）
 * 完整 Lovart 设计稿整页落地：website/public/about-embed.html
 * （Hero 视频/公司简介/核心数据/品牌时间线/舰队成员全息头像/星舰系统 three.js/
 *  航行资质/CTA，全部交互与动画原样保留；资源本地化 /about-design/）。
 *
 * 布局（与 /products 同一套约定）：
 *  · 路由 meta.hideNav → 只隐藏站内 SiteNav（设计稿自带导航，logo/品牌名由本页同源灌入）；
 *  · SiteFooter 由 App.vue 统一渲染在 iframe 下方（本页非 immersive）——
 *    与整站同一组件、同一数据源，保证页脚全局一致。
 *    ⚠️ 本组件不要再放 <SiteFooter>，会双渲染。
 *
 * 两个 postMessage 协议（都从本页发往 iframe）：
 *  ① bos-brand-v1   —— 设计稿导航的 logo / 品牌名不写死，从 useSite() 取（与全站同源同兜底）；
 *  ② bos-about-v1   —— 8 个区块的文案与证书图片，从内容中台 page:about 取。
 *
 * ⚠️ bos-about **不设本页兜底文案**：embed 里的静态 markup 就是设计稿原文，
 *    而它的 setText 遇到空值会跳过 → 于是「字段为空 = 保持设计稿原文」，
 *    天然逐字段回落，不需要在 Vue 里再抄一份文案（抄三份必然漂移）。
 */
import { computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useSite } from '@/composables/useSite.js';
import { useContent } from '@/composables/useContent.js';
import { getPage } from '@/api/content.js';

const { data: site } = useSite();

/* ── 把 content_pages.about 的 blocks 整理成 embed 认识的信封 ── */
const ABOUT_TYPES = ['hero', 'profile', 'stats', 'timeline', 'crew', 'tech', 'credentials', 'cta'];

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? '' : String(v));
/** 只挑出要下发的键并转成字符串 —— 不给脏数据留穿透到 innerHTML 的机会 */
function pick(src, keys) {
  const o = {};
  for (const k of keys) {
    const v = src ? src[k] : undefined;
    if (v !== undefined && v !== null && v !== '') o[k] = str(v);
  }
  return o;
}

function normalize(row) {
  const src = row && typeof row === 'object' ? row : {};
  const blocks = arr(src.blocks);
  const g = (t) => blocks.find((b) => b && b.type === t) || {};
  const out = {};
  for (const t of ABOUT_TYPES) out[t] = g(t);

  return {
    hero: pick(out.hero, ['title', 'subtitleBold', 'subtitleRest', 'hint', 'ctaText']),
    profile: Object.assign(pick(out.profile, ['eyebrow', 'title', 'em', 'body', 'caption']), {
      tags: arr(out.profile.tags).map(str).filter(Boolean),
    }),
    stats: {
      items: arr(out.stats.items).map((it) => pick(it, ['value', 'unit', 'label', 'note'])),
    },
    timeline: Object.assign(pick(out.timeline, ['eyebrow', 'title', 'em']), {
      items: arr(out.timeline.items).map((it) =>
        Object.assign(pick(it, ['year', 'small', 'title', 'desc', 'badge', 'code']), { now: !!it.now })
      ),
    }),
    crew: Object.assign(pick(out.crew, ['eyebrow', 'title', 'em', 'sub']), {
      items: arr(out.crew.items).map((it) => pick(it, ['id', 'role', 'en', 'desc'])),
    }),
    tech: Object.assign(pick(out.tech, ['eyebrow', 'title', 'em']), {
      items: arr(out.tech.items).map((it) => pick(it, ['idx', 'title', 'desc'])),
    }),
    credentials: Object.assign(pick(out.credentials, ['eyebrow', 'title', 'em', 'sub']), {
      items: arr(out.credentials.items).map((it) =>
        Object.assign(pick(it, ['name', 'imageUrl', 'issuerLabel', 'issuer']), {
          fields: arr(it.fields).map((f) => Object.assign(pick(f, ['k', 'v']), { mono: !!f.mono })),
        })
      ),
    }),
    cta: pick(out.cta, ['title', 'subtitle', 'ctaText', 'ctaUrl']),
  };
}

const { data: rawPage } = useContent('page:about', null, () => getPage('about'));
const about = computed(() => normalize(rawPage.value));

function postToEmbed(payload) {
  const frame = document.querySelector('iframe.ab-frame');
  if (!frame || !frame.contentWindow) return;
  // ⚠️ payload 里全是 Vue 的 reactive Proxy（对象/数组），structured clone 不认 Proxy，
  //    直接 postMessage 会抛 DataCloneError。JSON 往返一次拿到纯对象
  //    （products 页是手写 spread；这里嵌套层级多，统一净化更不容易漏）。
  frame.contentWindow.postMessage(JSON.parse(JSON.stringify(payload)), '*');
}

function pushBrand() {
  // ⚠️ nameParts 是 Vue reactive Proxy 数组，必须先 spread 成纯数组
  const parts = [...(site.value?.brand?.nameParts || ['ONLY', 'STYLE'])];
  postToEmbed({
    type: 'bos-brand',
    logo: String(site.value?.brand?.logo || ''),
    nameParts: parts.map(String),
  });
}

function pushAbout() {
  postToEmbed(Object.assign({ type: 'bos-about' }, about.value));
}

function pushAll() {
  pushBrand();
  pushAbout();
}

onMounted(() => {
  // iframe 内监听器就绪时机不确定，挂 load + 前几秒补发几次
  pushAll();
  const timers = [300, 900, 2000].map((t) => setTimeout(pushAll, t));
  onBeforeUnmount(() => timers.forEach(clearTimeout));
});
watch(() => site.value?.brand, pushBrand, { deep: true });
watch(about, pushAbout, { deep: true });
</script>

<template>
  <!-- ⚠️ embed 内容有更新时必须升 ?v= 版本参数，否则用户浏览器会拿旧缓存 -->
  <iframe
    class="ab-frame"
    src="/about-embed.html?v=a3"
    title="关于我们"
    @load="pushAll"
  ></iframe>
</template>

<style scoped>
.ab-frame {
  display: block;
  width: 100%;
  height: 100vh;
  border: none;
  background: #050810;
}
</style>
