<script setup>
/**
 * 案例展示 —— 3D 案例星系
 *
 * 页面形态：**整页沉浸式**（路由 meta.immersive），App.vue 在这一页不渲染导航与页脚，
 * 全屏交给 canvas。左边距保留一个「← 返回」作为唯一出口。
 *
 * 数据：案例列表来自内容中台 `GET /api/content/cases`，接口不通则回落兜底数据。
 * 星球完全由数据驱动 —— 后台新增一条案例，这里就多一颗星（组件内部的行业表与
 * 星球列表都是从 cases 推导出来的，没有任何一处写死数量）。
 */
import { computed } from 'vue';
import CaseGalaxy from '@/components/cases/CaseGalaxy.vue';
import { useContent } from '@/composables/useContent.js';
import { cases as fbCases } from '@/data/fallback/cases.js';
import { getCases } from '@/api/content.js';

const { data: allCases } = useContent('cases', fbCases, getCases);

/** 下架（status=0）的不进星系 */
const list = computed(() => (allCases.value || []).filter((c) => c.status !== 0));
</script>

<template>
  <CaseGalaxy :cases="list" />
</template>
