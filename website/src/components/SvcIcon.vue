<script setup>
/**
 * 线性图标集：轨道环 × 跃迁箭头 母题的延展
 * 渐变 id 每实例唯一，避免同页多图标时只认第一个
 */
const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 26 },
  from: { type: String, default: '#1F5BFF' },
  to: { type: String, default: '#3BE0FF' },
});

// 必须是普通常量，不能是 computed（模板里要做字符串拼接）
const id = `ic-${props.name}-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="id" x1="2" y1="2" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop :stop-color="from" />
        <stop offset="1" :stop-color="to" />
      </linearGradient>
    </defs>
    <g :stroke="`url(#${id})`" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">

      <template v-if="name === 'orbit'">
        <circle cx="13" cy="13" r="10" stroke-dasharray="5 3" />
        <circle cx="13" cy="13" r="5" opacity="0.6" />
        <circle cx="13" cy="13" r="2" :fill="`url(#${id})`" stroke="none" />
      </template>

      <template v-else-if="name === 'arrow'">
        <path d="M5 19L13 7L21 19" />
        <path d="M17 13l4 6H5" opacity="0.4" />
        <circle cx="13" cy="7" r="2.5" :fill="`url(#${id})`" stroke="none" />
      </template>

      <template v-else-if="name === 'check'">
        <rect x="4" y="4" width="18" height="18" rx="4" />
        <path d="M9 13l3 3 5-5" />
      </template>

      <template v-else-if="name === 'cloud'">
        <path d="M8 19a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.5 3.5 0 0118 19H8z" />
        <path d="M13 12v-3M13 9l-2 2M13 9l2 2" opacity="0.6" />
      </template>

      <template v-else-if="name === 'chip'">
        <rect x="7" y="7" width="12" height="12" rx="2.5" />
        <rect x="11" y="11" width="4" height="4" rx="1" :fill="`url(#${id})`" stroke="none" />
        <path d="M13 4v3M13 19v3M4 13h3M19 13h3" />
      </template>

      <template v-else-if="name === 'shield'">
        <path d="M13 3l8 3v7c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3z" />
        <path d="M9.5 13l2.5 2.5 4.5-5" />
      </template>

      <template v-else-if="name === 'city'">
        <path d="M4 21V10l5-3v14M9 21V7l6 3v11M15 21v-7l6-2v9" />
        <path d="M4 21h17" opacity="0.6" />
      </template>

      <template v-else-if="name === 'heart'">
        <path d="M13 21s-7-4.3-7-9.2A4.2 4.2 0 0113 9.4a4.2 4.2 0 017 2.4C20 16.7 13 21 13 21z" />
        <path d="M9.5 12.6h2l1.2-2 1.4 3.4 1-1.4h1.6" opacity="0.7" />
      </template>

      <template v-else-if="name === 'landmark'">
        <path d="M4 21h18M5 21V11M21 21V11M3 11l10-6 10 6H3z" />
        <path d="M10 21v-6M13 21v-6M16 21v-6" opacity="0.7" />
      </template>

      <template v-else-if="name === 'bulb'">
        <path d="M13 3a6 6 0 00-3.4 10.9c.5.4.9 1 .9 1.6V17h5v-1.5c0-.6.4-1.2.9-1.6A6 6 0 0013 3z" />
        <path d="M10.5 20h5" opacity="0.6" />
      </template>

      <template v-else-if="name === 'users'">
        <circle cx="10" cy="9" r="3" />
        <path d="M4 20a6 6 0 0112 0" />
        <path d="M17 7.5a3 3 0 010 5.6M18 20a6 6 0 00-2-4.5" opacity="0.6" />
      </template>

      <template v-else-if="name === 'star'">
        <path d="M13 3l3 6.3 6.7.9-4.9 4.7 1.2 6.7L13 18.4 7 21.6l1.2-6.7L3.3 10.2l6.7-.9L13 3z" />
      </template>

      <template v-else-if="name === 'pin'">
        <path d="M13 24s7-6.4 7-12a7 7 0 10-14 0c0 5.6 7 12 7 12z" />
        <circle cx="13" cy="12" r="2.6" />
      </template>

      <template v-else-if="name === 'phone'">
        <path d="M8 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2.2 2A16 16 0 016 6.2 2 2 0 018 4z" />
      </template>

      <template v-else-if="name === 'mail'">
        <rect x="3" y="6" width="20" height="14" rx="2.5" />
        <path d="M3.6 7.5L13 14l9.4-6.5" />
      </template>

      <template v-else-if="name === 'clock'">
        <circle cx="13" cy="13" r="9" />
        <path d="M13 8v5.4l3.4 2" />
      </template>

      <template v-else-if="name === 'wechat'">
        <path d="M10 5.5c-4 0-7 2.7-7 6 0 1.9 1 3.6 2.6 4.7l-.7 2.3 2.6-1.4c.8.2 1.6.4 2.5.4" />
        <path d="M16 10.5c-3.3 0-6 2.2-6 5s2.7 5 6 5c.7 0 1.4-.1 2-.3l2.2 1.2-.6-2c1.4-.9 2.4-2.3 2.4-3.9 0-2.8-2.7-5-6-5z" opacity="0.75" />
      </template>

    </g>
  </svg>
</template>
