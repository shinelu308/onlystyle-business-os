/**
 * 内容运营域 · 表结构与初始内容
 *
 * 依据：design/多业务线系统架构设计方案.md 第九节 + design/内容中台-API契约.md
 *
 * 设计原则（与架构方案第八节一致）：
 *   · 只「加表加列」，不动存量宽带业务的任何表；
 *   · 所有内容表统一带 status / sort / channel / ext 四个字段，
 *     业务差异塞 ext(JSON)，避免每加一种内容就加一批列；
 *   · channel 是逗号分隔的渠道列表（web / miniapp / wechat），
 *     一次生产多端分发靠它落地，不为每个端建表。
 *
 * 本文件由 database.js 的 initializeDatabase() 调用，与主 schema 解耦。
 */

const TABLES = `
  /* ── 站点级配置（KV）── */
  CREATE TABLE IF NOT EXISTS content_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT DEFAULT '',
    grp        TEXT DEFAULT 'general',
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 单页 ── */
  CREATE TABLE IF NOT EXISTS content_pages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT DEFAULT '',
    subtitle        TEXT DEFAULT '',
    seo_title       TEXT DEFAULT '',
    seo_description TEXT DEFAULT '',
    og_image        TEXT DEFAULT '',
    blocks          TEXT DEFAULT '[]',
    status          INTEGER DEFAULT 1,
    sort            INTEGER DEFAULT 0,
    channel         TEXT DEFAULT 'web',
    ext             TEXT DEFAULT '{}',
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    updated_at      TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 服务目录 ── */
  CREATE TABLE IF NOT EXISTS content_services (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    title              TEXT NOT NULL,
    subtitle           TEXT DEFAULT '',
    description        TEXT DEFAULT '',
    icon               TEXT DEFAULT '',
    points             TEXT DEFAULT '[]',
    business_line_code TEXT DEFAULT '',
    status             INTEGER DEFAULT 1,
    sort               INTEGER DEFAULT 0,
    channel            TEXT DEFAULT 'web',
    ext                TEXT DEFAULT '{}',
    created_at         TEXT DEFAULT (datetime('now','localtime')),
    updated_at         TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 行业方案 ── */
  CREATE TABLE IF NOT EXISTS content_industries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon        TEXT DEFAULT '',
    tags        TEXT DEFAULT '[]',
    status      INTEGER DEFAULT 1,
    sort        INTEGER DEFAULT 0,
    channel     TEXT DEFAULT 'web',
    ext         TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now','localtime')),
    updated_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 案例 ──
     metrics 必须是结构化 JSON —— 前端要按数字排版渲染渐变高亮，
     写死在正文里就做不出来了。 */
  CREATE TABLE IF NOT EXISTS content_cases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    category        TEXT DEFAULT '',
    domain          TEXT DEFAULT '',
    client          TEXT DEFAULT '',
    product         TEXT DEFAULT '',
    subtitle        TEXT DEFAULT '',
    summary         TEXT DEFAULT '',
    cover           TEXT DEFAULT '',
    content         TEXT DEFAULT '',
    metrics         TEXT DEFAULT '[]',
    featured        INTEGER DEFAULT 0,
    seo_title       TEXT DEFAULT '',
    seo_description TEXT DEFAULT '',
    status          INTEGER DEFAULT 1,
    sort            INTEGER DEFAULT 0,
    channel         TEXT DEFAULT 'web',
    ext             TEXT DEFAULT '{}',
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    updated_at      TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 文章（官网新闻 + 公众号推文共用，靠 channel 分）── */
  CREATE TABLE IF NOT EXISTS content_articles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    category        TEXT DEFAULT '',
    cover           TEXT DEFAULT '',
    excerpt         TEXT DEFAULT '',
    content         TEXT DEFAULT '',
    published_at    TEXT DEFAULT '',
    is_top          INTEGER DEFAULT 0,
    source          TEXT DEFAULT '原创',
    seo_title       TEXT DEFAULT '',
    seo_description TEXT DEFAULT '',
    status          INTEGER DEFAULT 1,
    sort            INTEGER DEFAULT 0,
    channel         TEXT DEFAULT 'web',
    ext             TEXT DEFAULT '{}',
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    updated_at      TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 合作伙伴 ── */
  CREATE TABLE IF NOT EXISTS content_partners (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    logo       TEXT DEFAULT '',
    url        TEXT DEFAULT '',
    status     INTEGER DEFAULT 1,
    sort       INTEGER DEFAULT 0,
    channel    TEXT DEFAULT 'web',
    ext        TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 首页区块（配置驱动首页的核心）──
     type 对应前端的区块注册表；props 是透传给组件的参数。
     后台调 sort 或把 enabled 关掉，首页立刻跟着变，不用发版。 */
  CREATE TABLE IF NOT EXISTS content_home_blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    eyebrow    TEXT DEFAULT '',
    title      TEXT DEFAULT '',
    subtitle   TEXT DEFAULT '',
    props      TEXT DEFAULT '{}',
    enabled    INTEGER DEFAULT 1,
    status     INTEGER DEFAULT 1,
    sort       INTEGER DEFAULT 0,
    channel    TEXT DEFAULT 'web',
    ext        TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 媒体库 ── */
  CREATE TABLE IF NOT EXISTS content_media (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT NOT NULL,
    url        TEXT NOT NULL,
    mime       TEXT DEFAULT '',
    size       INTEGER DEFAULT 0,
    width      INTEGER DEFAULT 0,
    height     INTEGER DEFAULT 0,
    alt        TEXT DEFAULT '',
    grp        TEXT DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  /* ── 线索（复用 BOS 客户体系，见 customer_id）── */
  CREATE TABLE IF NOT EXISTS leads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    company     TEXT DEFAULT '',
    interest    TEXT DEFAULT '',
    message     TEXT DEFAULT '',
    source_page TEXT DEFAULT '',
    utm         TEXT DEFAULT '',
    status      TEXT DEFAULT 'new',
    customer_id TEXT DEFAULT '',
    follow_note TEXT DEFAULT '',
    updated_at  TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_cases_channel    ON content_cases(channel, status, sort);
  CREATE INDEX IF NOT EXISTS idx_cases_category   ON content_cases(category);
  CREATE INDEX IF NOT EXISTS idx_articles_channel ON content_articles(channel, status, sort);
  CREATE INDEX IF NOT EXISTS idx_blocks_channel   ON content_home_blocks(channel, enabled, sort);
  CREATE INDEX IF NOT EXISTS idx_leads_created    ON leads(created_at);
  CREATE INDEX IF NOT EXISTS idx_leads_phone      ON leads(phone);
`;

