<script setup>
/**
 * 产品介绍（2026-09-18 全新设计版）
 * 完整 Lovart 设计稿整页落地：website/public/products-embed.html
 * （自带导航/Hero 双视频星球/产品区/页脚与全部交互，资源本地化 /products-design/）。
 * 本组件只做全屏 iframe 载体；路由 meta.immersive = true，
 * App.vue 在此页不渲染 SiteNav / SiteFooter，保证设计稿效果 100% 还原。
 * 设计稿导航内的站内链接已加 target="_top" 跳出 iframe（首页/解决方案/案例星球/关于我们/联系我们）。
 */
</script>

<template>
  <iframe
    class="pd-frame"
    src="/products-embed.html"
    title="产品介绍"
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
