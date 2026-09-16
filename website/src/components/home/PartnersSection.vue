<script setup>
/**
 * 合作伙伴区块（首页 type=partners）
 * 数据从 partners 内容类型拉；logo 是白底画布，靠 .partner-item 的白色 chip 承载。
 */
import { useContent } from '@/composables/useContent.js';
import { partners as fallbackPartners } from '@/data/fallback/partners.js';
import { getPartners } from '@/api/content.js';

defineProps({
  label: { type: String, default: '' },
});

const { data: list } = useContent('partners', fallbackPartners, getPartners);
</script>

<template>
  <section id="partners" class="partners">
    <div class="container">
      <div class="partners-inner">
        <div v-if="label" class="partners-label">{{ label }}</div>
        <div class="partners-row" role="list" aria-label="合作伙伴列表">
          <div v-for="p in list" :key="p.name" class="partner-item" role="listitem">
            <a v-if="p.url" :href="p.url" target="_blank" rel="noopener">
              <img :src="p.logo" :alt="p.name" loading="lazy" />
            </a>
            <img v-else-if="p.logo" :src="p.logo" :alt="p.name" loading="lazy" />
            <span v-else class="partner-text">{{ p.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
