<script setup>
/**
 * Hero 区块（首页 type=hero）
 *
 * 视频背景是 Lovart 设计稿的既定素材，不要拿 canvas 手搓。
 * 结构顺序：video → overlay（左深右浅）→ glow → content → scroll 指示
 */
import { computed } from 'vue';
import { useSite } from '@/composables/useSite.js';

const props = defineProps({
  badge: { type: String, default: '' },
  h1: { type: String, default: '' },
  h2: { type: String, default: '' },
  desc: { type: String, default: '' },
  /** descFrom='brand' 时用「公司全称 · slogan」拼，避免改公司名要改两处 */
  descFrom: { type: String, default: '' },
  cta: { type: Array, default: () => [] },
  stats: { type: Array, default: () => [] },
});

const { data: site } = useSite();

const descText = computed(() => {
  if (props.desc) return props.desc;
  if (props.descFrom === 'brand') {
    return `${site.value.brand.company} · ${site.value.brand.slogan}`;
  }
  return '';
});

const btnClass = (s) => (s === 'outline' ? 'btn-outline' : 'btn-primary');
</script>

<template>
  <section id="hero" class="hero">
    <video
      class="hero-bg"
      autoplay
      loop
      muted
      playsinline
      preload="metadata"
      poster="/media/hero-poster.jpg"
      aria-hidden="true"
    >
      <source src="/media/hero-video.mp4" type="video/mp4" />
      <img
        src="/media/hero-fallback.png"
        alt=""
        style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center right;"
      />
    </video>
    <div class="hero-overlay"></div>
    <div class="hero-glow"></div>

    <div class="container hero-content">
      <div v-if="badge" class="hero-badge">
        <span class="hero-badge-dot"></span>
        {{ badge }}
      </div>

      <h1 v-if="h1" class="hero-title">{{ h1 }}</h1>
      <h2 v-if="h2" class="hero-subtitle">{{ h2 }}</h2>
      <p v-if="descText" class="hero-desc">{{ descText }}</p>

      <div v-if="cta.length" class="hero-ctas">
        <RouterLink
          v-for="(c, i) in cta"
          :key="c.text"
          :to="c.to"
          :class="btnClass(c.style)"
        >
          {{ c.text }}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              v-if="i === 0"
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
            />
            <template v-else>
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
            </template>
          </svg>
        </RouterLink>
      </div>

      <div v-if="stats.length" class="hero-stats">
        <div v-for="s in stats" :key="s.label">
          <div class="hero-stat-num">
            {{ s.num }}<span v-if="s.suffix" style="font-size:22px;">{{ s.suffix }}</span>
          </div>
          <div class="hero-stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <div class="hero-scroll" aria-hidden="true">
      <div class="hero-scroll-bar"></div>
      <span>Scroll</span>
    </div>
  </section>
</template>