/* ════════════════════════════════════════════════════════
   初始内容：把现有官网的真实内容灌进来。
   只在表为空时插入，不会覆盖后台已经改过的数据。
   ════════════════════════════════════════════════════════ */

const SEED = {
  settings: [
    ['brand.name', 'ONLYSTYLE', 'brand'],
    ['brand.company', '上海唯风信息技术有限公司', 'brand'],
    ['brand.tagline', '数字化转型专家', 'brand'],
    ['brand.slogan', '您值得信赖的一站式数字化服务伙伴', 'brand'],
    ['contact.address', '上海市莲花南路1500弄8-9号306室', 'contact'],
    ['contact.tel', '021-33580166', 'contact'],
    ['contact.email', 'shine@onlystyle.com.cn', 'contact'],
    ['contact.hours', '周一至周五: 9:00 - 18:00', 'contact'],
    ['contact.site', 'www.onlystyle.com.cn', 'contact'],
    ['contact.siteHref', 'https://www.onlystyle.com.cn', 'contact'],
    ['contact.qrcode', '/media/site/qrcode-wx.png', 'contact'],
    ['legal.icp', '沪ICP备19012255号-3', 'legal'],
    ['legal.icpUrl', 'https://beian.miit.gov.cn/', 'legal'],
    ['legal.copyright', '© 2025 上海唯风信息技术有限公司', 'legal'],
    ['seo.defaultTitle', 'ONLYSTYLE - 数字化转型专家', 'seo'],
    [
      'seo.defaultDescription',
      '上海唯风信息技术有限公司（ONLYSTYLE），为企业提供全链路数字化方案、行业智能化升级与 AI 交付服务。',
      'seo',
    ],
    [
      'nav.items',
      JSON.stringify([
        { text: '首页', to: '/', sort: 1, visible: true },
        { text: '关于我们', to: '/about', sort: 2, visible: true },
        { text: '解决方案', to: '/services', sort: 3, visible: true },
        { text: '案例展示', to: '/cases', sort: 4, visible: true },
        { text: '洞察动态', to: '/news', sort: 5, visible: true },
      ]),
      'nav',
    ],
    ['nav.cta', JSON.stringify({ text: '联系我们', to: '/contact', visible: true }), 'nav'],
    [
      'footer.nav',
      JSON.stringify([
        { text: '首页', to: '/', sort: 1, visible: true },
        { text: '关于我们', to: '/about', sort: 2, visible: true },
        { text: '解决方案', to: '/services', sort: 3, visible: true },
        { text: '案例展示', to: '/cases', sort: 4, visible: true },
        { text: '洞察动态', to: '/news', sort: 5, visible: true },
        { text: '联系我们', to: '/contact', sort: 6, visible: true },
      ]),
      'nav',
    ],
    // 内容版本号：后台每次写操作 +1，前端/CDN 据此失效缓存
    ['content.version', '1', 'system'],
  ],

  services: [
    {
      title: '数字化转型咨询',
      description: '提供专业的数字化转型战略规划和实施路径建议',
      icon: 'orbit',
      points: ['数字化成熟度评估', '转型战略规划', '实施路径设计'],
      sort: 1,
    },
    {
      title: 'IT 服务解决方案',
      description: '提供安全、可靠的云计算服务和解决方案',
      icon: 'cloud',
      points: ['IT 外包服务', '网络通讯服务', '机柜租赁服务'],
      sort: 2,
    },
    {
      title: 'AI 应用开发',
      description: '打造智能化应用，提升业务效率',
      icon: 'chip',
      points: ['企业模型训练', '智能决策系统', '自然语言处理'],
      sort: 3,
    },
    {
      title: '网络安全服务',
      description: '全面的网络安全解决方案',
      icon: 'shield',
      points: ['安全评估', '漏洞检测', '安全运维'],
      sort: 4,
    },
  ],

  industries: [
    { title: '城市更新与智慧城市', description: '用科技赋能旧城改造，打造智能、高效、宜居的未来城市', icon: 'city', sort: 1 },
    { title: '数字医疗与公益', description: '科技赋能医疗，智慧助力公益', icon: 'heart', sort: 2 },
    { title: '数字文化与旅游', description: '科技让文旅更沉浸、更便捷', icon: 'landmark', sort: 3 },
  ],

  cases: [
    {
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
      featured: 1,
      sort: 1,
    },
    {
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
      featured: 1,
      sort: 2,
    },
    {
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
      featured: 1,
      sort: 3,
    },
    {
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
      featured: 0,
      sort: 4,
    },
  ],

  articles: [
    {
      slug: 'ai-class-for-seniors',
      title: '老年人大学「刮」起 AI 风',
      category: '行业趋势',
      cover: '/media/site/news-1.jpg',
      excerpt:
        '今年春季，济南老年人大学首次开设 AI 课程，引领老年人开启 AI 科技探索之旅。380 余名学员中，平均年龄 60 岁，最大者 76 岁。通过 AI 相关课程的教授，跨越数字鸿沟，满足老年人终身学习的需求，增强其社会参与感，用新科技丰富银发生活。',
      published_at: '2025-04-24',
      sort: 1,
    },
    {
      slug: 'harmonyos-collaboration',
      title: '「HarmonyOS 协同・创新」即将启幕，开发者携手共创新未来',
      category: '技术创新',
      cover: '/media/site/news-2.jpg',
      excerpt:
        '当智能终端从「单一设备」走向「全域协同」，从智能家居的联动控制到工业互联的高效协同，从车载系统的无缝衔接到移动办公的跨端流转，开发者如何在这场变革中抢占先机？',
      published_at: '2025-04-22',
      sort: 2,
    },
    {
      slug: 'ai-server-solutions',
      title: '万亿赛道！AI 服务器设计及解决方案',
      category: '解决方案',
      cover: '/media/site/news-3.jpg',
      excerpt:
        '在全球科技企业加大投入生成式 AI 研发和应用的大背景下，配置高算力 AI 芯片的 AI 服务器需求也不断高涨。',
      published_at: '2024-03-05',
      sort: 3,
    },
    {
      slug: 'digital-transformation-trends',
      title: '数字化转型趋势报告',
      category: '行业洞察',
      cover: '',
      excerpt: '深度解析 2024 年数字化转型的关键趋势和机遇',
      published_at: '2025-01-10',
      sort: 4,
    },
    {
      slug: 'tech-innovation-whitepaper',
      title: '技术创新白皮书',
      category: '行业洞察',
      cover: '',
      excerpt: '探讨 AI、云计算、物联网等新技术的发展方向',
      published_at: '2025-01-08',
      sort: 5,
    },
    {
      slug: 'industry-solution-guide',
      title: '行业解决方案指南',
      category: '行业洞察',
      cover: '',
      excerpt: '针对不同行业的数字化解决方案详细指南',
      published_at: '2025-01-06',
      sort: 6,
    },
  ],

  partners: [
    { name: '阿里云', logo: '/media/site/partner-alibaba.png', sort: 1 },
    { name: '腾讯云', logo: '/media/site/partner-tencent.png', sort: 2 },
    { name: '上海邮电设计院', logo: '/media/site/partner-shypt.png', sort: 3 },
    { name: '中国联通', logo: '/media/site/partner-unicom.png', sort: 4 },
    { name: '中国电信', logo: '/media/site/partner-telecom.png', sort: 5 },
  ],

  pages: [
    {
      slug: 'about',
      title: '关于我们',
      subtitle: '数字化转型的引领者',
      seo_title: '关于我们 - ONLYSTYLE',
      seo_description:
        'ONLYSTYLE 上海唯风信息技术有限公司，专注数字化转型领域，以创新、诚信、协作、卓越为核心价值观。',
      blocks: [
        {
          type: 'prose',
          eyebrow: 'Company Profile',
          title: '公司简介',
          body: '上海唯风信息技术有限公司是一家在数字化领域拥有广泛经验的领先公司。我们专注于为不同行业的企业和机构提供全面的数字化解决方案，以满足他们的不同需求和挑战。我们深知数字化转型对于企业的重要性，因此我们的使命是为客户提供卓越的服务，帮助他们在数字时代取得成功。',
        },
        {
          type: 'duo',
          items: [
            { label: '愿景', text: '成为全球领先的数字化转型服务提供商' },
            { label: '使命', text: '用科技创新推动产业升级，助力企业数字化转型' },
          ],
        },
        {
          type: 'iconGrid',
          eyebrow: 'Core Values',
          title: '核心价值观',
          items: [
            { icon: 'bulb', title: '创新', desc: '持续创新，引领行业发展' },
            { icon: 'shield', title: '诚信', desc: '诚信为本，信守承诺' },
            { icon: 'users', title: '协作', desc: '团队协作，共创价值' },
            { icon: 'star', title: '卓越', desc: '追求卓越，永不止步' },
          ],
        },
      ],
    },
  ],

  homeBlocks: [
    {
      type: 'hero',
      sort: 1,
      props: {
        badge: '数字化转型专家 · Digital Transformation',
        h1: '赋能产业未来',
        h2: '构建数字新生态',
        descFrom: 'brand',
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
      eyebrow: 'Success Cases',
      title: '成功案例',
      subtitle: '跨越地产、医疗、文旅等多个行业，持续为客户创造数字化价值。',
      props: { limit: 3, featuredOnly: true, moreText: '查看全部案例', moreTo: '/cases' },
    },
    {
      type: 'partners',
      sort: 5,
      props: { label: '感谢以下伙伴与我们共同推动数字化管理' },
    },
    {
      type: 'cta',
      sort: 6,
      props: {
        eyebrow: 'Get Started',
        title: '开启数字化转型',
        sub: '与唯风一起，用智能技术驱动业务增长',
        cta: { text: '联系我们', to: '/contact' },
      },
    },
  ],
};

/** J(v) → 始终写成字符串存库 */
const J = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? null));

