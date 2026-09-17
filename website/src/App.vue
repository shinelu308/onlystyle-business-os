<script setup>
import { watchEffect, onMounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteNav from '@/components/SiteNav.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { initReveal } from '@/composables/useReveal.js'

const route = useRoute()

/**
 * 沉浸式页面（/cases 案例星系）：整页交给全屏 canvas，不渲染导航与页脚。
 * 同时在 <html> 上挂 .immersive —— 由 styles/site.css 负责禁掉滚动，
 * 否则「滚轮缩放」会和「页面滚动」抢同一个事件。
 */
const immersive = computed(() => !!route.meta.immersive)

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

// 每次换页后重新登记滚动进场动画（懒加载组件渲染完再算，下一帧执行）
watchEffect(() => {
  route.fullPath
  nextTick(() => initReveal())
})
onMounted(() => nextTick(() => initReveal()))
</script>

<template>
  <SiteNav v-if="!immersive" />
  <RouterView />
  <SiteFooter v-if="!immersive" />
</template>
