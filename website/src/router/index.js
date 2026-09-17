import { createRouter, createWebHistory } from 'vue-router'

/**
 * 6 条路由 = 1:1 继承线上现有内容结构（见 design/官网改版技术方案.md 1.4 节）
 * meta.title / meta.description 供预渲染脚本写进静态 HTML（SEO 用）
 */
const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/Home.vue'),
    meta: {
      title: 'ONLYSTYLE - 数字化转型专家',
      description: '上海唯风信息技术有限公司（ONLYSTYLE），为企业提供全链路数字化方案、行业智能化升级与 AI 交付服务。',
    },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/pages/About.vue'),
    meta: {
      title: '关于我们 - ONLYSTYLE',
      description: 'ONLYSTYLE 上海唯风信息技术有限公司，专注数字化转型领域，以创新、诚信、协作、卓越为核心价值观。',
    },
  },
  {
    path: '/services',
    name: 'services',
    component: () => import('@/pages/Services.vue'),
    meta: {
      title: '解决方案 - ONLYSTYLE',
      description: '覆盖咨询、平台开发、部署与运维全周期的数字化服务，以及面向地产、医疗、文旅等行业的智能化解决方案。',
    },
  },
  {
    path: '/cases',
    name: 'cases',
    component: () => import('@/pages/Cases.vue'),
    meta: {
      title: '案例星球 - ONLYSTYLE',
      description: '跨越公共公益、文化旅游、商业地产、零售医药等多个行业的数字化落地案例。',
      // 整页沉浸式：App.vue 在这一页不渲染 SiteNav / SiteFooter，
      // 由案例星系的全屏 canvas 铺满（见 components/cases/CaseGalaxy.vue）
      immersive: true,
    },
  },
  {
    path: '/products',
    name: 'products',
    component: () => import('@/pages/Products.vue'),
    meta: {
      title: '产品介绍 - ONLYSTYLE',
      description: '主打自研「楼达人资产管理平台」（SAAS），提供资产数字化、租赁、业财一体、招商与数据大屏的一站式资管运营能力。',
    },
  },
  {
    path: '/contact',
    name: 'contact',
    component: () => import('@/pages/Contact.vue'),
    meta: {
      title: '联系我们 - ONLYSTYLE',
      description: '联系上海唯风信息技术有限公司，获取数字化转型咨询与方案支持。',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFound.vue'),
    meta: { title: '页面不存在 - ONLYSTYLE', description: '您访问的页面不存在。' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 80 }
    return { top: 0 }
  },
})

export default router
