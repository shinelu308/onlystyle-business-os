/**
 * 兜底数据 · 合作伙伴（契约类型 partners）
 *
 * ⚠️ 5 张 logo 统一是 238×54 的**白底画布**，深色底上直接铺会变成一块块亮方块，
 *    所以前端套白色圆角 chip 渲染（见 site.css 的 .partner-item 覆盖）。
 */

export const partners = [
  { id: 1, name: '阿里云', logo: '/media/site/partner-alibaba.png', url: '', sort: 1, status: 1, channel: 'web' },
  { id: 2, name: '腾讯云', logo: '/media/site/partner-tencent.png', url: '', sort: 2, status: 1, channel: 'web' },
  { id: 3, name: '上海邮电设计院', logo: '/media/site/partner-shypt.png', url: '', sort: 3, status: 1, channel: 'web' },
  { id: 4, name: '中国联通', logo: '/media/site/partner-unicom.png', url: '', sort: 4, status: 1, channel: 'web' },
  { id: 5, name: '中国电信', logo: '/media/site/partner-telecom.png', url: '', sort: 5, status: 1, channel: 'web' },
];
