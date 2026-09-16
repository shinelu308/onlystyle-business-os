<script setup>
import { watchEffect, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import SiteNav from '@/components/SiteNav.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { initReveal } from '@/composables/useReveal.js'

const route = useRoute()

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
  <SiteNav />
  <RouterView />
  <SiteFooter />
</template>
