<script setup>
/**
 * 首页 —— 配置驱动
 *
 * 这里不写死任何区块顺序，只做三件事：
 *   1. 从内容中台取 home_blocks（失败回落兜底）
 *   2. 过滤出 enabled 的、按 sort 排序
 *   3. 按 type 去注册表找组件渲染
 * 后台调顺序 / 下线某个区块，前台立刻跟着变，不用改这个文件。
 */
import { computed } from 'vue';
import { useContent } from '@/composables/useContent.js';
import { homeBlocks as fallback } from '@/data/fallback/home.js';
import { getHomeBlocks } from '@/api/content.js';
import { BLOCK_REGISTRY, pickBlocks } from '@/blocks/registry.js';

const { data } = useContent('home', fallback, getHomeBlocks);
const blocks = computed(() => pickBlocks(data.value));

/** 只透传该组件确实声明了的 prop，避免多余属性落到 <section> 上变成 HTML 属性 */
function propsOf(b) {
  const p = { ...(b.props || {}) };
  for (const k of ['eyebrow', 'title', 'subtitle']) {
    if (b[k] != null) p[k] = b[k];
  }
  return p;
}
</script>

<template>
  <div class="page page-home">
    <component
      v-for="b in blocks"
      :key="`${b.type}-${b.sort}`"
      :is="BLOCK_REGISTRY[b.type]"
      v-bind="propsOf(b)"
    />
  </div>
</template>
