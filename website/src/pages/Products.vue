<script setup>
/**
 * 产品介绍（2026-09-18 全新设计版）
 * 完整 Lovart 设计稿整页落地：website/public/products-embed.html
 * （自带导航/Hero 双视频星球/产品区与全部交互，资源本地化 /products-design/；
 * 设计稿自带的简陋页脚已移除）。
 * 布局：路由 meta.hideNav 只隐藏站内 SiteNav（设计稿自带导航）；
 * SiteFooter 由 App.vue 统一渲染在 iframe 下方（本页非 immersive），
 * 与整站同一组件、同一数据源，天然一致。iframe 内部滚动到底后
 * 滚动链自然过渡到父页面页脚。⚠️ 本组件不要再放 <SiteFooter>，会双渲染。
 *
 * 品牌一致性（bos-brand-v1）：nav 的 logo 图标与品牌名不写死，
 * 由本页从 useSite()（/api/content/site，与全站导航同源同兜底）取 brand.logo /
 * brand.nameParts，postMessage 灌给 iframe —— 后台换 logo，此处同步。
 *
 * 文案动态化（bos-products-v1）：后台「网站管理 → 产品介绍」的
 * 页头副标题 + 两张产品卡（徽标/标题/描述/按钮文案与链接）通过
 * useContent('page:products') 从内容中台拉取（拉取失败回落本页兜底 =
 * 设计稿原文），postMessage 灌给 iframe。功能矩阵/跃迁航线/机器人/
 * 流水线仍是设计稿内置内容，暂不开放编辑。
 */
import { computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useSite } from '@/composables/useSite.js';
import { useContent } from '@/composables/useContent.js';
import { getPage } from '@/api/content.js';

const { data: site } = useSite();

/** 兜底 = 设计稿原文（embed 里烧录的同一份），接口不可用时页面照常可用 */
const PRODUCTS_FB = {
  subtitle: '以自研「楼达人资产管理平台」与「唯风数字营销自动化平台」为核心，为园区与楼宇资方提供资产管理数字化的一站式方案，为企业提供营销内容生产与分发的全流程自动化。',
  loudaren: {
    badges: '主打产品 · SAAS 模式 · 开箱即用 · 多业态资产运营',
    title: '楼达人资产管理平台',
    desc: '面向写字楼、园区、商业、公寓等多业态资产，提供覆盖「资产数字化台账 — 招商租赁 — 业财一体 — 运营增值」全流程的一站式运营系统，让每一平米资产可视、可控、可增值。',
    ctaText: '进入平台 ↗',
    ctaUrl: 'https://biz.loudaren.com/orgs/#/index?from=system',
  },
  weifeng: {
    badges: '营销自动化 · 内容生产 · 全渠道分发',
    title: '唯风数字营销自动化平台',
    desc: '为企业提供营销内容生产与分发的全流程自动化，从素材管理、智能内容生成到多渠道一键分发与数据回流，让营销更高效、增长可度量。',
    ctaText: '进入平台 ↗',
    ctaUrl: '/contact',
  },
};

/** 后台徽标以「·」分隔存储；空值逐字段回落兜底，防形状错配 */
function splitBadges(s, fbArr) {
  const arr = String(s || '').split('·').map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : fbArr;
}
function normalize(row) {
  const src = row && typeof row === 'object' ? row : {};
  const blk = (key) =>
    (Array.isArray(src.blocks) ? src.blocks.find((b) => b && b.key === key) : null) || {};
  const out = { subtitle: src.subtitle || PRODUCTS_FB.subtitle };
  for (const key of ['loudaren', 'weifeng']) {
    const b = blk(key);
    out[key] = {
      badges: splitBadges(b.badges, PRODUCTS_FB[key].badges),
      title: b.title || PRODUCTS_FB[key].title,
      desc: b.desc || PRODUCTS_FB[key].desc,
      ctaText: b.ctaText || PRODUCTS_FB[key].ctaText,
      ctaUrl: b.ctaUrl || PRODUCTS_FB[key].ctaUrl,
    };
  }
  return out;
}

const { data: rawPage } = useContent('page:products', null, () => getPage('products'));
const products = computed(() => normalize(rawPage.value));

function postToEmbed(payload) {
  const frame = document.querySelector('iframe.pd-frame');
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(payload, '*');
}

function pushBrand() {
  // ⚠️ nameParts 是 Vue reactive Proxy 数组，直接放进 postMessage 会抛
  // DataCloneError（structured clone 不认 Proxy）——必须先 spread 成纯数组
  const parts = [...(site.value?.brand?.nameParts || ['ONLY', 'STYLE'])];
  postToEmbed({
    type: 'bos-brand',
    logo: String(site.value?.brand?.logo || ''),
    nameParts: parts.map(String),
  });
}

function pushProducts() {
  const p = products.value;
  postToEmbed({
    type: 'bos-products',
    subtitle: String(p.subtitle || ''),
    loudaren: {
      badges: p.loudaren.badges.map(String),
      title: String(p.loudaren.title || ''),
      desc: String(p.loudaren.desc || ''),
      ctaText: String(p.loudaren.ctaText || ''),
      ctaUrl: String(p.loudaren.ctaUrl || ''),
    },
    weifeng: {
      badges: p.weifeng.badges.map(String),
      title: String(p.weifeng.title || ''),
      desc: String(p.weifeng.desc || ''),
      ctaText: String(p.weifeng.ctaText || ''),
      ctaUrl: String(p.weifeng.ctaUrl || ''),
    },
  });
}

function pushAll() { pushBrand(); pushProducts(); }

onMounted(() => {
  // iframe 内监听器就绪时机不确定，挂 load + 前几秒补发几次
  pushAll();
  const timers = [300, 900, 2000].map((t) => setTimeout(pushAll, t));
  onBeforeUnmount(() => timers.forEach(clearTimeout));
});
watch(() => site.value?.brand, pushBrand, { deep: true });
watch(products, pushProducts, { deep: true });
</script>

<template>
  <!-- ⚠️ embed 内容有更新时必须升 ?v= 版本参数，否则用户浏览器会拿旧缓存 -->
  <iframe
    class="pd-frame"
    src="/products-embed.html?v=b5"
    title="产品介绍"
    @load="pushAll"
  ></iframe>
</template>

<style scoped>
.pd-frame {
  display: block;
  width: 100%;
  height: 100vh;
  border: none;
  background: #060a13;
}
</style>
