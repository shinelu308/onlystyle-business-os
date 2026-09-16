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

module.exports = { initContentSchema, seedContent, migrateContentPermissions, bumpContentVersion, getContentVersion, SEED };
