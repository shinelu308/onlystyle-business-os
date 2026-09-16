<script setup>
/** 区块标题组：eyebrow / 标题 / 描述，居中或左对齐 */
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  center: { type: Boolean, default: false },
});
</script>

<template>
  <div class="section-header" :style="center ? 'text-align:center' : ''">
    <div v-if="eyebrow" class="eyebrow" :style="center ? 'justify-content:center' : ''">{{ eyebrow }}</div>
    <h2 class="section-title">{{ title }}</h2>
    <p v-if="desc" class="section-desc" :style="center ? 'margin-left:auto;margin-right:auto' : ''">{{ desc }}</p>
  </div>
</template>
