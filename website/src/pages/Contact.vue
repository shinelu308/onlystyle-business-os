<script setup>
/**
 * 联系我们（2026-09-19 全新设计版）
 * 完整 Lovart 设计稿整页落地：website/public/contact-embed.html
 * （Hero 视频背景 / 四张通讯坐标卡 / 舰队停泊点地图 / 微信直连二维码 / 全息表单终端，
 *  全部交互与动画原样保留；资源本地化 /contact-design/）。
 *
 * 布局（与 /about、/products 同一套约定）：
 *  · 路由 meta.hideNav → 只隐藏站内 SiteNav（设计稿自带导航，logo/品牌名由本页同源灌入）；
 *  · SiteFooter 由 App.vue 统一渲染在 iframe 下方（本页非 immersive）——
 *    与整站同一组件、同一数据源，保证**页脚全局一致**。
 *    ⚠️ 本组件不要再放 <SiteFooter>，会双渲染。
 *
 * 两个 postMessage 协议（都从本页发往 iframe）：
 *  ① bos-brand-v1   —— 设计稿导航的 logo / 品牌名，从 useSite() 取（与全站同源同兜底）；
 *  ② bos-contact-v1 —— 联系方式（地址/电话/邮箱/工作时间/经纬度）与需求方向下拉选项。
 *
 * ⚠️ 与 /about 同一条约定：**不设本页兜底文案**。
 *    embed 里的静态 markup 就是设计稿原文，而它的 setText 遇空值会跳过 →
 *    「字段为空 = 保持设计稿原文」，天然逐字段回落，不需要在 Vue 里再抄一份（抄两份必然漂移）。
 *
 * ⚠️ 表单**不是**本页负责提交的：embed 内部的脚本直接 POST /api/leads
 *    （见 contact-embed.html 的 data layer）。这样线索提交不依赖 Vue 是否挂载成功，
 *    后台「客户线索」页即可看到。
 */
import { computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useSite } from '@/composables/useSite.js';
import { useContent } from '@/composables/useContent.js';
import { services as fbServices } from '@/data/fallback/services.js';
import { getServices } from '@/api/content.js';

const { data: site } = useSite();
const { data: services } = useContent('services', fbServices, getServices);

/* ── 需求方向下拉：由「服务目录」生成 ──
   后台加了新服务，表单里的选项自动跟着多一项，不用改前端 */
const topics = computed(() => {
  const list = (services.value || [])
    .filter((s) => s && s.status !== 0)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((s) => String(s.title || '').trim())
    .filter(Boolean);
  return [...list, '其他合作'];
});

/* ── 经纬度装饰小字：由站点配置里的地图中心点派生（与地图同源，不写死）── */
const coord = computed(() => {
  const c = site.value?.contact?.amap?.center;
  if (!Array.isArray(c) || c.length < 2) return '';
  const [lng, lat] = [Number(c[0]), Number(c[1])];
  if (!isFinite(lng) || !isFinite(lat)) return '';
  return `${lat.toFixed(2)}°N · ${lng.toFixed(2)}°E`;
});

function postToEmbed(payload) {
  const frame = document.querySelector('iframe.ct-frame');
  if (!frame || !frame.contentWindow) return;
  // ⚠️ payload 里全是 Vue 的 reactive Proxy（对象/数组），structured clone 不认 Proxy，
  //    直接 postMessage 会抛 DataCloneError。JSON 往返一次拿到纯对象。
  frame.contentWindow.postMessage(JSON.parse(JSON.stringify(payload)), '*');
}

function pushBrand() {
  // ⚠️ nameParts 是 Vue reactive Proxy 数组，必须先 spread 成纯数组
  const parts = [...(site.value?.brand?.nameParts || ['ONLY', 'STYLE'])];
  postToEmbed({
    type: 'bos-brand',
    logo: String(site.value?.brand?.logo || ''),
    nameParts: parts.map(String),
  });
}

function pushContact() {
  const c = site.value?.contact || {};
  postToEmbed({
    type: 'bos-contact',
    page: '/contact',
    contact: {
      address: String(c.address || ''),
      tel: String(c.tel || ''),
      email: String(c.email || ''),
      hours: String(c.hours || ''),
      coord: coord.value,
    },
    topics: [...topics.value],
  });
}

function pushAll() {
  pushBrand();
  pushContact();
}

onMounted(() => {
  // iframe 内监听器就绪时机不确定，挂 load + 前几秒补发几次
  pushAll();
  const timers = [300, 900, 2000].map((t) => setTimeout(pushAll, t));
  onBeforeUnmount(() => timers.forEach(clearTimeout));
});
watch(() => site.value?.brand, pushBrand, { deep: true });
watch(() => site.value?.contact, pushContact, { deep: true });
watch(topics, pushContact, { deep: true });
</script>

<template>
  <!-- ⚠️ embed 内容有更新时必须升 ?v= 版本参数，否则用户浏览器会拿旧缓存 -->
  <iframe
    class="ct-frame"
    src="/contact-embed.html?v=c2"
    title="联系我们"
    @load="pushAll"
  ></iframe>
</template>

<style scoped>
.ct-frame {
  display: block;
  width: 100%;
  height: 100vh;
  border: none;
  background: #050810;
}
</style>
