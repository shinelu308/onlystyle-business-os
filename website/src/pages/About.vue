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
 * 品牌一致性（bos-brand-v1）：设计稿导航的 logo 图标与品牌名不写死，
 * 由本页从 useSite()（/api/content/site，与全站导航同源同兜底）取
 * brand.logo / brand.nameParts，postMessage 灌给 iframe —— 后台换 logo，此处同步。
 */
import { onMounted, onBeforeUnmount, watch } from 'vue';
import { useSite } from '@/composables/useSite.js';

const { data: site } = useSite();

function pushBrand() {
  const frame = document.querySelector('iframe.ab-frame');
  if (!frame || !frame.contentWindow) return;
  // ⚠️ nameParts 是 Vue reactive Proxy 数组，直接放进 postMessage 会抛
  // DataCloneError（structured clone 不认 Proxy）——必须先 spread 成纯数组
  const parts = [...(site.value?.brand?.nameParts || ['ONLY', 'STYLE'])];
  frame.contentWindow.postMessage(
    { type: 'bos-brand', logo: String(site.value?.brand?.logo || ''), nameParts: parts.map(String) },
    '*'
  );
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
    class="ab-frame"
    src="/about-embed.html?v=a1"
    title="关于我们"
    @load="pushBrand"
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
