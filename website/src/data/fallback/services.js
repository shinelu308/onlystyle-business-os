/**
 * 兜底数据 · 服务目录与行业方案（契约类型 services / industries）
 *
 * business_line_code 是与 BOS 业务线的**弱关联**：
 *   · 官网的对外口径由这里的 title/description 决定，不被业务线反向覆盖；
 *   · 填了业务线编码只用于内部归因（这条线索来自哪条业务线）；
 *   · 目前 BOS 还没有 business_lines 表，先留空，等业务线建好后回填。
 */

export const services = [
  {
    id: 1,
    title: '数字化转型咨询',
    subtitle: '',
    description: '提供专业的数字化转型战略规划和实施路径建议',
    icon: 'orbit',
    points: ['数字化成熟度评估', '转型战略规划', '实施路径设计'],
    business_line_code: '',
    sort: 1,
    status: 1,
    channel: 'web',
  },
  {
    id: 2,
    title: 'IT 服务解决方案',
    subtitle: '',
    description: '提供安全、可靠的云计算服务和解决方案',
    icon: 'cloud',
    points: ['IT 外包服务', '网络通讯服务', '机柜租赁服务'],
    business_line_code: '',
    sort: 2,
    status: 1,
    channel: 'web',
  },
  {
    id: 3,
    title: 'AI 应用开发',
    subtitle: '',
    description: '打造智能化应用，提升业务效率',
    icon: 'chip',
    points: ['企业模型训练', '智能决策系统', '自然语言处理'],
    business_line_code: '',
    sort: 3,
    status: 1,
    channel: 'web',
  },
  {
    id: 4,
    title: '网络安全服务',
    subtitle: '',
    description: '全面的网络安全解决方案',
    icon: 'shield',
    points: ['安全评估', '漏洞检测', '安全运维'],
    business_line_code: '',
    sort: 4,
    status: 1,
    channel: 'web',
  },
];

export const industries = [
  {
    id: 1,
    title: '城市更新与智慧城市',
    description: '用科技赋能旧城改造，打造智能、高效、宜居的未来城市',
    icon: 'city',
    tags: [],
    sort: 1,
    status: 1,
    channel: 'web',
  },
  {
    id: 2,
    title: '数字医疗与公益',
    description: '科技赋能医疗，智慧助力公益',
    icon: 'heart',
    tags: [],
    sort: 2,
    status: 1,
    channel: 'web',
  },
  {
    id: 3,
    title: '数字文化与旅游',
    description: '科技让文旅更沉浸、更便捷',
    icon: 'landmark',
    tags: [],
    sort: 3,
    status: 1,
    channel: 'web',
  },
];

/** 解决方案页页头文案 */
export const servicesPage = {
  title: '服务与解决方案',
  subtitle: '为您的企业提供全方位数字化转型服务',
};
