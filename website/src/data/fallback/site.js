/**
 * 兜底数据 · 站点配置（契约类型 site_settings）
 *
 * ⚠️ 这是「后端没起 / 接口挂了」时的默认值，不是唯一数据源。
 *    字段名必须与 design/内容中台-API契约.md 一致，否则接口通了会字段对不上。
 *    事实值（电话/邮箱/备案号）来自线上真实站点，未改一字。
 *    形状：/api/content/site 返回的扁平对象。
 */

export const site = {
  brand: {
    name: 'ONLYSTYLE',
    nameParts: ['ONLY', 'STYLE'],
    company: '上海唯风信息技术有限公司',
    tagline: '数字化转型专家',
    slogan: '您值得信赖的一站式数字化服务伙伴',
    // 品牌图形：由后台「系统设置 → 品牌标识」上传后经 /api/content/site 投影过来。
    // 兜底留空 —— 此时 BrandLogo.vue 会回落到内置矢量线稿。
    logo: '',
    logoSubtitle: '',
  },
  contact: {
    address: '上海市莲花南路1500弄8-9号306室',
    tel: '021-33580166',
    email: 'shine@onlystyle.com.cn',
    hours: '周一至周五: 9:00 - 18:00',
    site: 'www.onlystyle.com.cn',
    siteHref: 'https://www.onlystyle.com.cn',
    qrcode: '/media/site/qrcode-wx.png',
    /** 高德地图：key 需在控制台配域名白名单，见技术方案风险 1 */
    amap: { key: '', center: [121.3986, 31.1105], zoom: 15 },
  },
  legal: {
    icp: '沪ICP备19012255号-3',
    icpUrl: 'https://beian.miit.gov.cn/',
    copyright: '© 2025 上海唯风信息技术有限公司',
  },
  seo: {
    defaultTitle: 'ONLYSTYLE - 数字化转型专家',
    defaultDescription:
      '上海唯风信息技术有限公司（ONLYSTYLE），为企业提供全链路数字化方案、行业智能化升级与 AI 交付服务。',
  },
  /** 导航菜单（可后台配置；EN 按钮按决策先隐藏） */
  nav: [
    { text: '首页', to: '/', sort: 1, visible: true },
    { text: '产品介绍', to: '/products', sort: 2, visible: true },
    { text: '案例星球', to: '/cases', sort: 4, visible: true },
    { text: '关于我们', to: '/about', sort: 5, visible: true },
  ],
  /** 导航右侧 CTA（与主导航分开，便于后台单独改） */
  navCta: { text: '联系我们', to: '/contact', visible: true },
  /** 页脚快速导航（可与主导航不同） */
  footerNav: [
    { text: '首页', to: '/', sort: 1, visible: true },
    { text: '产品介绍', to: '/products', sort: 2, visible: true },
    { text: '案例星球', to: '/cases', sort: 4, visible: true },
    { text: '联系我们', to: '/contact', sort: 5, visible: true },
    { text: '关于我们', to: '/about', sort: 6, visible: true },
  ],
};
