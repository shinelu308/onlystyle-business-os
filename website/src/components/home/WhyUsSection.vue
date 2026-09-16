<script setup>
/** 优势区块（首页 type=why-us）。第一张是 20+ 大字，后两张是两行小字 */
import SectionHeader from '../SectionHeader.vue';

defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  items: { type: Array, default: () => [] },
});

const isBig = (n) => !!n.suffix;
</script>

<template>
  <section id="why-us" class="why-us">
    <div class="container">
      <SectionHeader :eyebrow="eyebrow" :title="title" :desc="subtitle" />
      <div class="why-grid">
        <div v-for="w in items" :key="w.title" class="why-card">
          <div v-if="isBig(w)" class="why-num">
            {{ w.num }}<span class="why-num-suffix">{{ w.suffix }}</span>
          </div>
          <div v-else class="why-num" style="font-size:40px;letter-spacing:-0.02em;">
            <template v-for="(line, i) in String(w.num).split('\n')" :key="i">
              {{ line }}<br v-if="i < String(w.num).split('\n').length - 1" />
            </template>
          </div>
          <div class="why-title">{{ w.title }}</div>
          <p class="why-desc">{{ w.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
