<script setup>
/**
 * 产品介绍（2026-09-18 全新设计版）
 * 完整 Lovart 设计稿整页落地：website/public/products-embed.html
 * （自带导航/Hero 双视频星球/产品区与全部交互，资源本地化 /products-design/；
 * 设计稿自带的简陋页脚已移除）。
 * 布局：路由 meta.hideNav 只隐藏站内 SiteNav（设计稿自带导航）；
 * SiteFooter 由 App.vue 统一渲染在 iframe 下方（本页非 immersive），
 * 与整站同一组件、同一数据源，天然一致。iframe 内部滚动到底后
 * 滚动链自然过渡到父页面页脚。⚠️ 本组件不要再放 <SiteFooter>，会双渲染。
 * 品牌一致性（bos-brand-v1）：nav 的 logo 图标与品牌名不写死，
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
  <!-- ⚠️ embed 内容有更新时必须升 ?v= 版本参数，否则用户浏览器会拿旧缓存 -->
  <iframe
    class="pd-frame"
    src="/products-embed.html?v=b2"
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
