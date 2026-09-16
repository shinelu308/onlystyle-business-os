<script setup>
/**
 * 案例区块（首页 type=cases）
 * 只给筛选条件（featured / limit），数据仍从 cases 内容类型拉 —— 同一批数据不两处维护。
 * 内容量级只有几十条，筛选在前端做，省一次请求也更快。
 */
import { computed } from 'vue';
import SectionHeader from '../SectionHeader.vue';
import { useContent } from '@/composables/useContent.js';
import { cases as fallbackCases } from '@/data/fallback/cases.js';
import { getCases } from '@/api/content.js';

const props = defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  limit: { type: Number, default: 3 },
  featuredOnly: { type: Boolean, default: true },
  moreText: { type: String, default: '' },
  moreTo: { type: String, default: '/cases' },
});

const { data: all } = useContent('cases', fallbackCases, getCases);

const list = computed(() => {
  const src = props.featuredOnly ? all.value.filter((c) => c.featured) : all.value;
  return src.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).slice(0, props.limit);
});

// 设计稿给医疗/文旅两张卡的 tag 单独配色，地产卡用默认品牌色
const tagStyle = {
  blue: '',
  green: 'color:#16A34A;background:rgba(22,163,74,0.08);border-color:rgba(22,163,74,0.18);',
  amber: 'color:#F59E0B;background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.18);',
};
const DOMAIN_STYLE = {
  地产领域: 'blue',
  医疗领域: 'green',
  文旅领域: 'amber',
};
const styleOf = (c) => tagStyle[DOMAIN_STYLE[c.domain] || 'blue'];
</script>

<template>
  <section id="cases" class="cases">
    <div class="container">
      <SectionHeader :eyebrow="eyebrow" :title="title" :desc="subtitle" />

      <div class="cases-grid">
        <div v-for="(c, i) in list" :key="c.slug || c.id" class="case-card">
          <div class="case-card-top" :class="`case-card-top-${(i % 3) + 1}`"></div>
          <div class="case-card-body">
            <span class="case-tag" :style="styleOf(c)">
              {{ c.domain || c.category }}
            </span>
            <div class="case-title">落地项目：{{ c.client || c.title }}</div>
            <p class="case-desc">{{ c.summary || c.subtitle }}</p>
            <p v-if="c.product" class="case-product">（{{ c.product }}）</p>
            <RouterLink :to="moreTo" class="case-arrow">
              了解详情
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5"
                      stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </RouterLink>
          </div>
        </div>
      </div>

      <div v-if="moreText" class="section-more">
        <RouterLink :to="moreTo" class="btn-outline">
          {{ moreText }}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
