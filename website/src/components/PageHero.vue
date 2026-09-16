<script setup>
/** 内页页头：面包屑 + 标题 + 副标题 */
import { RouterLink } from 'vue-router';

defineProps({
  title: { type: String, required: true },
  sub: { type: String, default: '' },
  crumb: { type: String, required: true },
});
</script>

<template>
  <header class="page-hero">
    <div class="container page-hero-inner">
      <nav class="page-crumb" aria-label="面包屑">
        <RouterLink to="/">首页</RouterLink>
        <span>/</span>{{ crumb }}
      </nav>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="sub" class="page-sub">{{ sub }}</p>
    </div>
  </header>
</template>
