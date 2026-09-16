<script setup>
/**
 * 案例展示 —— 分类筛选 + 案例列表
 * 案例与分类都来自内容中台；筛选在前端做（内容量级几十条，不值得每次发请求）。
 * 筛选状态同步到 URL query，便于分享和被收录。
 */
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHero from '@/components/PageHero.vue';
import CtaSection from '@/components/home/CtaSection.vue';
import { useContent } from '@/composables/useContent.js';
import { cases as fbCases, caseCategories as fbCategories } from '@/data/fallback/cases.js';
import { getCases, getCategories } from '@/api/content.js';

const route = useRoute();
const router = useRouter();

const { data: allCases } = useContent('cases', fbCases, getCases);
const { data: categories } = useContent('categories', fbCategories, getCategories);

const active = ref(
  typeof route.query.cat === 'string' && fbCategories.includes(route.query.cat) ? route.query.cat : '全部'
);

const list = computed(() => {
  const cats = categories.value || fbCategories;
  if (!cats.includes(active.value)) active.value = '全部';
  const src = (allCases.value || []).filter((c) => c.status !== 0);
  const filtered = active.value === '全部' ? src : src.filter((c) => c.category === active.value);
  return filtered.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
});

function pick(c) {
  active.value = c;
  router.replace({ query: c === '全部' ? {} : { cat: c } });
}

// 浏览器前进后退时同步
watch(
  () => route.query.cat,
  (v) => {
    const cats = categories.value || fbCategories;
    active.value = typeof v === 'string' && cats.includes(v) ? v : '全部';
  }
);
</script>

<template>
  <div class="page">
    <PageHero crumb="案例展示" title="案例展示" sub="探索我们的成功案例" />

    <section class="section">
      <div class="container">
        <div class="filter-row" role="tablist" aria-label="案例分类">
          <button
            v-for="c in categories || fbCategories"
            :key="c"
            class="filter-btn"
            :class="{ on: active === c }"
            role="tab"
            :aria-selected="active === c"
            @click="pick(c)"
          >
            {{ c }}
          </button>
        </div>

        <div v-if="list.length" class="cases-list">
          <article v-for="c in list" :key="c.slug || c.id" class="case-row info-card">
            <div class="case-row-cover">
              <img v-if="c.cover" :src="c.cover" :alt="c.title" loading="lazy" />
            </div>
            <div class="case-row-body">
              <span class="case-tag">{{ c.category }}</span>
              <h3 class="case-row-title">{{ c.title }}</h3>
              <p class="case-row-sub">{{ c.subtitle }}</p>
              <div v-if="c.metrics && c.metrics.length" class="metric-grid">
                <div v-for="m in c.metrics" :key="m.label" class="metric">
                  <div class="metric-value">{{ m.value }}</div>
                  <div class="metric-label">{{ m.label }}</div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">该分类下暂无案例，敬请期待。</div>
      </div>
    </section>

    <CtaSection />
  </div>
</template>
