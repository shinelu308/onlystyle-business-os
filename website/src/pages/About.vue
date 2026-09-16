<script setup>
/**
 * 关于我们 —— 单页内容驱动
 * 页面结构由 pages.about.blocks 决定（prose / duo / iconGrid），
 * 后台加一段、调顺序都不用改这个文件。
 */
import PageHero from '@/components/PageHero.vue';
import SvcIcon from '@/components/SvcIcon.vue';
import CtaSection from '@/components/home/CtaSection.vue';
import { useContent } from '@/composables/useContent.js';
import { pages as fallbackPages } from '@/data/fallback/pages.js';
import { getPage } from '@/api/content.js';

const { data: page } = useContent('page:about', fallbackPages.about, () => getPage('about'));
</script>

<template>
  <div class="page">
    <PageHero crumb="关于我们" :title="page.title" :sub="page.subtitle" />

    <template v-for="(b, i) in page.blocks || []" :key="i">
      <!-- 段落块 -->
      <section v-if="b.type === 'prose'" class="section">
        <div class="container">
          <div class="info-grid info-grid-2 about-intro">
            <div>
              <div v-if="b.eyebrow" class="eyebrow">{{ b.eyebrow }}</div>
              <h2 class="section-title">{{ b.title }}</h2>
            </div>
            <div class="prose"><p>{{ b.body }}</p></div>
          </div>
        </div>
      </section>

      <!-- 双栏卡（愿景 / 使命） -->
      <section v-else-if="b.type === 'duo'" class="section section-alt">
        <div class="container">
          <div class="info-grid info-grid-2">
            <div v-for="it in b.items" :key="it.label" class="info-card vision-card">
              <div class="vision-label">{{ it.label }}</div>
              <p class="vision-text">{{ it.text }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 带图标四宫格（核心价值观） -->
      <section v-else-if="b.type === 'iconGrid'" class="section">
        <div class="container">
          <div class="section-header">
            <div v-if="b.eyebrow" class="eyebrow">{{ b.eyebrow }}</div>
            <h2 class="section-title">{{ b.title }}</h2>
          </div>
          <div class="info-grid info-grid-4">
            <div v-for="it in b.items" :key="it.title" class="info-card value-card">
              <div class="service-icon"><SvcIcon :name="it.icon" :size="26" /></div>
              <div class="value-title">{{ it.title }}</div>
              <p class="value-desc">{{ it.desc }}</p>
            </div>
          </div>
        </div>
      </section>
    </template>

    <CtaSection />
  </div>
</template>
