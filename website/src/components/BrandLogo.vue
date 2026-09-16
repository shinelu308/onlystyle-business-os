<script setup>
/**
 * 品牌图形：优先用内容中台给的图片（site.brand.logo），没有才回落到内置矢量线稿。
 *
 * 为什么要这样：后台上传的 logo 存在 system_settings.general.logo_url，
 * 由 /api/content/site 投影成 brand.logo。以前这里画死了 SVG，
 * 所以「后台换了 logo，官网永远不变」—— 现在改一次后台，四处同步。
 *
 * 矢量兜底那套（轨道环 × 跃迁箭头）保留着，用于 brand.logo 为空的场景。
 * id 必须每实例唯一，否则多实例时 <linearGradient> 只认第一个。
 */
import { computed } from 'vue';

const props = defineProps({
  size: { type: Number, default: 32 },
  // nav 版：外环虚线不透明度 .8 / 内环 .5；footer 版稍暗
  variant: { type: String, default: 'nav' },
  // 内容中台给的品牌图形地址；为空则用矢量兜底
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
});

const uid = `blg${Math.random().toString(36).slice(2, 9)}`;
const outerOp = computed(() => (props.variant === 'footer' ? 0.7 : 0.8));
const innerOp = computed(() => (props.variant === 'footer' ? 0.45 : 0.5));
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :width="size"
    :height="size"
    :alt="alt"
    class="brand-mark-img"
    decoding="async"
  />
  <svg v-else :width="size" :height="size" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="13" :stroke="`url(#${uid})`" stroke-width="1.2"
            stroke-dasharray="5 3" :opacity="outerOp" />
    <circle cx="16" cy="16" r="8" :stroke="`url(#${uid})`" stroke-width="1.2" :opacity="innerOp" />
    <path d="M10 22L16 10L22 22" :stroke="`url(#${uid})`" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="16" cy="10" r="2.5" :fill="`url(#${uid})`" />
    <defs>
      <linearGradient :id="uid" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
        <stop stop-color="#1F5BFF" />
        <stop offset="1" stop-color="#3BE0FF" />
      </linearGradient>
    </defs>
  </svg>
</template>

<style scoped>
/* 上传图尺寸不可控，必须写死框 —— 否则不同素材会把导航高度撑变 */
.brand-mark-img {
  display: block;
  object-fit: contain;
  flex: none;
}
</style>

