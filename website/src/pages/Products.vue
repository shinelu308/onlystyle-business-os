<script setup>
/**
 * 产品介绍（2026-09-18 全新设计版）
 * 完整 Lovart 设计稿整页落地：website/public/products-embed.html
 * （自带导航/Hero 双视频星球/产品区/页脚与全部交互，资源本地化 /products-design/）。
 * 本组件只做全屏 iframe 载体；路由 meta.immersive = true，
 * App.vue 在此页不渲染 SiteNav / SiteFooter，保证设计稿效果 100% 还原。
 * 设计稿导航内的站内链接已加 target="_top" 跳出 iframe。
 *
 * 品牌一致性（bos-brand-v1）：设计稿 nav 里的 logo 图标与品牌名不写死，
 * 由本页从 useSite()（/api/content/site，与全站导航同源同兜底）取 brand.logo /
 * brand.nameParts，postMessage 灌给 iframe —— 后台换 logo，此处同步。
 */
import { onMounted, watch } from 'vue';
import { useSite } from '@/composables/useSite.js';

const { data: site } = useSite();

function pushBrand() {
  const frame = document.querySelector('iframe.pd-frame');
  if (!frame || !frame.contentWindow) return;
  // ⚠️ nameParts 是 Vue reactive Proxy 数组，直接放进 postMessage 会抛
  // DataCloneError（structured clone 不认 Proxy）——必须先 spread 成纯数组
  const parts = [...(site.value?.brand?.nameParts || ['ONLY', 'STYLE'])];
  const payload = { type: 'bos-brand', logo: String(site.value?.brand?.logo || ''), nameParts: parts.map(String) };
  frame.contentWindow.postMessage(payload, '*');
}

onMounted(() => {
  // iframe 内监听器就绪时机不确定，挂 load + 前几秒补发几次
  pushBrand();
  const timers = [300, 900, 2000].map((t) => setTimeout(pushBrand, t));
  onBeforeUnmount(() => timers.forEach(clearTimeout));
});
watch(() => site.value?.brand, pushBrand, { deep: true });
</script>

<template>
  <iframe
    class="pd-frame"
    src="/products-embed.html"
    title="产品介绍"
    @load="pushBrand"
  ></iframe>
</template>

<style scoped>
.pd-frame {
  display: block;
  width: 100%;
  height: 100vh;
  border: none;
  background: #060a13;
}
</style>
