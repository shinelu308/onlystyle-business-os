/**
 * 首页区块注册表：type -> 组件
 *
 * 首页是配置驱动的 —— Home.vue 只负责「按配置的顺序循环渲染」，
 * 具体渲染什么由这里的映射决定。后台只需给出 type，
 * 新增一种区块 = 在这里加一行映射 + 写一个组件，不用动 Home.vue。
 */
import HeroSection from '@/components/home/HeroSection.vue';
import ServicesSection from '@/components/home/ServicesSection.vue';
import WhyUsSection from '@/components/home/WhyUsSection.vue';
import CasesSection from '@/components/home/CasesSection.vue';
import PartnersSection from '@/components/home/PartnersSection.vue';
import CtaSection from '@/components/home/CtaSection.vue';

export const BLOCK_REGISTRY = {
  hero: HeroSection,
  services: ServicesSection,
  'why-us': WhyUsSection,
  cases: CasesSection,
  partners: PartnersSection,
  cta: CtaSection,
};

/** 后台可在下拉里选的区块类型（顺序即建议顺序） */
export const BLOCK_TYPES = Object.keys(BLOCK_REGISTRY).map((k) => ({
  type: k,
  label:
    {
      hero: '首屏 Hero',
      services: '服务（我们能做什么）',
      'why-us': '优势（为什么选择我们）',
      cases: '案例（成功案例）',
      partners: '合作伙伴',
      cta: '底部行动号召',
    }[k] || k,
}));

/**
 * 渲染前过滤：只要启用的，且按 sort 升序。
 *
 * 容忍两种入参：裸数组，或接口的 { blocks: [...] } 包装。
 * 不这么写的话，形状一旦对不上就是 .filter is not a function，
 * 而且是在重渲染阶段抛错 —— DOM 会停在首屏那一版，表现为「后台改了前台不动」。
 */
export function pickBlocks(input) {
  const blocks = Array.isArray(input) ? input : (input && input.blocks) || [];
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b) => b && b.enabled !== false && b.status !== 0 && BLOCK_REGISTRY[b.type])
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}
