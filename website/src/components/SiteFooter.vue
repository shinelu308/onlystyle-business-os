<script setup>
/**
 * 页脚：品牌 / 快速导航 / 联系我们 三列 + 底部版权与备案
 * 联系方式与备案号来自内容中台（site.contact / site.legal）。
 * ⚠️ 备案号中国大陆站点必须有，设计稿漏了，这里兜住。
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import BrandLogo from './BrandLogo.vue';
import { useSite } from '@/composables/useSite.js';

const { data: site } = useSite();

const quick = computed(() =>
  (site.value.footerNav || site.value.nav || [])
    .filter((n) => n && n.visible !== false)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
);
</script>

<template>
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <!-- 品牌 -->
        <div>
          <div class="footer-brand-logo">
            <BrandLogo :size="28" variant="footer" />
            <span class="footer-brand-name">
              {{ site.brand.nameParts[0] }}<span>{{ site.brand.nameParts[1] }}</span>
            </span>
          </div>
          <p class="footer-brand-desc">
            {{ site.brand.company }}，专注数字化转型领域，为企业提供全链路数字化解决方案。
          </p>
        </div>

        <!-- 快速导航 -->
        <div>
          <div class="footer-col-title">快速导航</div>
          <ul class="footer-links">
            <li v-for="l in quick" :key="l.to">
              <RouterLink :to="l.to">{{ l.text }}</RouterLink>
            </li>
          </ul>
        </div>

        <!-- 联系我们 -->
        <div>
          <div class="footer-col-title">联系我们</div>
          <ul class="footer-links">
            <li>{{ site.contact.address }}</li>
            <li><a :href="`tel:${site.contact.tel}`">{{ site.contact.tel }}</a></li>
            <li><a :href="`mailto:${site.contact.email}`">{{ site.contact.email }}</a></li>
            <li>{{ site.contact.hours }}</li>
            <li>
              <a :href="site.contact.siteHref" target="_blank" rel="noopener">{{ site.contact.site }}</a>
            </li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <p class="footer-copy">{{ site.legal.copyright }} · {{ site.brand.name }}</p>
        <p class="footer-icp">
          <a :href="site.legal.icpUrl" target="_blank" rel="noopener nofollow">{{ site.legal.icp }}</a>
        </p>
      </div>
    </div>
  </footer>
</template>
