/**
 * 兜底数据 · 文章（契约类型 articles）
 *
 * 公众号推文与官网新闻进的是**同一张表**，靠 channel 区分：
 *   channel='web'            → 只在官网
 *   channel='wechat'         → 只在公众号
 *   channel='web,wechat'     → 两端都发
 * 「一次生产、多端分发」靠这个字段落地，不为每个端建一张表。
 *
 * 行业洞察报告也是文章（category='行业洞察'），不另起概念。
 */

export const articles = [
  {
    id: 1,
    slug: 'ai-class-for-seniors',
    title: '老年人大学「刮」起 AI 风',
    category: '行业趋势',
    cover: '/media/site/news-1.jpg',
    excerpt:
      '今年春季，济南老年人大学首次开设 AI 课程，引领老年人开启 AI 科技探索之旅。380 余名学员中，平均年龄 60 岁，最大者 76 岁。通过 AI 相关课程的教授，跨越数字鸿沟，满足老年人终身学习的需求，增强其社会参与感，用新科技丰富银发生活。',
    published_at: '2025-04-24',
    is_top: false,
    source: '原创',
    sort: 1,
    status: 1,
    channel: 'web',
  },
  {
    id: 2,
    slug: 'harmonyos-collaboration',
    title: '「HarmonyOS 协同・创新」即将启幕，开发者携手共创新未来',
    category: '技术创新',
    cover: '/media/site/news-2.jpg',
    excerpt:
      '当智能终端从「单一设备」走向「全域协同」，从智能家居的联动控制到工业互联的高效协同，从车载系统的无缝衔接到移动办公的跨端流转，开发者如何在这场变革中抢占先机？',
    published_at: '2025-04-22',
    is_top: false,
    source: '原创',
    sort: 2,
    status: 1,
    channel: 'web',
  },
  {
    id: 3,
    slug: 'ai-server-solutions',
    title: '万亿赛道！AI 服务器设计及解决方案',
    category: '解决方案',
    cover: '/media/site/news-3.jpg',
    excerpt:
      '在全球科技企业加大投入生成式 AI 研发和应用的大背景下，配置高算力 AI 芯片的 AI 服务器需求也不断高涨。',
    published_at: '2024-03-05',
    is_top: false,
    source: '原创',
    sort: 3,
    status: 1,
    channel: 'web',
  },
  {
    id: 4,
    slug: 'digital-transformation-trends',
    title: '数字化转型趋势报告',
    category: '行业洞察',
    cover: '',
    excerpt: '深度解析 2024 年数字化转型的关键趋势和机遇',
    published_at: '2025-01-10',
    is_top: false,
    source: '原创',
    sort: 4,
    status: 1,
    channel: 'web',
  },
  {
    id: 5,
    slug: 'tech-innovation-whitepaper',
    title: '技术创新白皮书',
    category: '行业洞察',
    cover: '',
    excerpt: '探讨 AI、云计算、物联网等新技术的发展方向',
    published_at: '2025-01-08',
    is_top: false,
    source: '原创',
    sort: 5,
    status: 1,
    channel: 'web',
  },
  {
    id: 6,
    slug: 'industry-solution-guide',
    title: '行业解决方案指南',
    category: '行业洞察',
    cover: '',
    excerpt: '针对不同行业的数字化解决方案详细指南',
    published_at: '2025-01-06',
    is_top: false,
    source: '原创',
    sort: 6,
    status: 1,
    channel: 'web',
  },
];

/** 新闻页页头文案 */
export const newsPage = {
  title: '新闻与洞察',
  subtitle: '了解行业动态与前沿趋势',
  /** 归到「行业洞察」折叠区的分类名（这些在页面上以报告卡片形式单独呈现） */
  insightCategory: '行业洞察',
};
