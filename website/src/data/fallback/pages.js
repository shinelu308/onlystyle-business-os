/**
 * 兜底数据 · 单页（契约类型 pages）
 *
 * 单页也用「区块数组」描述，和首页同一套思路 ——
 * 这样「关于我们」以后加一段、调个顺序，后台配就行，不用改前端。
 * 区块类型目前用到三种：prose（段落）/ duo（双栏卡）/ iconGrid（带图标四宫格）。
 */

export const pages = {
  about: {
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
        body: '上海唯风信息技术有限公司是一家在数字化领域拥有广泛经验的领先公司。我们专注于为各种不同行业的企业和机构提供全面的数字化解决方案，以满足他们的不同需求和挑战。我们深知数字化转型对于企业的重要性，因此我们的使命是为客户提供卓越的服务，帮助他们在数字时代取得成功。',
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
    sort: 1,
    status: 1,
    channel: 'web',
  },
};
