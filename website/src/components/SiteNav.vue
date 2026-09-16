<script setup>
/**
 * 顶部导航：68px 玻璃态，滚动 >40px 加深（.scrolled）
 * 菜单项来自内容中台（site.nav），后台增删改后前台自动跟着变。
 * EN 按钮按决策先隐藏，英文版切好后打开。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import BrandLogo from './BrandLogo.vue';
import { useSite } from '@/composables/useSite.js';

const { data: site } = useSite();

const navs = computed(() =>
  (site.value.nav || [])
    .filter((n) => n && n.visible !== false)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
);
const navCta = computed(() => site.value.navCta || {});

const scrolled = ref(false);
const open = ref(false);

const onScroll = () => {
  scrolled.value = window.scrollY > 40;
};
onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));

const close = () => {
  open.value = false;
};
</script>

<template>
  <nav class="nav" :class="{ scrolled }" role="navigation" aria-label="主导航">
    <div class="container nav-inner">
      <RouterLink to="/" class="nav-logo" :aria-label="`${site.brand.name} 首页`" @click="close">
        <BrandLogo :size="32" :src="site.brand.logo" :alt="site.brand.name" />
        <span class="nav-logo-text">{{ site.brand.nameParts[0] }}<span>{{ site.brand.nameParts[1] }}</span></span>
      </RouterLink>

      <ul class="nav-links" role="list">
        <li v-for="l in navs" :key="l.to">
          <RouterLink :to="l.to" exact-active-class="active">{{ l.text }}</RouterLink>
        </li>
      </ul>

      <RouterLink v-if="navCta.visible !== false" :to="navCta.to || '/contact'" class="nav-cta">
        {{ navCta.text || '联系我们' }}
      </RouterLink>

      <button
        class="nav-menu-btn"
        :aria-label="open ? '关闭菜单' : '打开菜单'"
        :aria-expanded="open"
        @click="open = !open"
      >
        <svg v-if="!open" width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2" y="5" width="18" height="2" rx="1" fill="white" />
          <rect x="2" y="10" width="18" height="2" rx="1" fill="white" />
          <rect x="2" y="15" width="18" height="2" rx="1" fill="white" />
        </svg>
        <svg v-else width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M5 5l12 12M17 5L5 17" stroke="white" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="nav-mobile" :class="{ open }" role="menu">
      <RouterLink v-for="l in navs" :key="l.to" :to="l.to" role="menuitem" @click="close">
        {{ l.text }}
      </RouterLink>
      <RouterLink
        v-if="navCta.visible !== false"
        :to="navCta.to || '/contact'"
        class="nav-cta"
        role="menuitem"
        @click="close"
      >
        {{ navCta.text || '联系我们' }}
      </RouterLink>
    </div>
  </nav>
</template>
