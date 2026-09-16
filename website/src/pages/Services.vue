<script setup>
/**
 * 解决方案 —— 服务目录 + 行业方案，均来自内容中台
 * 服务项带 business_line_code（与 BOS 业务线的弱关联，留空表示未归因）。
 */
import { computed } from 'vue';
import PageHero from '@/components/PageHero.vue';
import SvcIcon from '@/components/SvcIcon.vue';
import CtaSection from '@/components/home/CtaSection.vue';
import { useContent } from '@/composables/useContent.js';
import { services as fbServices, industries as fbIndustries, servicesPage } from '@/data/fallback/services.js';
import { getServices, getIndustries } from '@/api/content.js';

const { data: services } = useContent('services', fbServices, getServices);
const { data: industries } = useContent('industries', fbIndustries, getIndustries);

// 只渲染已发布，并按 sort 排
const byOrder = (arr) =>
  (arr || [])
    .filter((x) => x.status !== 0)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

const svcList = computed(() => byOrder(services.value));
const indList = computed(() => byOrder(industries.value));
</script>

<template>
  <div class="page">
    <PageHero crumb="解决方案" :title="servicesPage.title" :sub="servicesPage.subtitle" />

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div class="eyebrow">Our Services</div>
          <h2 class="section-title">我们能提供什么</h2>
          <p class="section-desc">从战略咨询到技术落地，覆盖企业数字化转型的完整链路。</p>
        </div>
        <div class="info-grid info-grid-2">
          <div v-for="s in svcList" :key="s.title" class="info-card svc-block">
            <div class="svc-block-head">
              <div class="service-icon"><SvcIcon :name="s.icon" :size="26" /></div>
              <div>
                <h3 class="svc-block-title">{{ s.title }}</h3>
                <p class="svc-block-desc">{{ s.description }}</p>
              </div>
            </div>
            <ul v-if="s.points && s.points.length" class="svc-points">
              <li v-for="it in s.points" :key="it"><span class="dot"></span>{{ it }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <div class="eyebrow">Industry Solutions</div>
          <h2 class="section-title">行业解决方案</h2>
          <p class="section-desc">面向重点行业的场景化方案，把技术落到真实业务里。</p>
        </div>
        <div class="info-grid info-grid-3">
          <div v-for="ind in indList" :key="ind.title" class="info-card ind-card">
            <div class="service-icon"><SvcIcon :name="ind.icon" :size="26" /></div>
            <h3 class="ind-title">{{ ind.title }}</h3>
            <p class="ind-desc">{{ ind.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <CtaSection />
  </div>
</template>
