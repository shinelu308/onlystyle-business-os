<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="page">
    <section class="page-hero">
      <div class="container page-hero-inner" style="text-align:center;">
        <div class="notfound-code">404</div>
        <h1 class="page-title">页面走丢了</h1>
        <p class="page-sub" style="margin:0 auto 28px;">
          您访问的地址不存在，或者已经从旧站下线。回到首页看看其他内容吧。
        </p>
        <RouterLink to="/" class="btn-primary">
          返回首页
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
