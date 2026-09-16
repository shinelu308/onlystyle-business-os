<script setup>
/** 服务区块（首页 type=services）。文案与条目都由后台配置透传 */
import SectionHeader from '../SectionHeader.vue';
import SvcIcon from '../SvcIcon.vue';

defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  items: { type: Array, default: () => [] },
});

// 设计稿给三张卡不同的图标底色
const iconStyle = {
  blue: '',
  cyan: 'background:rgba(59,224,255,0.10);border-color:rgba(59,224,255,0.18);',
  green: 'background:rgba(22,163,74,0.10);border-color:rgba(22,163,74,0.18);',
};
</script>

<template>
  <section id="services" class="services">
    <div class="container">
      <SectionHeader :eyebrow="eyebrow" :title="title" :desc="subtitle" />
      <div class="services-grid">
        <div v-for="s in items" :key="s.title" class="service-card">
          <div class="service-icon" :style="iconStyle[s.accent]">
            <SvcIcon :name="s.icon" :size="26" />
          </div>
          <div v-if="s.num" class="service-num">{{ s.num }}</div>
          <div class="service-title">{{ s.title }}</div>
          <div class="service-subtitle">{{ s.subtitle }}</div>
          <p class="service-desc">{{ s.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
