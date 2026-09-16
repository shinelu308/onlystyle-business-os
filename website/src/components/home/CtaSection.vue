<script setup>
/**
 * 底部行动号召区块（首页 type=cta，内页也复用）
 * 不传 props 时用默认文案，内页直接 <CtaSection /> 即可。
 */
import { useSite } from '@/composables/useSite.js';

defineProps({
  eyebrow: { type: String, default: 'Get Started' },
  title: { type: String, default: '开启数字化转型' },
  sub: { type: String, default: '与唯风一起，用智能技术驱动业务增长' },
  cta: { type: Object, default: () => ({ text: '联系我们', to: '/contact' }) },
  showPhone: { type: Boolean, default: true },
});

const { data: site } = useSite();
</script>

<template>
  <section id="cta" class="cta-section">
    <div class="cta-orbit" aria-hidden="true">
      <div class="cta-orbit-ring" style="width:600px;height:600px;"></div>
      <div class="cta-orbit-ring" style="width:400px;height:400px;border-color:rgba(31,91,255,0.06);"></div>
      <div class="cta-orbit-ring" style="width:200px;height:200px;border-color:rgba(59,224,255,0.08);"></div>
    </div>
    <div class="container cta-content">
      <div v-if="eyebrow" class="eyebrow" style="justify-content:center;margin-bottom:24px;">{{ eyebrow }}</div>
      <h2 class="cta-title">{{ title }}</h2>
      <p v-if="sub" class="cta-sub">{{ sub }}</p>
      <RouterLink :to="cta.to || '/contact'" class="btn-primary" style="font-size:16px;padding:16px 40px;">
        {{ cta.text || '联系我们' }}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 9h12M10 4l5 5-5 5" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </RouterLink>
      <p v-if="showPhone && site.contact.tel" class="cta-contact">
        或直接拨打 <a :href="`tel:${site.contact.tel}`">{{ site.contact.tel }}</a>
      </p>
    </div>
  </section>
</template>
