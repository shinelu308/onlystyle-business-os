<script setup>
import { watchEffect, onMounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteNav from '@/components/SiteNav.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { initReveal } from '@/composables/useReveal.js'
import { useSite } from '@/composables/useSite.js'

const route = useRoute()

/**
 * 沉浸式页面（/cases 案例星系）：整页交给全屏 canvas，不渲染导航与页脚。
 * 同时在 <html> 上挂 .immersive —— 由 styles/site.css 负责禁掉滚动，
 * 否则「滚轮缩放」会和「页面滚动」抢同一个事件。
 *
 * meta.hideNav（/products 设计稿页）：只藏 SiteNav —— 设计稿自带导航，
 * 但页脚仍用全站 SiteFooter（与整站一致），渲染在 iframe 下方。
 */
const immersive = computed(() => !!route.meta.immersive)
const showNav = computed(() => !immersive.value && !route.meta.hideNav)

watchEffect(() => {
  document.documentElement.classList.toggle('immersive', immersive.value)
})

/**
 * 每页的 title / description 由路由 meta 驱动。
 * 预渲染脚本会在构建后把这些值固化进静态 HTML；运行时切换路由也保证一致。
 */
watchEffect(() => {
  const m = route.meta || {}
  if (m.title) document.title = m.title
  if (m.description) {
    let el = document.querySelector('meta[name="description"]')
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'description')
      document.head.appendChild(el)
    }
    el.setAttribute('content', m.description)
  }
})

/**
 * 标签页图标（favicon）与「全局 logo」保持一致。
 *
 * 后台「系统设置 → 品牌标识」上传的图，由 /api/content/site 投影成 brand.logo
 * （导航/页脚用的是同一份），这里把它同步到 <link rel="icon"> —— 后台换图，
 * 标签页图标自动跟随，不会再出现「图标和 logo 各是各的」。
 *
 * 没上传图时不动：index.html 里引用的 /favicon.png 是用同一张 logo 生成的
 * 构建期静态兜底（public/favicon.png），所以首屏也不会是浏览器默认图标。
 *
 * ⚠️ 用 useSite() 而不是自己 fetch —— 与 SiteNav/SiteFooter 共享同一份缓存，
 *    否则会白白多发一次 /api/content/site。
 * ⚠️ 换图标必须「删旧 link 再插新 link」：只改 href 有的浏览器不会重新加载图标。
 */
const { data: site } = useSite()
watchEffect(() => {
  const logo = site.value?.brand?.logo
  if (!logo) return
  const cur = document.querySelector('link[rel="icon"]')
  if (cur && cur.getAttribute('href') === logo) return
  document.querySelectorAll('link[rel="icon"]').forEach((n) => n.remove())
  const el = document.createElement('link')
  el.setAttribute('rel', 'icon')
  el.setAttribute('type', 'image/png')
  el.setAttribute('href', logo)
  document.head.appendChild(el)
})

// 每次换页后重新登记滚动进场动画（懒加载组件渲染完再算，下一帧执行）
watchEffect(() => {
  route.fullPath
  nextTick(() => initReveal())
})
onMounted(() => nextTick(() => initReveal()))
</script>

<template>
  <SiteNav v-if="showNav" />
  <RouterView />
  <SiteFooter v-if="!immersive" />
</template>
