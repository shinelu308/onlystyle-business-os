<script setup>
/**
 * 洞察动态 —— 文章驱动
 * 官网新闻与公众号推文进的是同一张 articles 表，靠 channel 区分；
 * 这里只拿到 channel 含 web 的文章。
 * 「行业洞察报告」也是文章（category='行业洞察'），不另起内容概念。
 */
import { computed } from 'vue';
import PageHero from '@/components/PageHero.vue';
import CtaSection from '@/components/home/CtaSection.vue';
import { useContent } from '@/composables/useContent.js';
import { articles as fbArticles, newsPage } from '@/data/fallback/articles.js';
import { getArticles } from '@/api/content.js';

const { data: articles } = useContent('articles', fbArticles, getArticles);

const sorted = computed(() =>
  (articles.value || [])
    .filter((a) => a.status !== 0)
    .slice()
    .sort((a, b) => {
      if (!!b.is_top !== !!a.is_top) return b.is_top ? 1 : -1;
      return (a.sort ?? 0) - (b.sort ?? 0);
    })
);

const posts = computed(() => sorted.value.filter((a) => a.category !== newsPage.insightCategory));
const insights = computed(() => sorted.value.filter((a) => a.category === newsPage.insightCategory));
</script>

<template>
  <div class="page">
    <PageHero crumb="洞察动态" :title="newsPage.title" :sub="newsPage.subtitle" />

    <!-- 新闻列表 -->
    <section class="section">
      <div class="container">
        <div class="section-header">
          <div class="eyebrow">News</div>
          <h2 class="section-title">最新动态</h2>
        </div>
        <div class="news-list">
          <article v-for="n in posts" :key="n.slug || n.id" class="news-row info-card">
            <div v-if="n.cover" class="news-cover">
              <img :src="n.cover" :alt="n.title" loading="lazy" />
            </div>
            <div class="news-body">
              <div class="news-meta">
                <span class="news-cat">{{ n.category }}</span>
                <time class="news-date">{{ n.published_at }}</time>
                <span v-if="n.source && n.source !== '原创'" class="news-source">{{ n.source }}</span>
              </div>
              <h3 class="news-title">{{ n.title }}</h3>
              <p class="news-excerpt">{{ n.excerpt }}</p>
              <span class="news-more">
                阅读全文
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </div>
          </article>
        </div>
        <div v-if="!posts.length" class="empty-state">暂无动态。</div>
      </div>
    </section>

    <!-- 行业洞察 -->
    <section v-if="insights.length" class="section section-alt">
      <div class="container">
        <div class="section-header">
          <div class="eyebrow">Industry Insights</div>
          <h2 class="section-title">行业洞察</h2>
        </div>
        <div class="info-grid info-grid-3">
          <div v-for="i in insights" :key="i.slug || i.id" class="info-card insight-card">
            <h3 class="insight-title">{{ i.title }}</h3>
            <p class="insight-desc">{{ i.excerpt }}</p>
            <span class="news-more">
              了解更多
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.5"
                      stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </div>
        </div>
        <p class="section-note">完整文章与报告正在从原站迁移，接口接通后此区自动更新。</p>
      </div>
    </section>
  </div>
</template>
