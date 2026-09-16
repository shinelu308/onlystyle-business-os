/**
 * 兜底数据 · 案例（契约类型 cases）
 *
 * 一条案例同时服务两个地方，避免同一批数据两处维护：
 *   · 案例页 /cases  → title / category / subtitle / metrics
 *   · 首页精选卡片   → client（甲方）/ product（产品名）/ domain（领域标签）
 * 首页按 featured + limit 取，不再单独存一份。
 *
 * metrics 必须是结构化 JSON —— 前端要把它渲染成渐变数字高亮，
 * 写死在正文里就没法做数字排版了。
 */

export const cases = [
  {
    id: 1,
    slug: 'guilin-tech-park',
    title: '上海桂林科技园',
    category: '商业地产',
    domain: '地产领域',
    client: '上海桂林科技园',
    product: '楼达人资产管理平台',
    subtitle: '智慧园区管理平台',
    summary: '构建文、商、资，三位一体的跨界融合生态',
    cover: '/media/site/case-guilin.png',
    metrics: [
      { value: '30%', label: '效率提升' },
      { value: '25%', label: '成本降低' },
      { value: '40%', label: '质量提升' },
    ],
    featured: true,
    sort: 1,
    status: 1,
    channel: 'web',
  },
  {
    id: 2,
    slug: 'xinyushikang',
    title: '心语视康数据管理平台',
    category: '公共公益',
    domain: '医疗领域',
    client: '中华慈善基金会',
    product: '心语视康',
    subtitle: '国家重点眼科护理公益医疗平台',
    summary: '国家重点 AI 眼科护理公益医疗平台',
    cover: '/media/site/case-xinyushikang.png',
    metrics: [
      { value: '45%', label: '销售额增长' },
      { value: '提升60%', label: '客户留存率' },
      { value: '提升40%', label: '库存周转率' },
    ],
    featured: true,
    sort: 2,
    status: 1,
    channel: 'web',
  },
  {
    id: 3,
    slug: 'shanghai-dashijie',
    title: 'O2O 信息融合系统',
    category: '文化旅游',
    domain: '文旅领域',
    client: '上海大世界',
    product: 'O2O 信息融合系统',
    subtitle: '上海市级文旅重点项目',
    summary: '上海市级文旅重点项目',
    cover: '/media/site/case-dashijie.png',
    metrics: [
      { value: '95%', label: '用户满意度' },
      { value: '提升50%', label: '业务处理效率' },
      { value: '降低35%', label: '运营成本' },
    ],
    featured: true,
    sort: 3,
    status: 1,
    channel: 'web',
  },
  {
    id: 4,
    slug: 'gattefosse',
    title: '法国嘉法狮 GATTEFOSSE',
    category: '零售医药',
    domain: '零售医药',
    client: '法国嘉法狮 GATTEFOSSE',
    product: 'CMS 内容发布管理系统',
    subtitle: 'CMS 内容发布管理系统',
    summary: '为跨国原料企业搭建中文站内容发布与管理系统',
    cover: '/media/site/case-gattefosse.png',
    metrics: [
      { value: '45%', label: '销售额增长' },
      { value: '提升60%', label: '客户留存率' },
      { value: '提升40%', label: '库存周转率' },
    ],
    featured: false,
    sort: 4,
    status: 1,
    channel: 'web',
  },
];

/** 分类聚合。接口通了由 /api/content/categories 给，前端不写死 */
export const caseCategories = ['全部', '公共公益', '文化旅游', '商业地产', '零售医药'];