function initContentSchema(db) {
  db.exec(TABLES);
  console.log('[Content] 内容运营域表结构就绪');
}

function seedContent(db) {
  let inserted = 0;

  // 设置
  for (const [key, value, grp] of SEED.settings) {
    const has = db.get('SELECT 1 AS x FROM content_settings WHERE key = ?', key);
    if (!has) {
      db.run('INSERT INTO content_settings (key, value, grp) VALUES (?, ?, ?)', key, J(value), grp);
      inserted++;
    }
  }

  // 后台写接口令牌：首次生成并在启动日志里打印一次，之后可在后台改。
  // ⚠️ BOS 目前零鉴权（所有 /api/* 匿名可调），内容写接口绝不能裸奔 —— 没有这层，
  //    任何人都能改官网。这是 bootstrap 密钥的标准做法：只在缺失时生成+打印一次。
  if (!db.get("SELECT 1 AS x FROM content_settings WHERE key = 'admin.content_token'")) {
    const token = 'ct_' + require('crypto').randomBytes(18).toString('hex');
    db.run("INSERT INTO content_settings (key, value, grp) VALUES ('admin.content_token', ?, 'system')", token);
    console.log('\n[Content] ⚠️  已生成后台内容管理令牌（仅本次打印，请记录）：');
    console.log('           ' + token);
    console.log('           调用后台接口时放在请求头 X-Admin-Token\n');
  }

  // 服务
  if (!db.get('SELECT 1 AS x FROM content_services LIMIT 1')) {
    for (const s of SEED.services) {
      db.run(
        `INSERT INTO content_services (title, subtitle, description, icon, points, business_line_code, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        s.title, s.subtitle || '', s.description || '', s.icon || '', J(s.points || []),
        s.business_line_code || '', s.sort ?? 0
      );
      inserted++;
    }
  }

  // 行业方案
  if (!db.get('SELECT 1 AS x FROM content_industries LIMIT 1')) {
    for (const s of SEED.industries) {
      db.run(
        'INSERT INTO content_industries (title, description, icon, tags, sort) VALUES (?, ?, ?, ?, ?)',
        s.title, s.description || '', s.icon || '', J(s.tags || []), s.sort ?? 0
      );
      inserted++;
    }
  }

  // 案例
  if (!db.get('SELECT 1 AS x FROM content_cases LIMIT 1')) {
    for (const c of SEED.cases) {
      db.run(
        `INSERT INTO content_cases
           (slug, title, category, domain, client, product, subtitle, summary, cover, content, metrics, featured, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.slug, c.title, c.category || '', c.domain || '', c.client || '', c.product || '',
        c.subtitle || '', c.summary || '', c.cover || '', c.content || '',
        J(c.metrics || []), c.featured ? 1 : 0, c.sort ?? 0
      );
      inserted++;
    }
  }

  // 文章
  if (!db.get('SELECT 1 AS x FROM content_articles LIMIT 1')) {
    for (const a of SEED.articles) {
      db.run(
        `INSERT INTO content_articles
           (slug, title, category, cover, excerpt, content, published_at, is_top, source, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.slug, a.title, a.category || '', a.cover || '', a.excerpt || '', a.content || '',
        a.published_at || '', a.is_top ? 1 : 0, a.source || '原创', a.sort ?? 0
      );
      inserted++;
    }
  }

  // 合作伙伴
  if (!db.get('SELECT 1 AS x FROM content_partners LIMIT 1')) {
    for (const p of SEED.partners) {
      db.run(
        'INSERT INTO content_partners (name, logo, url, sort) VALUES (?, ?, ?, ?)',
        p.name, p.logo || '', p.url || '', p.sort ?? 0
      );
      inserted++;
    }
  }

  // 单页
  for (const pg of SEED.pages) {
    const has = db.get('SELECT 1 AS x FROM content_pages WHERE slug = ?', pg.slug);
    if (!has) {
      db.run(
        `INSERT INTO content_pages (slug, title, subtitle, seo_title, seo_description, blocks, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        pg.slug, pg.title, pg.subtitle || '', pg.seo_title || '', pg.seo_description || '',
        J(pg.blocks || []), 1
      );
      inserted++;
    }
  }

  // 首页区块
  if (!db.get('SELECT 1 AS x FROM content_home_blocks LIMIT 1')) {
    for (const b of SEED.homeBlocks) {
      db.run(
        `INSERT INTO content_home_blocks (type, eyebrow, title, subtitle, props, enabled, sort)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        b.type, b.eyebrow || '', b.title || '', b.subtitle || '', J(b.props || {}), b.sort ?? 0
      );
      inserted++;
    }
  }

  if (inserted) console.log('[Content] 初始内容已写入 ' + inserted + ' 条');
  else console.log('[Content] 内容表已有数据，跳过初始化');
}

/**
 * 角色权限迁移：给「已经有 settings 权限的角色」补上 content 页。
 *
 * 为什么必须做这一步：role_permissions 一旦写进 system_settings 就有了「快照」语义 ——
 *   改 routes/settings.js 里的 defaultPerms 只对全新库生效，存量库仍然返回老值，
 *   症状是管理员登录后侧栏根本没有「内容管理」入口。
 * 用 marker 键保证只跑一次；之后想在权限矩阵里怎么调都行，不会被反复覆盖。
 */
function migrateContentPermissions(db) {
  const MARK = 'content.perms_migrated';
  if (db.get('SELECT 1 AS x FROM content_settings WHERE key = ?', MARK)) return;
  try {
    const row = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'role_permissions'");
    if (row && row.setting_value) {
      const perms = JSON.parse(row.setting_value);
      let changed = 0;
      for (const role of Object.keys(perms)) {
        const p = perms[role];
        if (p && Array.isArray(p.pages) && p.pages.indexOf('settings') >= 0 && p.pages.indexOf('content') < 0) {
          p.pages.splice(p.pages.indexOf('settings'), 0, 'content');
          changed++;
        }
      }
      if (changed) {
        db.run(
          "UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key='role_permissions'",
          JSON.stringify(perms)
        );
        console.log('[Content] 角色权限已补入 content 页：' + changed + ' 个角色');
      }
    }
  } catch (e) {
    console.warn('[Content] 角色权限迁移跳过:', e.message);
  }
  db.run("INSERT INTO content_settings (key, value, grp) VALUES (?, '1', 'system')", MARK);
}

/**
 * 「关于我们」页的 8 段内容骨架 —— **后台表单与官网注入共用同一套 type 名**：
 *   hero / profile / stats / timeline / crew / tech / credentials / cta
 *
 * 内容 = Lovart 设计稿原文（website/public/about-embed.html 里的静态 markup 是同一个副本）。
 * 为什么要把设计稿文案搬进 DB：
 *   改造前 about 的 blocks 是老的 prose/duo/iconGrid 三段，与新版设计稿毫无关系，
 *   后台表单也就无从编辑。搬进 DB 才有「一处可改、官网同步」。
 *
 * ⚠️ 这里是**初始值**，不是真相源 —— 运营一旦在后台保存过，就以 DB 为准，
 *    migrateAboutBlocks 的内容感知判断（见下）保证不会再被覆盖回来。
 * ⚠️ imageUrl 一律留空：证书图片由运营自己上传（上传前官网按钮显示「证书待上传」，
 *    这是刻意的 —— 与其给一个点了没反应的「查看证书」，不如明说还没传。
 */
const ABOUT_BLOCKS = [
  {
    type: 'hero',
    title: '关于我们',
    subtitleBold: '数字化转型的引领者',
    subtitleRest: '探索产业未来的星际舰队',
    hint: 'EST. 2003 · SHANGHAI',
    ctaText: '联系我们',
  },
  {
    type: 'profile',
    eyebrow: 'COMPANY PROFILE / 公司简介',
    title: '星尘起源 · ',
    em: '数字化星域的探索旗舰',
    // **加粗** 是唯一的行内标记（前端先转义再套 strong），空行分段
    body: '**上海唯风信息技术有限公司**是一家在数字化领域拥有广泛经验的领先企业。我们专注于为不同行业的企业和机构提供全面的数字化解决方案，以满足他们的不同需求和挑战。\n\n我们深知数字化转型对于企业的重要性，因此我们的使命是为客户提供卓越的服务，帮助他们在数字时代取得成功。',
    tags: ['全链路数字化', '行业智能化', 'AI 交付', '高新技术企业'],
    caption: 'ONLYSTYLE · CORE SYSTEM',
  },
  {
    type: 'stats',
    // ⚠️ 单位是**一个字段**（不是 unit + unit2 两个）：官网按空格拆成至多两段渲染，
    //    正好复现设计稿「+」「年」之间 4px flex gap 的排版。后台只填一个框，少一个能填错的地方。
    items: [
      { value: '23', unit: '+ 年', label: '行业深耕', note: 'SINCE 2003' },
      { value: '1000', unit: '万', label: '注册资本', note: 'CNY 10,000,000' },
      { value: '3', unit: '项', label: '核心资质', note: 'LICENSED & CERTIFIED' },
      { value: '4', unit: '省', label: '业务覆盖范围', note: '沪 · 苏 · 浙 · 川' },
    ],
  },
  {
    type: 'timeline',
    eyebrow: 'VOYAGE TIMELINE / 品牌时间线',
    title: '航迹 · ',
    em: '二十余年的星际征途',
    items: [
      { year: '2003', small: 'LAUNCH', title: '公司成立，开启数字化征途', desc: '上海唯风信息技术有限公司于上海注册成立，自此起航，驶入数字化星域。' },
      { year: '2010', small: 'EXPAND', title: '拓展企业信息化服务', desc: '舰队扩容，为不同行业的企业和机构提供全面的信息化解决方案。' },
      { year: '2018', small: 'ORBIT', title: '布局云计算与大数据', desc: '进入云与数据的新轨道，构建弹性架构与实时洞察能力。' },
      { year: '2023', small: 'CERTIFY', title: '获评高新技术企业', desc: '技术实力获官方认证，正式取得「高新技术企业」航行许可。', badge: '✓ 官方认证', code: '证书号 GR202331007290' },
      { year: '2026', small: 'NOW', title: '获跨地区增值电信业务经营许可证', desc: '取得互联网接入服务业务许可，航线覆盖上海、江苏、浙江、四川四省市。', badge: '✓ 现行有效', code: '编号 B1-20262247', now: true },
    ],
  },
  {
    type: 'crew',
    eyebrow: 'FLEET CREW / 舰队成员',
    title: '舰员 · ',
    em: '各司其职的星际乘组',
    sub: '每一位舰员都是舰队不可或缺的一环 —— 从领航到交付，专业分工，协同推进每一次星际任务。',
    // ⚠️ 只存文案。头盔形态（hue/visor/crest）由官网**按序号派生**，
    //    所以增删成员不会打乱视觉，也不需要运营去选「第几款头盔」。
    items: [
      { id: 'CRW-01', role: '战略领航员', en: 'Navigator', desc: '制定航线，把握产业数字化方向' },
      { id: 'CRW-02', role: '技术架构师', en: 'Architect', desc: '搭建星舰引擎，驱动核心系统' },
      { id: 'CRW-03', role: '产品指挥官', en: 'Product', desc: '设计作战方案，连接业务与技术' },
      { id: 'CRW-04', role: '数据占星师', en: 'Data', desc: '解析星图数据，洞察增长轨迹' },
      { id: 'CRW-05', role: '安全守卫者', en: 'Security', desc: '守护舰队屏障，确保合规稳健' },
      { id: 'CRW-06', role: '交付推进员', en: 'Delivery', desc: '落地每一项星际任务' },
    ],
  },
  {
    type: 'tech',
    eyebrow: 'STARSHIP SYSTEMS / 星舰系统',
    title: '系统 · ',
    em: '驱动舰队前进的六大子系统',
    items: [
      { idx: 'SYS.01', title: '全链路数字化方案', desc: '咨询 → 平台开发 → 部署 → 运维，一条完整航线贯穿数字化转型全程。' },
      { idx: 'SYS.02', title: '行业智能化升级', desc: 'AI 算法 + 行业 Know-how，为传统业态装上智能引擎。' },
      { idx: 'SYS.03', title: 'AI 交付服务', desc: '智能生成，专业交付 —— 让 AI 产能落地为可用的业务成果。' },
      { idx: 'SYS.04', title: '云计算与大数据', desc: '弹性架构，实时洞察，为舰队提供源源不断的算力燃料。' },
      { idx: 'SYS.05', title: '网络与信息安全', desc: '等保合规，全链路防护 —— 舰队的能量屏障，坚不可摧。' },
      { idx: 'SYS.06', title: '互联网接入服务', desc: '跨地区 ISP 许可，四省覆盖 —— 官方授牌的星际航道通行权。' },
    ],
  },
  {
    type: 'credentials',
    eyebrow: 'CREDENTIALS / 航行资质',
    title: '资质与荣誉 · ',
    em: '官方颁发的航行许可证',
    sub: '每一份证照，都是舰队合法远航的凭证 —— 经政府主管部门核准，真实可查。',
    items: [
      {
        name: '营业执照', imageUrl: '',
        issuerLabel: '发证机关', issuer: '上海市闵行区市场监督管理局',
        fields: [
          { k: '统一信用代码', v: '913101147472893241', mono: true },
          { k: '法定代表人', v: '卢时扬' },
          { k: '注册资本', v: '人民币 1000.0000 万元整' },
          { k: '成立日期', v: '2003-02-18', mono: true },
          { k: '营业期限', v: '2003-02-18 至 2033-02-17', mono: true },
          { k: '住所', v: '上海市闵行区莲花南路 1500 弄 8-9 号 306 室' },
        ],
      },
      {
        name: '高新技术企业证书', imageUrl: '',
        issuerLabel: '发证机关', issuer: '上海市科学技术委员会 · 上海市财政局 · 国家税务总局上海市税务局',
        fields: [
          { k: '证书编号', v: 'GR202331007290', mono: true },
          { k: '发证时间', v: '2023-12-12', mono: true },
          { k: '有效期', v: '三年' },
          { k: '企业名称', v: '上海唯风信息技术有限公司' },
        ],
      },
      {
        name: '增值电信业务经营许可证', imageUrl: '',
        issuerLabel: '发证机关', issuer: '中华人民共和国工业和信息化部',
        fields: [
          { k: '许可证编号', v: 'B1-20262247', mono: true },
          { k: '业务种类', v: '互联网接入服务业务' },
          { k: '覆盖范围', v: '上海、江苏、浙江、四川' },
          { k: '发证日期', v: '2026-06-26', mono: true },
          { k: '有效期至', v: '2031-06-26', mono: true },
        ],
      },
    ],
  },
  {
    type: 'cta',
    title: '准备启航？',
    subtitle: '与 ONLYSTYLE 一起探索数字星域',
    ctaText: '联系我们',
    ctaUrl: '/contact',
  },
];

/**
 * 「关于我们」页 blocks 升级：老的 prose/duo/iconGrid → 新版 8 段结构。
 *
 * 用**内容感知**而不是 marker 键：老库必然没有 type==='hero' 的段，
 * 运营保存过之后一定有 —— 于是天然幂等，且不需要往 content_settings 里塞标记。
 * ⚠️ 判据是「有没有 hero 段」，所以后台表单必须始终保留 hero（不要允许整段删除）。
 */
function migrateAboutBlocks(db) {
  try {
    const row = db.get("SELECT id, blocks FROM content_pages WHERE slug = 'about'");
    if (!row) return;
    let blocks = [];
    try { blocks = JSON.parse(row.blocks || '[]'); } catch (e) { blocks = []; }
    if (Array.isArray(blocks) && blocks.some((b) => b && b.type === 'hero')) return;
    db.run(
      "UPDATE content_pages SET blocks = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      JSON.stringify(ABOUT_BLOCKS), row.id
    );
    console.log('[Content] 关于我们页 blocks 已升级为 8 段结构（原 ' + (blocks.length || 0) + ' 段旧结构）');
  } catch (e) {
    console.warn('[Content] 关于我们页 blocks 迁移跳过:', e.message);
  }
}

/** 读 / 自增内容版本号（后台每次写操作都要 bump） */
function bumpContentVersion(db) {
  const row = db.get("SELECT value FROM content_settings WHERE key = 'content.version'");
  const next = (parseInt(row?.value, 10) || 0) + 1;
  if (row) db.run("UPDATE content_settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = 'content.version'", String(next));
  else db.run("INSERT INTO content_settings (key, value, grp) VALUES ('content.version', ?, 'system')", String(next));
  return next;
}

/* 契约里 version 是 number —— 存的时候是 TEXT，出口统一转数字，
   否则前端 `version > localVersion` 会退化成字符串比较（'10' < '9'）。 */
function getContentVersion(db) {
  const row = db.get("SELECT value FROM content_settings WHERE key = 'content.version'");
  return parseInt(row?.value, 10) || 1;
}

/**
 * leads 表补跟进列（幂等）
 *
 * 为什么必须有迁移：CREATE TABLE IF NOT EXISTS 对**已存在**的表什么都不做，
 * 老库里 leads 没有 follow_note / updated_at → 后台「客户线索」页一写跟进就报 no such column。
 * 判据用 PRAGMA table_info（按列名，不按列数）—— 列数判据在多列并存时会误判。
 *
 * ⚠️ 走 db.run 而不是 db.exec：DatabaseWrapper.exec 不落盘，改了会丢。
 */
function migrateLeadColumns(db) {
  var cols = db.all('PRAGMA table_info(leads)').map(function (r) { return r.name; });
  var ddl = [];
  if (cols.indexOf('follow_note') < 0) ddl.push("ALTER TABLE leads ADD COLUMN follow_note TEXT DEFAULT ''");
  if (cols.indexOf('updated_at') < 0) ddl.push("ALTER TABLE leads ADD COLUMN updated_at TEXT DEFAULT ''");
  ddl.forEach(function (sql) { db.run(sql); });
  if (ddl.length) console.log('[Content] leads 迁移：新增 ' + ddl.length + ' 列');
}

/**
 * 角色权限补入 leads 页（幂等）
 *
 * 🔴 为什么必须有迁移：role_permissions 是**存在 system_settings 里的快照**，
 *    不是每次从代码推导。新增页面后，已有安装的权限表里没有这个 key，
 *    app.js 的 hasPagePermission('leads') 一律返回 false → 菜单点了没反应
 *    （而且不报错，纯静默）。所以「加页面」必须同时补迁移。
 *
 * 只补 admin / manager / operator，**不给 viewer**：
 *   线索里是待跟进的客户手机号，属销售资源；观察员角色通常只是看经营数据。
 *   要放开就让运营自己在「系统设置 → 部门/权限」里勾 —— 权限表是快照，这里不去强行覆盖。
 *
 * 插在 customers 之后：线索与客户是同一个池子（架构方案 §6），权限上天然一起给。
 */
function migrateLeadPermissions(db) {
  var MARK = 'leads.perms_migrated';
  if (db.get('SELECT 1 AS x FROM content_settings WHERE key = ?', MARK)) return;
  var ROLES = ['admin', 'manager', 'operator'];
  try {
    var row = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'role_permissions'");
    if (row && row.setting_value) {
      var perms = JSON.parse(row.setting_value);
      var changed = 0;
      ROLES.forEach(function (role) {
        var p = perms[role];
        if (!p || !Array.isArray(p.pages) || p.pages.indexOf('leads') >= 0) return;
        var at = p.pages.indexOf('customers');
        p.pages.splice(at >= 0 ? at + 1 : p.pages.length, 0, 'leads');
        changed++;
      });
      if (changed) {
        db.run(
          "UPDATE system_settings SET setting_value=?, updated_at=datetime('now','localtime') WHERE setting_key='role_permissions'",
          JSON.stringify(perms)
        );
        console.log('[Content] 角色权限已补入 leads 页：' + changed + ' 个角色');
      }
    }
  } catch (e) {
    console.warn('[Content] leads 权限迁移跳过:', e.message);
  }
  db.run("INSERT INTO content_settings (key, value, grp) VALUES (?, '1', 'system')", MARK);
}

module.exports = { initContentSchema, seedContent, migrateContentPermissions, migrateAboutBlocks, migrateLeadColumns, migrateLeadPermissions, ABOUT_BLOCKS, bumpContentVersion, getContentVersion, SEED };
