/**
 * 兜底数据 · 首页区块（契约类型 home_blocks）
 *
 * 首页是「配置驱动」的：改顺序、临时下线某个区块，都由这份配置决定，
 * 前端只是照着 type 找组件渲染。后台调完顺序，前台立刻跟着变。
 *
 * 关于「内容从哪来」的一条分工：
 *   · hero / services / why-us / cta → 文案内联在 props，因为首页是**编辑精选**，
 *     和目录页（/services）的口径本来就不一样，硬绑到一起反而难改；
 *   · cases / partners → 只给筛选条件，数据仍从 cases / partners 内容类型拉，
 *     避免同一批数据两处维护。
 */

export const homeBlocks = [
  {
    type: 'hero',
    sort: 1,
    enabled: true,
    props: {
      badge: '数字化转型专家 · Digital Transformation',
      h1: '赋能产业未来',
      h2: '构建数字新生态',
      descFrom: 'brand', // desc 用「公司全称 · slogan」拼，避免改公司名时要改两处
      desc: '',
      cta: [
        { text: '了解我们的方案', to: '/services', style: 'primary' },
        { text: '查看成功案例', to: '/cases', style: 'outline' },
      ],
      stats: [
        { num: '20', suffix: '+', label: '年行业经验' },
        { num: '100', suffix: '+', label: '成功交付案例' },
        { num: '5', suffix: '', label: '战略合作伙伴' },
      ],
    },
  },
  {
    type: 'services',
    sort: 2,
    enabled: true,
    eyebrow: 'Our Services',
    title: '我们能做什么',
    subtitle: '从战略咨询到技术落地，提供覆盖全周期的数字化转型解决方案。',
    props: {
      items: [
        {
          num: '01 / 03',
          title: '全链路数字化方案',
          subtitle: '覆盖咨询、平台开发、部署与运维全周期',
          desc: '从业务诊断到系统上线，提供端到端的数字化转型服务，确保每个环节无缝衔接，降低转型风险。',
          icon: 'orbit',
          accent: 'blue',
        },
        {
          num: '02 / 03',
          title: '行业智能化升级',
          subtitle: '用智能化技术赋能行业，降本增效，创造新价值',
          desc: '深度融合行业知识与智能技术，帮助企业实现流程自动化、数据驱动决策，释放业务增长潜能。',
          icon: 'arrow',
          accent: 'cyan',
        },
        {
          num: '03 / 03',
          title: 'AI 交付服务',
          subtitle: 'AI 智能速成，专业交付省时省力',
          desc: '借助 AI 技术加速项目交付，在保证质量的前提下大幅缩短开发周期，让业务快速响应市场变化。',
          icon: 'check',
          accent: 'green',
        },
      ],
    },
  },
  {
    type: 'why-us',
    sort: 3,
    enabled: true,
    eyebrow: 'Why Choose Us',
    title: '为什么选择唯风',
    subtitle: '深厚的行业积累与专业团队，是我们持续为客户创造价值的核心。',
    props: {
      items: [
        {
          num: '20',
          suffix: '+',
          title: '多年行业经验',
          desc: '超过 20 年的数字化落地经验，深刻理解各行业的业务痛点与转型路径。',
        },
        {
          num: '专业\n团队',
          suffix: '',
          title: '专业技术团队',
          desc: '汇聚开发、数据、咨询多领域专家，为每个项目配置最优团队组合。',
        },
        {
          num: '定制\n交付',
          suffix: '',
          title: '定制化思维',
          desc: '按需提供定制化服务，灵活响应业务需求，不做千篇一律的解决方案。',
        },
      ],
    },
  },
  {
    type: 'cases',
    sort: 4,
    enabled: true,
    eyebrow: 'Success Cases',
    title: '成功案例',
    subtitle: '跨越地产、医疗、文旅等多个行业，持续为客户创造数字化价值。',
    props: { limit: 3, featuredOnly: true, moreText: '查看全部案例', moreTo: '/cases' },
  },
  {
    type: 'partners',
    sort: 5,
    enabled: true,
    props: { label: '感谢以下伙伴与我们共同推动数字化管理' },
  },
  {
    type: 'cta',
    sort: 6,
    enabled: true,
    props: {
      eyebrow: 'Get Started',
      title: '开启数字化转型',
      sub: '与唯风一起，用智能技术驱动业务增长',
      cta: { text: '联系我们', to: '/contact' },
    },
  },
];
