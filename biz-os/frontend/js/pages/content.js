// ===== 内容管理页（内容运营域 · 官网内容源）=====
// 口径依据：design/多业务线系统架构设计方案.md 第九节 + design/内容中台-API契约.md
// 设计稿：design/mockups/content-admin-mockup.html
//
// 这一页只干一件事：把官网内容从「发版才能改」变成「后台点一下就能改」。
// 所有写操作打到 /api/content/admin/*，令牌由登录接口签发（api.js 的 API.content 自动带）。
//
// 三个容易踩的点，写在这里省得以后反复查：
//   ① 后台接口返回的是**原始行** —— enabled/featured/status 都是 0/1 数字，不是布尔；
//   ② 每次写操作后端会自动 bump 内容版本号，这里跟着刷新一下工具条上的版本显示；
//   ③ 前台有 60 秒 HTTP 缓存（max-age=60），所以「保存后前台没立刻变」是正常的，
//      文案里必须如实写明，别让运营以为没保存成功。

var CM_API = '/api/content/admin';

/**
 * 星球库（后台「选择星球」的选项）。
 * 由 `GET /api/content/planets` 拉取 —— 与官网共用后端那一份 GALAXY_PLANETS，
 * 所以后台存下去的 key 官网一定认得。**前端不要自己再写一份清单。**
 * 拉不到时保持空数组，选择器退化成「只能选自动」，其余字段照常可编辑。
 */
var CM_PLANETS = [];

/* ---- 区块类型中文名 ---- */
var CM_TYPE_LABEL = {
  hero: '首屏 Hero',
  services: '服务（我们能做什么）',
  'why-us': '核心优势（为什么选择）',
  cases: '案例（成功案例）',
  partners: '合作伙伴',
  cta: '底部行动号召',
  stats: '数据指标',
  faq: '常见问题'
};

/* ---- 站点配置：只暴露白名单分组 ----
   注意 system 组里有 content.version 和 admin.content_token，绝不出现在界面上。 */
var CM_SETTING_GROUPS = [
  { grp: 'brand', title: '品牌', desc: '站名、公司主体、品牌标语' },
  { grp: 'contact', title: '联系方式', desc: '地址、电话、邮箱、二维码' },
  { grp: 'legal', title: '备案与版权', desc: 'ICP 备案号、版权声明' },
  { grp: 'seo', title: 'SEO', desc: '默认标题与描述（影响搜索引擎与社交分享）' },
  { grp: 'nav', title: '导航与页脚', desc: '顶部导航、页脚导航、右上角按钮（可增删、可排序）' }
];

var CM_LABELS = {
  'brand.name': '站名',
  'brand.company': '公司主体',
  'brand.tagline': '品牌定位',
  'brand.slogan': '品牌标语',
  'contact.address': '地址',
  'contact.tel': '电话',
  'contact.email': '邮箱',
  'contact.hours': '工作时间',
  'contact.site': '网址',
  'contact.siteHref': '网址链接',
  'contact.qrcode': '公众号二维码图',
  'legal.icp': 'ICP 备案号',
  'legal.icpUrl': '备案查询链接',
  'legal.copyright': '版权声明',
  'seo.defaultTitle': '默认标题',
  'seo.defaultDescription': '默认描述',
  'nav.items': '顶部导航',
  'nav.cta': '右上角按钮',
  'footer.nav': '页脚导航'
};

/* ---- 实体表结构（服务 / 行业 / 案例 共用一套增删改查）---- */
var CM_SCHEMAS = {
  services: {
    type: 'services',
    title: '服务目录',
    cols: [
      { k: 'title', label: '标题', type: 'text', required: true, table: true },
      { k: 'subtitle', label: '副标题', type: 'text', table: true },
      { k: 'description', label: '描述', type: 'textarea', rows: 3 },
      { k: 'icon', label: '图标名', type: 'text', ph: 'orbit / cloud / chip / shield', table: true },
      { k: 'points', label: '要点', type: 'list', rows: 4, table: true, ph: '一行一条',
        fmt: function (v) { return Array.isArray(v) ? v.join(' · ') : v; } },
      { k: 'business_line_code', label: '业务线代码', type: 'text', ph: '留空表示通用' },
      { k: 'sort', label: '排序', type: 'num', table: true },
      { k: 'status', label: '发布状态', type: 'check', def: 1, table: true, onLabel: '已发布', offLabel: '草稿' }
    ]
  },
  industries: {
    type: 'industries',
    title: '行业方案',
    cols: [
      { k: 'title', label: '标题', type: 'text', required: true, table: true },
      { k: 'description', label: '描述', type: 'textarea', rows: 3 },
      { k: 'icon', label: '图标名', type: 'text', ph: 'city / heart / landmark', table: true },
      { k: 'tags', label: '标签', type: 'list', rows: 3, table: true, ph: '一行一条',
        fmt: function (v) { return Array.isArray(v) ? v.join(' · ') : v; } },
      { k: 'sort', label: '排序', type: 'num', table: true },
      { k: 'status', label: '发布状态', type: 'check', def: 1, table: true, onLabel: '已发布', offLabel: '草稿' }
    ]
  },
  cases: {
    type: 'cases',
    title: '案例',
    cols: [
      { k: 'title', label: '标题', type: 'text', required: true, table: true },
      { k: 'slug', label: 'slug', type: 'text', required: true, ph: '英文短标识，全局唯一，用作详情页地址', table: true },
      { k: 'category', label: '分类', type: 'text', table: true },
      { k: 'domain', label: '领域', type: 'text', table: true },
      { k: 'client', label: '客户', type: 'text' },
      { k: 'product', label: '产品 / 平台', type: 'text' },
      { k: 'subtitle', label: '副标题', type: 'text' },
      { k: 'summary', label: '一句话简介', type: 'textarea', rows: 3 },
      { k: 'cover', label: '封面图', type: 'text', ph: '/uploads/xxx.png' },
      { k: 'metrics', label: '结构化指标', type: 'metrics', table: true,
        fmt: function (v) {
          if (!Array.isArray(v) || !v.length) return '';
          // 表格里只展示前两条 + 余量提示；全铺开会把「操作」列挤出屏幕
          var out = [];
          var n = Math.min(v.length, 2);
          for (var i = 0; i < n; i++) out.push((v[i].value || '') + ' ' + (v[i].label || ''));
          return out.join(' · ') + (v.length > n ? ' +' + (v.length - n) : '');
        } },

      /* ── 案例星系（官网 /cases 页的 3D 星球）──
         这 4 个字段**存在 ext 这一列 JSON 里**，不新增数据库列：
         老数据零改动，也不用跑迁移。
         键名带「ext.」前缀，由 cmDeepGet / cmDeepSet 负责钻取与回填。

         ⚠️ 星球的**数量和轨道**不在这里配 —— 那是从「案例条数」和「分类」自动推导的：
            新增一条案例 = 多一颗星球；新增一个分类 = 多一条轨道。
            下面这些只是「这一颗星球长什么样」的微调。 */
      { k: 'ext.industry', label: '星系 · 行业轨道', type: 'text',
        ph: '留空按「分类」自动推导；同分类 = 同一条轨道' },
      { k: 'ext.results', label: '星系 · 关键成果', type: 'list', rows: 3,
        ph: '一行一条，显示在星球详情面板；留空则用上面的「结构化指标」' },
      { k: 'ext.color', label: '星系 · 星球主色', type: 'text',
        ph: '留空按行业自动配色，如 #1F5BFF' },
      { k: 'ext.texture', label: '星系 · 选择星球', type: 'planet',
        ph: '留空 = 自动（按分类落到对应的行业星球；该行业没有贴图就程序化生成一颗）' },

      { k: 'featured', label: '首页推荐', type: 'check', def: 0, table: true, onLabel: '推荐', offLabel: '普通' },
      { k: 'sort', label: '排序', type: 'num', table: true },
      { k: 'status', label: '发布状态', type: 'check', def: 1, table: true, onLabel: '已发布', offLabel: '草稿' }
    ]
  }
};

/* ---- 点号路径读写 ----
   让表单一套代码既能写顶层列（title / sort），也能写 JSON 列里的字段（ext.color）。
   键名用 'ext.color' 这种写法，保存时自动收拢成 body.ext = { color: ... }。

   ⚠️ 为什么不让后端识别 'ext.color'：admin-content.js 的列白名单来自 PRAGMA，
      'ext.color' 不是真实列名，会被静默过滤掉 —— 表现成「填了没保存」，极难查。 */
var CM_BAD_KEYS = { __proto__: 1, constructor: 1, prototype: 1 };

function cmDeepGet(obj, path) {
  if (obj == null) return undefined;
  var parts = String(path).split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function cmDeepSet(obj, path, val) {
  var parts = String(path).split('.');
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    var k = parts[i];
    if (CM_BAD_KEYS[k]) return obj;
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  var last = parts[parts.length - 1];
  if (!CM_BAD_KEYS[last]) cur[last] = val;
  return obj;
}

/* ---- 页面状态 ---- */
var _contentCurrentTab = 'home';
var _cmBlocks = [];        // 当前首页区块（供编辑时按 id 取原值）
var _cmRows = {};          // type -> 当前表格数据
var _cmSettingKeys = {};   // grp -> 该组的 key 列表（保存时按这个顺序读表单）
var _cmRepCols = {};       // 容器 id -> 列定义（repeater 新增行时要复用）

/* ================================================================
   小工具
   ================================================================ */

function cmKeyId(k) { return String(k).replace(/[^A-Za-z0-9_]/g, '_'); }
function cmFieldId(prefix, k) { return prefix + cmKeyId(k); }
function cmVal(id) { var el = $(id); return el ? el.value : ''; }
function cmNum(id) { var v = cmVal(id); return v === '' ? 0 : (parseInt(v, 10) || 0); }
function cmCheck(id) { var el = $(id); return el ? !!el.checked : false; }

/** 安全 JSON 解析：解析不出来就返回兜底值，不让一个脏值把整页打崩 */
function cmJson(s, fb) {
  if (s == null || s === '') return fb;
  if (typeof s === 'object') return s;
  try {
    var v = JSON.parse(s);
    return v == null ? fb : v;
  } catch (e) {
    return fb;
  }
}

function cmPretty(v) {
  var o = typeof v === 'string' ? cmJson(v, v) : v;
  try { return JSON.stringify(o, null, 2); } catch (e) { return String(o == null ? '' : o); }
}

function cmTxt(v) { return escapeHtml(v == null ? '' : String(v)); }

/** 统一写操作收口：成功刷新版本号 → 回调 → 提示；失败一律弹错误 */
function cmRun(promise, okMsg, cb) {
  promise.then(function (d) {
    cmLoadVersion();
    if (typeof window.cmPreviewRefresh === 'function') window.cmPreviewRefresh(); // 保存即见：预览立即拉最新
    if (typeof cb === 'function') cb(d);
    if (okMsg) showAlert(okMsg, '操作成功');
  }).catch(function (e) {
    showAlert('操作失败：' + (e && e.message ? e.message : e), '出错了');
  });
}

function cmReload() { _renderContentTab(_contentCurrentTab); }

/* ================================================================
   实时预览（方案A）：右侧 iframe 加载官网真实页面。
   · 页面 URL 带 ?preview=1 → 官网读接口自动带 pv 时间戳 → 后端 no-store，保存即见；
   · 普通访客不带参数，照常吃 60 秒缓存，线上行为不变；
   · 所有写操作走 cmRun 收口，成功后自动刷新预览。
   ================================================================ */
function cmPreviewOrigin() {
  // 本地：3100 后台 / 3201 官网（Vite preview）；线上：8081 后台 / 8080 官网（nginx）；同域反代则直接用当前域
  if (location.port === '3100') return location.protocol + '//' + location.hostname + ':3201';
  if (location.port === '8081') return location.protocol + '//' + location.hostname + ':8080';
  return location.origin;
}
function cmPreviewUrl(tab) {
  var map = { home: '/', products: '/products', cases: '/cases', about: '/about', site: '/' };
  var page = map[tab] || '/';
  return cmPreviewOrigin() + page + '?preview=1&t=' + Date.now();
}
function cmPreviewLoad(tab) {
  var f = document.getElementById('cmPreview');
  if (!f) return;
  var url = cmPreviewUrl(tab);
  f.src = url;
  var u = document.getElementById('cmPvUrl');
  if (u) u.textContent = url.replace(/^https?:\/\/[^/]+/, '').replace(/&t=\d+/, '');
}
window.cmPreviewRefresh = function () {
  var f = document.getElementById('cmPreview');
  if (f) f.src = cmPreviewUrl(_contentCurrentTab);
};

/* ---- 工具条 ----
   2026-09-18 简化：版本号 / 刷新 / 发布按钮与提示语全部撤掉（用户确认不需要）。
   版本号机制在后端照常工作（每次写操作自动 bump，官网 60 秒缓存据此失效）。
   保留空函数兼容各 tab 的调用点。 */
function cmToolbar() { return ''; }

function cmLoadVersion() { /* 版本号 UI 已撤；保留空函数兼容既有调用点 */ }

/* ================================================================
   Repeater（可增删的多行编辑器）
   ================================================================ */

function cmRepCols(containerId, cols) { _cmRepCols[containerId] = cols; }

function cmRepRow(cols, v) {
  v = v || {};
  var h = '<div class="cm-row"><span class="cm-grip" title="拖拽排序">⠿</span>';
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    if (c.type === 'check') {
      h += '<label class="cm-inline-check"><input type="checkbox" data-k="' + cmTxt(c.k) + '"' +
        (v[c.k] ? ' checked' : '') + '>' + cmTxt(c.label || c.k) + '</label>';
    } else if (c.type === 'select') {
      var opts = (c.opts || []).slice();
      var cur = v[c.k] == null ? '' : String(v[c.k]);
      // 原值不在选项里时补一个，避免一打开表单就把数据悄悄改掉
      if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
      h += '<select data-k="' + cmTxt(c.k) + '">';
      for (var j = 0; j < opts.length; j++) {
        h += '<option value="' + cmTxt(opts[j]) + '"' + (cur === opts[j] ? ' selected' : '') + '>' + cmTxt(opts[j]) + '</option>';
      }
      h += '</select>';
    } else {
      h += '<input type="text" data-k="' + cmTxt(c.k) + '" placeholder="' + cmTxt(c.ph || c.k) + '" value="' +
        cmTxt(v[c.k] == null ? '' : v[c.k]) + '">';
    }
  }
  h += '<button type="button" class="cm-del" title="删除本行" onclick="cmRepDel(this)">✕</button></div>';
  return h;
}

function cmRepeaterHtml(containerId, rows) {
  rows = Array.isArray(rows) ? rows : [];
  var h = '<div class="cm-repeater" id="' + containerId + '">';
  for (var i = 0; i < rows.length; i++) h += cmRepRow(_cmRepCols[containerId] || [], rows[i]);
  h += '</div>';
  h += '<button type="button" class="btn btn-sm btn-outline" style="margin-top:8px" onclick="cmRepAdd(\'' +
    containerId + '\')">+ 添加一行</button>';
  return h;
}

function cmRepAdd(containerId) {
  var box = $(containerId);
  if (!box) return;
  box.insertAdjacentHTML('beforeend', cmRepRow(_cmRepCols[containerId] || [], {}));
}

function cmRepDel(btn) {
  var row = btn;
  while (row && !row.classList.contains('cm-row')) row = row.parentNode;
  if (row && row.parentNode) row.parentNode.removeChild(row);
}

function cmRepRead(containerId) {
  var box = $(containerId);
  var out = [];
  if (!box) return out;
  var rows = box.querySelectorAll('.cm-row');
  for (var i = 0; i < rows.length; i++) {
    var obj = {};
    var els = rows[i].querySelectorAll('[data-k]');
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      var k = el.getAttribute('data-k');
      obj[k] = el.type === 'checkbox' ? !!el.checked : el.value;
    }
    out.push(obj);
  }
  return out;
}

/* ================================================================
   页面壳 + tab 切换（与「系统设置」同一套交互）
   ================================================================ */

function renderContent() {
  var body = $('contentBody');
  var tab = window._contentCurrentTab || _contentCurrentTab || 'home';
  window._contentCurrentTab = '';
  _contentCurrentTab = tab;

  body.innerHTML =
    '<div class="settings-page">' +
      '<div class="settings-tabs" id="contentTabs">' +
        cmTabBtn('home', tab, '首页布局') +
        cmTabBtn('products', tab, '产品介绍') +
      // 解决方案板块已整块下线（/services 路由重定向首页），tab 一并移除
      cmTabBtn('cases', tab, '案例星球') +
        cmTabBtn('about', tab, '关于我们') +
        cmTabBtn('site', tab, '站点配置') +
      '</div>' +
      '<div class="cm-split">' +
        '<div class="settings-content cm-form-pane" id="contentPane"></div>' +
        '<div class="cm-preview-pane" id="cmPreviewPane">' +
          '<div class="cm-pv-bar">' +
            '<span class="cm-pv-tag">实时预览</span>' +
            '<span class="cm-pv-url" id="cmPvUrl"></span>' +
            '<span class="cm-pv-sp"></span>' +
            '<button type="button" class="btn btn-sm btn-outline" onclick="cmPreviewRefresh()">刷新预览</button>' +
          '</div>' +
          '<iframe id="cmPreview" class="cm-pv-frame" title="官网实时预览"></iframe>' +
        '</div>' +
      '</div>' +
    '</div>';

  var tabsEl = $('contentTabs');
  if (tabsEl) {
    tabsEl.onclick = function (e) {
      var btn = e.target;
      while (btn && btn !== this) {
        if (btn.classList && btn.classList.contains('settings-tab')) {
          switchContentTab(btn.dataset.tab);
          return;
        }
        btn = btn.parentNode;
      }
    };
  }
  _renderContentTab(tab);
}

function cmTabBtn(name, activeTab, label) {
  return '<button type="button" class="settings-tab' + (name === activeTab ? ' active' : '') +
    '" data-tab="' + name + '">' + label + '</button>';
}

function switchContentTab(tab) { _renderContentTab(tab); }

function _renderContentTab(tab) {
  _contentCurrentTab = tab;
  var pane = $('contentPane');
  if (!pane) return;

  var tabs = document.querySelectorAll('#contentTabs .settings-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === tab);

  // 侧栏子项跟着高亮
  var subs = document.querySelectorAll('.nav-subitem[data-page="content"]');
  for (var j = 0; j < subs.length; j++) subs[j].classList.toggle('active', subs[j].dataset.tab === tab);

  var titles = { home: '首页布局', products: '产品介绍', cases: '案例星球', about: '关于我们', site: '站点配置' };
  if ($('pageTitle')) $('pageTitle').textContent = '内容管理 - ' + (titles[tab] || '');

  pane.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  var renderers = {
    home: renderContentHome,
    products: renderContentProducts,
    cases: renderContentCases,
    about: renderContentAbout,
    site: renderContentSite
  };
  if (renderers[tab]) setTimeout(function () { renderers[tab](pane); }, 20);
  cmLoadVersion();
  cmPreviewLoad(tab);
}

function cmFail(pane, e) {
  var msg = e && e.message ? e.message : String(e);
  pane.innerHTML = cmToolbar() +
    '<div class="card"><div class="card-body"><p class="cm-dim">加载失败：' + cmTxt(msg) + '</p></div></div>';
}

/* ================================================================
   Tab 1 · 首页布局
   ================================================================ */

function renderContentHome(pane) {
  pane.innerHTML = cmToolbar() + '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  API.content.get(CM_API + '/home-blocks').then(function (rows) {
    rows = Array.isArray(rows) ? rows : [];
    _cmBlocks = rows;
    pane.innerHTML = cmToolbar() + cmHeroCard(rows) + cmBlocksCard(rows);
    cmAfterHomeRender();
    cmLoadVersion(); // ⚠️ 必须在最后一次 innerHTML 之后 —— 工具条被重建，版本号会被冲回「—」
  }).catch(function (e) { cmFail(pane, e); });
}

function cmAfterHomeRender() {
  cmBindSortable();
  var list = $('cmSortList');
  if (list) cmSyncSort(list);
}

function cmBlockById(id) {
  for (var i = 0; i < _cmBlocks.length; i++) if (Number(_cmBlocks[i].id) === Number(id)) return _cmBlocks[i];
  return null;
}

function cmInput(id, label, value, hint) {
  return '<div class="form-group"><label>' + cmTxt(label) +
    (hint ? ' <span class="cm-hint">' + cmTxt(hint) + '</span>' : '') +
    '</label><input type="text" id="' + id + '" value="' + cmTxt(value) + '"></div>';
}

/* ---- 首屏 Hero 结构化表单（运营改得最多的就是这里）---- */
function cmHeroCard(rows) {
  var hero = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].type === 'hero') hero = rows[i];
  if (!hero) {
    return '<div class="card" style="margin-bottom:20px">' +
      '<div class="card-header"><h3>首屏 Hero</h3></div>' +
      '<div class="card-body"><p class="cm-dim">首页还没有 hero 区块。</p></div></div>';
  }

  var p = cmJson(hero.props, {});
  var cta = Array.isArray(p.cta) ? p.cta : [];
  var stats = Array.isArray(p.stats) ? p.stats : [];

  cmRepCols('cmHero_cta', [
    { k: 'text', ph: '按钮文案' },
    { k: 'to', ph: '/services' },
    { k: 'style', type: 'select', opts: ['primary', 'outline', 'ghost'] }
  ]);
  cmRepCols('cmHero_stats', [
    { k: 'num', ph: '20' },
    { k: 'suffix', ph: '+' },
    { k: 'label', ph: '年行业经验' }
  ]);

  var body =
    '<div class="cm-2col">' +
      cmInput('cmHero_h1', '主标题 H1', p.h1) +
      cmInput('cmHero_h2', '副标题 H2', p.h2) +
      cmInput('cmHero_badge', '徽章文字', p.badge) +
      cmInput('cmHero_descFrom', '描述来源', p.descFrom, 'brand = 取品牌标语') +
    '</div>' +
    '<div class="cm-subhead">按钮 CTA<span class="cm-hint">前台按这个顺序排按钮</span></div>' +
    cmRepeaterHtml('cmHero_cta', cta) +
    '<div class="cm-subhead">数据指标 stats<span class="cm-hint">显示在首屏底部</span></div>' +
    cmRepeaterHtml('cmHero_stats', stats) +
    '<div class="form-actions"><button type="button" class="btn btn-primary" onclick="cmSaveHero(' + hero.id + ')">保存首屏</button></div>';

  return '<div class="card" style="margin-bottom:20px">' +
    '<div class="card-header"><h3>首屏 Hero</h3><span class="cm-hint">首页第一屏 · 保存后前台最多 60 秒更新</span></div>' +
    '<div class="card-body">' + body + '</div></div>';
}

function cmSaveHero(id) {
  var hero = cmBlockById(id);
  var props = hero ? cmJson(hero.props, {}) : {};
  props.badge = cmVal('cmHero_badge');
  props.h1 = cmVal('cmHero_h1');
  props.h2 = cmVal('cmHero_h2');
  props.descFrom = cmVal('cmHero_descFrom');
  props.cta = cmRepRead('cmHero_cta');
  props.stats = cmRepRead('cmHero_stats');

  cmRun(API.content.put(CM_API + '/home-blocks/' + id, { props: props }),
    '首屏已保存。前台最多 60 秒内自动更新。');
}

/* ---- 区块顺序与开关（方案 B：拖拽 + 上下移）---- */
function cmBlocksCard(rows) {
  var list = '';
  for (var i = 0; i < rows.length; i++) {
    var b = rows[i];
    var on = Number(b.enabled) ? true : false;
    var meta = b.title || b.subtitle || (b.props && (b.props.h1 || b.props.label)) || '—';
    list += '<div class="cm-sortitem' + (on ? '' : ' is-off') + '" draggable="true" data-id="' + b.id + '">' +
      '<span class="cm-grip" title="按住拖拽换位">⠿</span>' +
      '<span class="cm-sortnum">' + (i + 1) + '</span>' +
      '<span class="cm-sortname">' + cmTxt(CM_TYPE_LABEL[b.type] || b.type) +
        '<span class="cm-hint">' + cmTxt(b.type) + '</span></span>' +
      '<span class="cm-sortmeta">' + cmTxt(meta) + '</span>' +
      '<button type="button" class="cm-switch' + (on ? ' on' : '') + '" data-id="' + b.id + '" data-on="' + (on ? 1 : 0) +
        '" title="启用 / 停用" onclick="cmToggleBlock(this)"><i></i></button>' +
      '<span class="cm-sortbtns">' +
        '<button type="button" class="btn btn-sm btn-outline js-up" title="上移" onclick="cmMoveBlock(this,-1)">↑</button>' +
        '<button type="button" class="btn btn-sm btn-outline js-down" title="下移" onclick="cmMoveBlock(this,1)">↓</button>' +
      '</span>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="cmEditBlock(' + b.id + ')">编辑</button>' +
      '</div>';
  }

  return '<div class="card">' +
    '<div class="card-header"><h3>区块顺序与开关</h3>' +
      '<span class="cm-hint">拖 ⠿ 换位，或用 ↑↓ 微调；关掉的区块首页立即不渲染</span></div>' +
    '<div class="card-body">' +
      (rows.length
        ? '<div class="cm-sortlist" id="cmSortList">' + list + '</div>'
        : '<div class="empty-state"><p>还没有区块</p></div>') +
      '<p class="cm-note">顺序 = 首页从上到下的渲染顺序。调整后自动保存，不用再点保存按钮。</p>' +
    '</div></div>';
}

function cmSyncSort(list) {
  var items = list.querySelectorAll('.cm-sortitem');
  for (var i = 0; i < items.length; i++) {
    var num = items[i].querySelector('.cm-sortnum');
    if (num) num.textContent = i + 1;
    var up = items[i].querySelector('.js-up');
    var down = items[i].querySelector('.js-down');
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === items.length - 1;
  }
}

function cmBindSortable() {
  var list = $('cmSortList');
  if (!list) return;
  var dragged = null;
  var items = list.querySelectorAll('.cm-sortitem');

  function bind(el) {
    el.addEventListener('dragstart', function (e) {
      dragged = el;
      el.classList.add('is-drag');
      try {
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
      } catch (_) { /* 某些浏览器对 dataTransfer 只读 */ }
    });
    el.addEventListener('dragend', function () {
      el.classList.remove('is-drag');
      var all = list.querySelectorAll('.cm-sortitem');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('drag-over');
      dragged = null;
      cmSyncSort(list);
      cmCommitOrder();
    });
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (!dragged || dragged === el) return;
      var r = el.getBoundingClientRect();
      var after = (e.clientY - r.top) > r.height / 2;
      list.insertBefore(dragged, after ? el.nextSibling : el);
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', function () { el.classList.remove('drag-over'); });
  }

  for (var i = 0; i < items.length; i++) bind(items[i]);
}

function cmCommitOrder() {
  var list = $('cmSortList');
  if (!list) return;
  var items = list.querySelectorAll('.cm-sortitem');
  var ids = [];
  for (var i = 0; i < items.length; i++) ids.push(parseInt(items[i].dataset.id, 10));
  // 拖拽是连续动作，不弹提示，只静默保存 + 刷版本号
  API.content.post(CM_API + '/home-blocks/reorder', { ids: ids })
    .then(function () { cmLoadVersion(); })
    .catch(function (e) { showAlert('排序保存失败：' + e.message, '出错了'); });
}

function cmMoveBlock(btn, delta) {
  var row = btn;
  while (row && !row.classList.contains('cm-sortitem')) row = row.parentNode;
  if (!row || !row.parentNode) return;
  var sib = delta < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sib || !sib.classList.contains('cm-sortitem')) return;
  if (delta < 0) row.parentNode.insertBefore(row, sib);
  else row.parentNode.insertBefore(sib, row);
  var list = row.parentNode;
  cmSyncSort(list);
  cmCommitOrder();
}

function cmToggleBlock(btn) {
  var id = parseInt(btn.dataset.id, 10);
  var val = btn.dataset.on === '1' ? 0 : 1;
  API.content.put(CM_API + '/home-blocks/' + id, { enabled: val }).then(function () {
    btn.dataset.on = val ? '1' : '0';
    btn.classList.toggle('on', !!val);
    var row = btn;
    while (row && !row.classList.contains('cm-sortitem')) row = row.parentNode;
    if (row) row.classList.toggle('is-off', !val);
    cmLoadVersion();
  }).catch(function (e) {
    showAlert('切换失败：' + e.message, '出错了');
  });
}

function cmEditBlock(id) {
  var b = cmBlockById(id);
  if (!b) return;
  var props = cmJson(b.props, {});
  var html =
    '<div class="cm-2col">' +
      cmInput('cmB_eyebrow', '小标题 eyebrow', b.eyebrow) +
      cmInput('cmB_title', '标题 title', b.title) +
      cmInput('cmB_subtitle', '副标题 subtitle', b.subtitle) +
    '</div>' +
    '<div class="form-group" style="margin-top:14px"><label>props（JSON）' +
      '<span class="cm-hint">区块的透传参数</span></label>' +
      '<textarea id="cmB_props" rows="12">' + cmTxt(cmPretty(props)) + '</textarea>' +
      '<p class="cm-note">这是该区块的数据体。改之前请确认字段名与前台组件一致；' +
        '首屏 Hero 建议用上面的「首屏 Hero」表单改，那样不会写错字段。</p>' +
    '</div>' +
    '<div class="form-actions">' +
      '<button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>' +
      '<button type="button" class="btn btn-primary" onclick="cmSaveBlock(' + id + ')">保存</button>' +
    '</div>';
  openModal('编辑区块 · ' + (CM_TYPE_LABEL[b.type] || b.type), html);
}

function cmSaveBlock(id) {
  var props;
  try {
    props = JSON.parse(cmVal('cmB_props') || '{}');
  } catch (e) {
    showAlert('props 不是合法 JSON：' + e.message, '格式错误');
    return;
  }
  cmRun(
    API.content.put(CM_API + '/home-blocks/' + id, {
      eyebrow: cmVal('cmB_eyebrow'),
      title: cmVal('cmB_title'),
      subtitle: cmVal('cmB_subtitle'),
      props: props
    }),
    '区块已保存。前台最多 60 秒内自动更新。',
    function () { closeModal(); cmReload(); }
  );
}

/* ================================================================
   Tab 2 · 站点配置
   ================================================================ */

function renderContentSite(pane) {
  pane.innerHTML = cmToolbar() + '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  API.content.get(CM_API + '/settings').then(function (rows) {
    rows = Array.isArray(rows) ? rows : [];
    var byGrp = {};
    for (var i = 0; i < rows.length; i++) {
      var g = rows[i].grp || 'general';
      if (!byGrp[g]) byGrp[g] = [];
      byGrp[g].push(rows[i]);
    }

    _cmSettingKeys = {};
    var html = cmToolbar();
    for (var gi = 0; gi < CM_SETTING_GROUPS.length; gi++) {
      var def = CM_SETTING_GROUPS[gi];
      var list = byGrp[def.grp];
      if (!list || !list.length) continue;
      var body = '';
      var keys = [];
      for (var j = 0; j < list.length; j++) {
        keys.push(list[j].key);
        body += cmSettingField(list[j].key, list[j].value);
      }
      _cmSettingKeys[def.grp] = keys;
      html += '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>' + cmTxt(def.title) + '</h3>' +
          '<span class="cm-hint">' + cmTxt(def.desc) + '</span></div>' +
        '<div class="card-body">' + body +
          '<div class="form-actions"><button type="button" class="btn btn-primary" ' +
            'onclick="cmSaveSettings(\'' + def.grp + '\')">保存「' + cmTxt(def.title) + '」</button></div>' +
        '</div></div>';
    }

    html += '<p class="cm-note">内容版本号与后台访问令牌属系统项，不在此处暴露。' +
      '改完点保存，前台最多 60 秒内自动更新。</p>';

    // 直接写 pane（闭包里就有引用），不要再靠全局 id 找容器 —— 少一处能被中途替换掉的假设
    pane.innerHTML = html;
    cmLoadVersion();
  }).catch(function (e) { cmFail(pane, e); });
}

function cmSettingField(key, value) {
  var label = CM_LABELS[key] || key;

  if (key === 'nav.items' || key === 'footer.nav') {
    var cid = 'cmSet_' + cmKeyId(key);
    cmRepCols(cid, [
      { k: 'text', ph: '名称' },
      { k: 'to', ph: '/path' },
      { k: 'visible', type: 'check', label: '显示' }
    ]);
    return '<div class="cm-subhead">' + cmTxt(label) + '</div>' + cmRepeaterHtml(cid, cmJson(value, []));
  }

  if (key === 'nav.cta') {
    var o = cmJson(value, {});
    return '<div class="cm-subhead">' + cmTxt(label) + '</div>' +
      '<div class="cm-2col">' +
        '<div class="form-group"><label>按钮文案</label><input type="text" id="cmSet_nav_cta_text" value="' + cmTxt(o.text) + '"></div>' +
        '<div class="form-group"><label>链接</label><input type="text" id="cmSet_nav_cta_to" value="' + cmTxt(o.to) + '"></div>' +
      '</div>' +
      '<label class="cm-inline-check" style="margin-top:10px">' +
        '<input type="checkbox" id="cmSet_nav_cta_visible"' + (o.visible === false ? '' : ' checked') + '>显示该按钮</label>';
  }

  return '<div class="form-group"><label>' + cmTxt(label) +
    ' <span class="cm-hint">' + cmTxt(key) + '</span></label>' +
    '<input type="text" id="cmSet_' + cmKeyId(key) + '" value="' + cmTxt(value) + '"></div>';
}

function cmSaveSettings(grp) {
  var keys = _cmSettingKeys[grp] || [];
  if (!keys.length) { showAlert('该分组没有可保存的字段'); return; }
  var items = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key === 'nav.items' || key === 'footer.nav') {
      items.push({ key: key, value: JSON.stringify(cmRepRead('cmSet_' + cmKeyId(key))), grp: 'nav' });
    } else if (key === 'nav.cta') {
      items.push({
        key: key,
        value: JSON.stringify({
          text: cmVal('cmSet_nav_cta_text'),
          to: cmVal('cmSet_nav_cta_to'),
          visible: cmCheck('cmSet_nav_cta_visible')
        }),
        grp: 'nav'
      });
    } else {
      items.push({ key: key, value: cmVal('cmSet_' + cmKeyId(key)), grp: grp });
    }
  }
  cmRun(API.content.post(CM_API + '/settings/batch', { items: items }),
    '已保存。前台最多 60 秒内自动更新。');
}

/* ================================================================
   Tab 3 · 服务与行业
   ================================================================ */

/* ================================================================
   Tab 4 · 案例
   ================================================================ */

function renderContentCases(pane) {
  pane.innerHTML = cmToolbar() + '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  // 星球库和案例一起拉 —— 表单里的「选择星球」要有它才出得来缩略图。
  // ⚠️ 星球库拉不到**不算失败**：退化成「只能选自动」，其余字段照常可编辑，
  //    总比整页报错强（后台不该因为一个附加清单挂掉）。
  Promise.all([
    API.content.get(CM_API + '/cases'),
    API.content.get('/api/content/planets').catch(function () { return []; }),
  ]).then(function (r) {
    CM_PLANETS = Array.isArray(r[1]) ? r[1] : [];
    pane.innerHTML = cmToolbar() + cmCrudCard('cases', Array.isArray(r[0]) ? r[0] : []);
    cmLoadVersion();
  }).catch(function (e) { cmFail(pane, e); });
}

/* ================================================================
   通用表格 + 增删改（服务 / 行业 / 案例共用）
   ================================================================ */

function cmCrudCard(type, rows) {
  var sc = CM_SCHEMAS[type];
  if (!sc) return '';
  _cmRows[type] = rows;

  var cols = [];
  for (var i = 0; i < sc.cols.length; i++) if (sc.cols[i].table) cols.push(sc.cols[i]);

  var head = '';
  for (var j = 0; j < cols.length; j++) head += '<th>' + cmTxt(cols[j].label) + '</th>';

  var body = '';
  for (var r = 0; r < rows.length; r++) {
    body += '<tr>';
    for (var c = 0; c < cols.length; c++) body += '<td>' + cmCell(cols[c], rows[r]) + '</td>';
    body += '<td><div class="btn-group">' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="cmOpenForm(\'' + type + '\',' + rows[r].id + ')">编辑</button>' +
      '<button type="button" class="btn btn-sm btn-danger" onclick="cmDeleteEntity(\'' + type + '\',' + rows[r].id + ')">删除</button>' +
      '</div></td></tr>';
  }

  return '<div class="card" style="margin-bottom:20px">' +
    '<div class="card-header"><h3>' + cmTxt(sc.title) + '</h3>' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="cmOpenForm(\'' + type + '\',null)">+ 新增</button></div>' +
    '<div class="card-body" style="padding:0">' +
      (rows.length
        ? '<div class="table-wrapper"><table class="cm-crud-table"><thead><tr>' + head + '<th>操作</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="empty-state"><p>还没有数据，点右上角「+ 新增」添加一条</p></div>') +
    '</div></div>';
}

function cmCell(col, row) {
  // 用 cmDeepGet：列键可能是 'ext.industry' 这种点号路径（案例星系的字段在 ext JSON 里）
  var v = cmDeepGet(row, col.k);
  if (col.type === 'check') {
    return v
      ? '<span class="badge success">' + cmTxt(col.onLabel || '是') + '</span>'
      : '<span class="badge secondary">' + cmTxt(col.offLabel || '否') + '</span>';
  }
  if (col.fmt) {
    var s = col.fmt(v);
    return s === '' || s == null ? '<span class="cm-dim">—</span>' : cmTxt(s);
  }
  if (v == null || v === '') return '<span class="cm-dim">—</span>';
  return cmTxt(v);
}

/* ---- 表单 ---- */

/**
 * 「选择星球」被点中时高亮。
 * ⚠️ 用 `<label>` + 内嵌 `<input type=radio>`，点整块都能选中（浏览器原生行为），
 *    这里只负责视觉高亮 —— 不要改成自己管选中状态，否则键盘操作与无障碍会一起失效。
 */
function cmPickPlanet(el) {
  var box = el.parentNode;
  if (!box || !box.getElementsByClassName) return;
  var opts = box.getElementsByClassName('cm-planet-opt');
  for (var i = 0; i < opts.length; i++) opts[i].className = String(opts[i].className).replace(/\s*\bon\b/, '');
  el.className = String(el.className) + ' on';
}

function cmField(col, row) {
  var id = cmFieldId('cmM_', col.k);
  var cur = cmDeepGet(row, col.k);
  var v = cur != null ? cur : (col.def != null ? col.def : '');
  var label = '<label' + (col.required ? ' class="required"' : '') + '>' + cmTxt(col.label) +
    (col.ph ? ' <span class="cm-hint">' + cmTxt(col.ph) + '</span>' : '') + '</label>';

  /* 选择星球：把设计好的星球摆成缩略图让人点，而不是让人去背一个代号。
     选项来自后端星球库（CM_PLANETS），所以「加一颗新星球」只需要改后端那一张表，
     后台与官网会同时认得它。 */
  if (col.type === 'planet') {
    var nm = 'cmplanet_' + cmKeyId(col.k);
    var opts = [{ key: '', label: '自动', texture: '' }].concat(CM_PLANETS);
    var pv = v == null ? '' : String(v);
    // 存的 key 已经不在星球库里（某颗星球被下线）→ 补一个占位项。
    // 不补的话，一打开表单就会静默变成「自动」，人还没动手数据就被改了。
    var known = false;
    for (var q = 0; q < opts.length; q++) if (String(opts[q].key) === pv) known = true;
    if (!known) opts.push({ key: pv, label: '（已下线）' + pv, texture: '' });

    var pick = '<div class="form-group full">' + label + '<div class="cm-planet-pick">';
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var on = String(o.key) === pv;
      pick += '<label class="cm-planet-opt' + (on ? ' on' : '') + '" onclick="cmPickPlanet(this)">' +
        '<input type="radio" name="' + nm + '" value="' + cmTxt(o.key) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="cm-planet-thumb"' + (o.texture ? ' style="background-image:url(\'' + cmTxt(o.texture) + '\')"' : '') + '>' +
          (o.texture ? '' : '自动') + '</span>' +
        '<span class="cm-planet-name">' + cmTxt(o.label) + '</span></label>';
    }
    return pick + '</div><p class="cm-note">后台只存星球代号，贴图地址由星球库统一提供。' +
      '「自动」= 按案例分类落到对应的行业星球。</p></div>';
  }

  if (col.type === 'check') {
    return '<div class="form-group">' + label +
      '<label class="cm-inline-check"><input type="checkbox" id="' + id + '"' +
      (v ? ' checked' : '') + '>启用</label></div>';
  }

  if (col.type === 'list') {
    var arr = Array.isArray(v) ? v : cmJson(v, []);
    return '<div class="form-group full">' + label +
      '<textarea id="' + id + '" rows="' + (col.rows || 4) + '">' + cmTxt(arr.join('\n')) + '</textarea>' +
      '<p class="cm-note">一行一条，保存时自动存成数组。</p></div>';
  }

  if (col.type === 'json') {
    return '<div class="form-group full">' + label +
      '<textarea id="' + id + '" rows="' + (col.rows || 6) + '">' + cmTxt(cmPretty(v)) + '</textarea></div>';
  }

  if (col.type === 'textarea') {
    return '<div class="form-group full">' + label +
      '<textarea id="' + id + '" rows="' + (col.rows || 4) + '">' + cmTxt(v) + '</textarea></div>';
  }

  if (col.type === 'metrics') {
    var m = Array.isArray(v) ? v : cmJson(v, []);
    var repId = 'cmM_' + cmKeyId(col.k) + '_rep';
    cmRepCols(repId, [{ k: 'value', ph: '30%' }, { k: 'label', ph: '效率提升' }]);
    return '<div class="form-group full">' + label +
      cmRepeaterHtml(repId, m) +
      '<p class="cm-note">指标必须是结构化数据 —— 前台要按数字排版渲染渐变高亮，' +
        '写死在正文里就做不出那个效果了。</p>' +
      '<div class="cm-preview" id="cmM_' + cmKeyId(col.k) + '_preview"></div></div>';
  }

  return '<div class="form-group' + (col.wide ? ' full' : '') + '">' + label +
    '<input type="' + (col.type === 'num' ? 'number' : 'text') + '" id="' + id +
    '" value="' + cmTxt(v) + '"></div>';
}

function cmReadField(col) {
  var id = cmFieldId('cmM_', col.k);
  if (col.type === 'check') return cmCheck(id) ? 1 : 0;
  if (col.type === 'num') return cmNum(id);
  if (col.type === 'list') {
    var lines = cmVal(id).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].replace(/^\s+/, '').replace(/\s+$/, '');
      if (s) out.push(s);
    }
    return out;
  }
  if (col.type === 'json') return cmJson(cmVal(id), []);
  if (col.type === 'metrics') return cmRepRead('cmM_' + cmKeyId(col.k) + '_rep');
  if (col.type === 'planet') {
    // 没有 id 可读（是一组同名 radio），必须走 name 查选中项
    var ins = document.getElementsByName('cmplanet_' + cmKeyId(col.k));
    for (var n = 0; n < ins.length; n++) if (ins[n].checked) return ins[n].value;
    return '';
  }
  return cmVal(id);
}

function cmOpenForm(type, id) {
  var sc = CM_SCHEMAS[type];
  if (!sc) return;

  var row = null;
  if (id != null && id !== null) {
    var rows = _cmRows[type] || [];
    for (var i = 0; i < rows.length; i++) if (Number(rows[i].id) === Number(id)) row = rows[i];
    if (!row) return;
  }

  var html = '<div class="cm-2col" id="cmM_form">';
  for (var j = 0; j < sc.cols.length; j++) html += cmField(sc.cols[j], row);
  html += '</div>';
  html += '<div class="form-actions">' +
    '<button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button type="button" class="btn btn-primary" onclick="cmSaveForm(\'' + type + '\',' +
      (row ? row.id : 'null') + ')">保存</button></div>';

  openModal((row ? '编辑' : '新增') + ' · ' + sc.title, html);

  // 案例的指标预览随输入实时刷新
  if (type === 'cases') {
    cmPreviewMetrics();
    var f = $('cmM_form');
    if (f) f.addEventListener('input', cmPreviewMetrics);
    if (f) f.addEventListener('change', cmPreviewMetrics);
  }
}

/**
 * 案例星系的预览：让运营在后台就看见「这颗星球会长什么样」。
 * ⚠️ 不要在这里再引入 .cm-metrics 类名 —— verify-content-admin.cjs 会数
 *    `#cmM_metrics_preview .cm-metrics b` 的个数来断言指标预览渲染正确。
 */
function cmGalaxyPreview() {
  var trim = function (s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); };
  var ind = trim(cmVal('cmM_ext_industry'));
  var color = trim(cmVal('cmM_ext_color'));
  var track = ind || trim(cmVal('cmM_category')) || '未分类';
  var sw = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#5A6B8C';

  // 成果清单：显式填了用显式的，否则与官网一致 —— 从「结构化指标」派生
  var out = [];
  var lines = cmVal('cmM_ext_results').split('\n');
  for (var i = 0; i < lines.length; i++) { var s = trim(lines[i]); if (s) out.push(s); }
  if (!out.length) {
    var m = cmRepRead('cmM_metrics_rep');
    for (var j = 0; j < m.length; j++) {
      var t = trim((m[j].value || '') + ' ' + (m[j].label || ''));
      if (t) out.push(t);
    }
  }

  return '<div class="cm-preview-label" style="margin-top:20px">前台效果预览 · 案例星系</div>' +
    '<div style="display:flex;gap:12px;align-items:flex-start;padding:14px 16px;' +
      'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px">' +
      '<span style="width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:4px;' +
        'background:' + sw + ';box-shadow:0 0 10px ' + sw + '"></span>' +
      '<div style="min-width:0">' +
        '<b>' + cmTxt(track) + '</b> 轨道' +
        '<span class="cm-dim"> · ' + (color ? cmTxt(color) : '自动配色') + '</span>' +
        '<p class="cm-dim" style="margin-top:6px">关键成果：' +
          (out.length ? cmTxt(out.join(' · ')) : '留空 → 用「结构化指标」') + '</p>' +
      '</div>' +
    '</div>' +
    '<p class="cm-note">星球的**数量与轨道**由「案例条数」和「分类」自动推导 —— ' +
      '新增一条已发布的案例，官网 /cases 就多一颗星，不需要改代码。</p>';
}

/** 案例指标的前台效果预览：数值规则与官网一致（design-system.css 的 --brand-gradient） */
function cmPreviewMetrics() {
  var box = $('cmM_metrics_preview');
  if (!box) return;
  var m = cmRepRead('cmM_metrics_rep');
  var h = '<div class="cm-preview-label">前台效果预览 · 结构化指标</div>' +
    '<h4>' + cmTxt(cmVal('cmM_title') || '案例标题') + '</h4>' +
    '<p>' + cmTxt(cmVal('cmM_summary') || '一句话简介') + '</p>';
  if (m.length) {
    h += '<div class="cm-metrics">';
    for (var i = 0; i < m.length; i++) {
      h += '<div><b>' + cmTxt(m[i].value || '—') + '</b><span>' + cmTxt(m[i].label || '') + '</span></div>';
    }
    h += '</div>';
  } else {
    h += '<p class="cm-dim" style="margin-top:12px">还没有指标</p>';
  }
  h += cmGalaxyPreview();
  box.innerHTML = h;
}

function cmSaveForm(type, id) {
  var sc = CM_SCHEMAS[type];
  if (!sc) return;

  // 用 cmDeepSet 组装：'ext.color' 会收拢成 body.ext = { color: ... }，后端再整体序列化进 ext 列。
  // ⚠️ 后端 PUT 是**整列覆盖** —— ext 一旦被发送就整体替换，
  //    所以属于 ext 的字段必须全部出现在表单里，漏一个就会被这次保存清空。
  var body = {};
  for (var i = 0; i < sc.cols.length; i++) cmDeepSet(body, sc.cols[i].k, cmReadField(sc.cols[i]));

  for (var j = 0; j < sc.cols.length; j++) {
    var c = sc.cols[j];
    var val = cmDeepGet(body, c.k);
    if (c.required && (val === '' || val == null)) {
      showAlert('「' + c.label + '」不能为空', '还差一项');
      return;
    }
  }

  var p = (id != null && id !== null)
    ? API.content.put(CM_API + '/' + type + '/' + id, body)
    : API.content.post(CM_API + '/' + type, body);

  cmRun(p, '已保存。前台最多 60 秒内自动更新。', function () { closeModal(); cmReload(); });
}

function cmDeleteEntity(type, id) {
  var rows = _cmRows[type] || [];
  var label = '#' + id;
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i].id) === Number(id)) {
      label = String(rows[i].title || rows[i].name || rows[i].key || label);
    }
  }
  showConfirm('确认删除「' + label + '」？此操作不可撤销。', function (ok) {
    if (!ok) return;
    cmRun(API.content.del(CM_API + '/' + type + '/' + id), '已删除。前台最多 60 秒内自动更新。', cmReload);
  });
}


/* ================================================================
   Tab · 产品介绍（官网 /products 单页文案）
   关于我们（官网 /about 单页文案）
   数据：content_pages 行 { slug, title, subtitle, blocks:JSON }，
   走通用 CRUD（POST /pages 创建、PUT /pages/:id 更新）。
   products.blocks = [{ type:'flagship', key:'loudaren'|'weifeng',
     badges, title, desc, ctaText, ctaUrl }]
   about.blocks 沿用官网结构（prose/duo/iconGrid），第一版只开放
   标题/副标题/公司简介正文/愿景/使命；核心价值观等后续再开放。
   ================================================================ */

var _cmProductsId = null;

/* 官网内置兜底文案（与 Products.vue 的 fallback 保持一致；后台只在前端拉不到行时用来预填表单） */
var CM_PRODUCTS_FB = {
  subtitle: '以自研「楼达人资产管理平台」与「唯风数字营销自动化平台」为核心，为园区与楼宇资方提供资产管理数字化的一站式方案，为企业提供营销内容生产与分发的全流程自动化。',
  loudaren: {
    badges: '主打产品 · SAAS 模式 · 开箱即用 · 多业态资产运营',
    title: '楼达人资产管理平台',
    desc: '面向写字楼、园区、商业、公寓等多业态资产，提供覆盖「资产数字化台账 — 招商租赁 — 业财一体 — 运营增值」全流程的一站式运营系统，让每一平米资产可视、可控、可增值。',
    ctaText: '进入平台 ↗',
    ctaUrl: 'https://biz.loudaren.com/orgs/#/index?from=system'
  },
  weifeng: {
    badges: '营销自动化 · 内容生产 · 全渠道分发',
    title: '唯风数字营销自动化平台',
    desc: '为企业提供营销内容生产与分发的全流程自动化，从素材管理、智能内容生成到多渠道一键分发与数据回流，让营销更高效、增长可度量。',
    ctaText: '进入平台 ↗',
    ctaUrl: '/contact'
  }
};

function cmPageFind(rows, slug) {
  rows = Array.isArray(rows) ? rows : [];
  for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
  return null;
}

function cmFld(id, label, v, ph) {
  return '<div class="form-group"><label>' + label + '</label>' +
    '<input type="text" id="' + id + '" value="' + cmTxt(v == null ? '' : v) + '" placeholder="' + cmTxt(ph || '') + '"></div>';
}
function cmFldTa(id, label, v, rowsN) {
  return '<div class="form-group"><label>' + label + '</label>' +
    '<textarea id="' + id + '" rows="' + (rowsN || 3) + '">' + cmTxt(v == null ? '' : v) + '</textarea></div>';
}

/* ---- 产品介绍 ---- */

function renderContentProducts(pane) {
  pane.innerHTML = cmToolbar() + '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  API.content.get(CM_API + '/pages').then(function (rows) {
    var row = cmPageFind(rows, 'products');
    var bl = (row && Array.isArray(row.blocks)) ? row.blocks : [];
    function blk(key) {
      for (var i = 0; i < bl.length; i++) if (bl[i].key === key) return bl[i];
      return {};
    }
    var L = blk('loudaren'), W = blk('weifeng'), fb = CM_PRODUCTS_FB;

    pane.innerHTML = cmToolbar() +
      '<div class="card" style="margin-bottom:20px;border-left:3px solid #16a34a;background:#f0fdf4">' +
        '<div class="card-body" style="font-size:13px;color:#166534;line-height:1.8">' +
          '✅ 此处保存后<b>实时作用于官网 /products</b>（页头副标题 + 两张产品卡的徽标 / 标题 / 描述 / 按钮文案与链接）。功能矩阵、跃迁航线、机器人与流水线为设计稿内置内容，暂不支持编辑。' +
        '</div>' +
      '</div>' +
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>页面页头</h3><span class="cm-hint">官网 /products 顶部 Hero 的副标题</span></div>' +
        '<div class="card-body">' + cmFldTa('cmPd_subtitle', '页头副标题', (row && row.subtitle) || fb.subtitle, 3) + '</div>' +
      '</div>' +
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>主打产品 ① · 楼达人资产管理平台</h3><span class="cm-hint">功能矩阵与跃迁航线为设计稿内置，暂不支持编辑</span></div>' +
        '<div class="card-body">' +
          cmFld('cmPd_l_badges', '徽标（用 · 分隔）', L.badges || fb.loudaren.badges) +
          cmFld('cmPd_l_title', '标题', L.title || fb.loudaren.title) +
          cmFldTa('cmPd_l_desc', '描述', L.desc || fb.loudaren.desc, 4) +
          '<div class="cm-2col">' +
            cmFld('cmPd_l_ctaText', '按钮文案', L.ctaText || fb.loudaren.ctaText) +
            cmFld('cmPd_l_ctaUrl', '按钮链接', L.ctaUrl || fb.loudaren.ctaUrl, '完整网址') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>主打产品 ② · 唯风数字营销自动化平台</h3><span class="cm-hint">机器人与流水线为设计稿内置，暂不支持编辑</span></div>' +
        '<div class="card-body">' +
          cmFld('cmPd_w_badges', '徽标（用 · 分隔）', W.badges || fb.weifeng.badges) +
          cmFld('cmPd_w_title', '标题', W.title || fb.weifeng.title) +
          cmFldTa('cmPd_w_desc', '描述', W.desc || fb.weifeng.desc, 4) +
          '<div class="cm-2col">' +
            cmFld('cmPd_w_ctaText', '按钮文案', W.ctaText || fb.weifeng.ctaText) +
            cmFld('cmPd_w_ctaUrl', '按钮链接', W.ctaUrl || fb.weifeng.ctaUrl, '站内路由如 /contact，或完整网址') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-actions"><button type="button" class="btn btn-primary" onclick="cmSaveProducts()">保存产品介绍页</button></div>' +
      '<p class="cm-note">功能矩阵、机器人、流水线等条目为内置内容，条目级编辑将在后续版本开放。</p>';

    _cmProductsId = row ? row.id : null;
    cmLoadVersion();
  }).catch(function (e) { cmFail(pane, e); });
}

function cmSaveProducts() {
  var blocks = [
    { type: 'flagship', key: 'loudaren',
      badges: cmVal('cmPd_l_badges'), title: cmVal('cmPd_l_title'),
      desc: cmVal('cmPd_l_desc'), ctaText: cmVal('cmPd_l_ctaText'), ctaUrl: cmVal('cmPd_l_ctaUrl') },
    { type: 'flagship', key: 'weifeng',
      badges: cmVal('cmPd_w_badges'), title: cmVal('cmPd_w_title'),
      desc: cmVal('cmPd_w_desc'), ctaText: cmVal('cmPd_w_ctaText'), ctaUrl: cmVal('cmPd_w_ctaUrl') }
  ];
  var body = { slug: 'products', title: '产品介绍', subtitle: cmVal('cmPd_subtitle'), blocks: blocks, status: 1, channel: 'web' };
  var req = _cmProductsId
    ? API.content.put(CM_API + '/pages/' + _cmProductsId, body)
    : API.content.post(CM_API + '/pages', body);
  cmRun(req, '已保存。官网产品介绍页最多 60 秒内自动更新。');
}

/* ---- 关于我们 ----
   8 段结构与后端 content-schema.js 的 ABOUT_BLOCKS 一一对应：
     hero / profile / stats / timeline / crew / tech / credentials / cta
   ⚠️ 两处的初始值必须保持一致（verify-about-admin.cjs 会做深度比对）；
      唯一的真相源仍是 DB —— 这里只在前端拉不到行时用来预填表单。
   ⚠️ 空值语义：官网侧 setText 遇到空字符串会**跳过**（保持设计稿原文），
      所以「留空」= 回落到设计稿，而不是把官网清空。 */

var CM_ABOUT_FB = {
  hero: {
    title: '关于我们',
    subtitleBold: '数字化转型的引领者',
    subtitleRest: '探索产业未来的星际舰队',
    hint: 'EST. 2003 · SHANGHAI',
    ctaText: '联系我们'
  },
  profile: {
    eyebrow: 'COMPANY PROFILE / 公司简介',
    title: '星尘起源 · ',
    em: '数字化星域的探索旗舰',
    body: '**上海唯风信息技术有限公司**是一家在数字化领域拥有广泛经验的领先企业。我们专注于为不同行业的企业和机构提供全面的数字化解决方案，以满足他们的不同需求和挑战。\n\n我们深知数字化转型对于企业的重要性，因此我们的使命是为客户提供卓越的服务，帮助他们在数字时代取得成功。',
    tags: ['全链路数字化', '行业智能化', 'AI 交付', '高新技术企业'],
    caption: 'ONLYSTYLE · CORE SYSTEM'
  },
  stats: {
    items: [
      { value: '23', unit: '+ 年', label: '行业深耕', note: 'SINCE 2003' },
      { value: '1000', unit: '万', label: '注册资本', note: 'CNY 10,000,000' },
      { value: '3', unit: '项', label: '核心资质', note: 'LICENSED & CERTIFIED' },
      { value: '4', unit: '省', label: '业务覆盖范围', note: '沪 · 苏 · 浙 · 川' }
    ]
  },
  timeline: {
    eyebrow: 'VOYAGE TIMELINE / 品牌时间线',
    title: '航迹 · ',
    em: '二十余年的星际征途',
    items: [
      { year: '2003', small: 'LAUNCH', title: '公司成立，开启数字化征途', desc: '上海唯风信息技术有限公司于上海注册成立，自此起航，驶入数字化星域。' },
      { year: '2010', small: 'EXPAND', title: '拓展企业信息化服务', desc: '舰队扩容，为不同行业的企业和机构提供全面的信息化解决方案。' },
      { year: '2018', small: 'ORBIT', title: '布局云计算与大数据', desc: '进入云与数据的新轨道，构建弹性架构与实时洞察能力。' },
      { year: '2023', small: 'CERTIFY', title: '获评高新技术企业', desc: '技术实力获官方认证，正式取得「高新技术企业」航行许可。', badge: '✓ 官方认证', code: '证书号 GR202331007290' },
      { year: '2026', small: 'NOW', title: '获跨地区增值电信业务经营许可证', desc: '取得互联网接入服务业务许可，航线覆盖上海、江苏、浙江、四川四省市。', badge: '✓ 现行有效', code: '编号 B1-20262247', now: true }
    ]
  },
  crew: {
    eyebrow: 'FLEET CREW / 舰队成员',
    title: '舰员 · ',
    em: '各司其职的星际乘组',
    sub: '每一位舰员都是舰队不可或缺的一环 —— 从领航到交付，专业分工，协同推进每一次星际任务。',
    items: [
      { id: 'CRW-01', role: '战略领航员', en: 'Navigator', desc: '制定航线，把握产业数字化方向' },
      { id: 'CRW-02', role: '技术架构师', en: 'Architect', desc: '搭建星舰引擎，驱动核心系统' },
      { id: 'CRW-03', role: '产品指挥官', en: 'Product', desc: '设计作战方案，连接业务与技术' },
      { id: 'CRW-04', role: '数据占星师', en: 'Data', desc: '解析星图数据，洞察增长轨迹' },
      { id: 'CRW-05', role: '安全守卫者', en: 'Security', desc: '守护舰队屏障，确保合规稳健' },
      { id: 'CRW-06', role: '交付推进员', en: 'Delivery', desc: '落地每一项星际任务' }
    ]
  },
  tech: {
    eyebrow: 'STARSHIP SYSTEMS / 星舰系统',
    title: '系统 · ',
    em: '驱动舰队前进的六大子系统',
    items: [
      { idx: 'SYS.01', title: '全链路数字化方案', desc: '咨询 → 平台开发 → 部署 → 运维，一条完整航线贯穿数字化转型全程。' },
      { idx: 'SYS.02', title: '行业智能化升级', desc: 'AI 算法 + 行业 Know-how，为传统业态装上智能引擎。' },
      { idx: 'SYS.03', title: 'AI 交付服务', desc: '智能生成，专业交付 —— 让 AI 产能落地为可用的业务成果。' },
      { idx: 'SYS.04', title: '云计算与大数据', desc: '弹性架构，实时洞察，为舰队提供源源不断的算力燃料。' },
      { idx: 'SYS.05', title: '网络与信息安全', desc: '等保合规，全链路防护 —— 舰队的能量屏障，坚不可摧。' },
      { idx: 'SYS.06', title: '互联网接入服务', desc: '跨地区 ISP 许可，四省覆盖 —— 官方授牌的星际航道通行权。' }
    ]
  },
  credentials: {
    eyebrow: 'CREDENTIALS / 航行资质',
    title: '资质与荣誉 · ',
    em: '官方颁发的航行许可证',
    sub: '每一份证照，都是舰队合法远航的凭证 —— 经政府主管部门核准，真实可查。',
    items: [
      {
        name: '营业执照', imageUrl: '', issuerLabel: '发证机关', issuer: '上海市闵行区市场监督管理局',
        fields: [
          { k: '统一信用代码', v: '913101147472893241', mono: true },
          { k: '法定代表人', v: '卢时扬' },
          { k: '注册资本', v: '人民币 1000.0000 万元整' },
          { k: '成立日期', v: '2003-02-18', mono: true },
          { k: '营业期限', v: '2003-02-18 至 2033-02-17', mono: true },
          { k: '住所', v: '上海市闵行区莲花南路 1500 弄 8-9 号 306 室' }
        ]
      },
      {
        name: '高新技术企业证书', imageUrl: '', issuerLabel: '发证机关',
        issuer: '上海市科学技术委员会 · 上海市财政局 · 国家税务总局上海市税务局',
        fields: [
          { k: '证书编号', v: 'GR202331007290', mono: true },
          { k: '发证时间', v: '2023-12-12', mono: true },
          { k: '有效期', v: '三年' },
          { k: '企业名称', v: '上海唯风信息技术有限公司' }
        ]
      },
      {
        name: '增值电信业务经营许可证', imageUrl: '', issuerLabel: '发证机关',
        issuer: '中华人民共和国工业和信息化部',
        fields: [
          { k: '许可证编号', v: 'B1-20262247', mono: true },
          { k: '业务种类', v: '互联网接入服务业务' },
          { k: '覆盖范围', v: '上海、江苏、浙江、四川' },
          { k: '发证日期', v: '2026-06-26', mono: true },
          { k: '有效期至', v: '2031-06-26', mono: true }
        ]
      }
    ]
  },
  cta: {
    title: '准备启航？',
    subtitle: '与 ONLYSTYLE 一起探索数字星域',
    ctaText: '联系我们',
    ctaUrl: '/contact'
  }
};

/* 段落 reapter 的两套列定义（容器 id → 列） */
var CM_STAT_COLS = [
  { k: 'value', label: '数值', ph: '23' },
  { k: 'unit', label: '单位', ph: '+ 年（空格分隔会渲染成两段）' },
  { k: 'label', label: '指标名', ph: '行业深耕' },
  { k: 'note', label: '注释', ph: 'SINCE 2003' }
];
var CM_TL_COLS = [
  { k: 'year', label: '年份', ph: '2003' },
  { k: 'small', label: '角标', ph: 'LAUNCH' },
  { k: 'title', label: '标题', ph: '公司成立，开启数字化征途' },
  { k: 'desc', label: '描述', ph: '一句话说明' },
  { k: 'badge', label: '徽标（可空）', ph: '✓ 官方认证' },
  { k: 'code', label: '编号（可空）', ph: '证书号 GR202331007290' },
  { k: 'now', label: '标记为「现在」', type: 'check' }
];
var CM_CREW_COLS = [
  { k: 'id', label: '代号', ph: 'CRW-01' },
  { k: 'role', label: '角色', ph: '战略领航员' },
  { k: 'en', label: '英文', ph: 'Navigator' },
  { k: 'desc', label: '描述', ph: '制定航线，把握产业数字化方向' }
];
var CM_TECH_COLS = [
  { k: 'idx', label: '编号', ph: 'SYS.01' },
  { k: 'title', label: '标题', ph: '全链路数字化方案' },
  { k: 'desc', label: '描述', ph: '咨询 → 平台开发 → 部署 → 运维' }
];
var CM_CERTFIELD_COLS = [
  { k: 'k', label: '字段名', ph: '如 证书编号' },
  { k: 'v', label: '内容', ph: '如 GR202331007290' },
  { k: 'mono', label: '等宽字体', type: 'check' }
];

/* ================================================================
   段落 repeater（cm-rep2）—— cm-row 的「多字段换行」变体
   为什么另起一套：cmRepRow 是一行塞 N 个 input，4 个以上就会被压到 100px 以内
   （注释「SINCE 2003」根本看不清）。这里保持外层 .cm-row 不变（于是
   cmRepDel / cmRepRead 原样可用），只把内部换成自适应栅格。
   ================================================================ */

function cmRep2Row(cols, v) {
  v = v || {};
  var h = '<div class="cm-row cm-rep2-row"><span class="cm-grip" title="拖拽排序">⠿</span><div class="cm-rep2-grid">';
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    if (c.type === 'check') {
      h += '<label class="cm-inline-check"><input type="checkbox" data-k="' + cmTxt(c.k) + '"' +
        (v[c.k] ? ' checked' : '') + '>' + cmTxt(c.label || c.k) + '</label>';
    } else {
      h += '<div class="form-group"><label>' + cmTxt(c.label || c.k) + '</label>' +
        '<input type="text" data-k="' + cmTxt(c.k) + '" placeholder="' + cmTxt(c.ph || '') + '" value="' +
        cmTxt(v[c.k] == null ? '' : v[c.k]) + '"></div>';
    }
  }
  h += '</div><button type="button" class="cm-del" title="删除本行" onclick="cmRepDel(this)">✕</button></div>';
  return h;
}

function cmRep2Html(containerId, cols, rows) {
  cmRepCols(containerId, cols);
  rows = Array.isArray(rows) ? rows : [];
  var h = '<div class="cm-repeater cm-rep2" id="' + containerId + '">';
  for (var i = 0; i < rows.length; i++) h += cmRep2Row(cols, rows[i]);
  h += '</div>';
  h += '<button type="button" class="btn btn-sm btn-outline" style="margin-top:8px" onclick="cmRep2Add(\'' +
    containerId + '\')">+ 添加一行</button>';
  return h;
}

function cmRep2Add(containerId) {
  var box = $(containerId);
  if (!box) return;
  box.insertAdjacentHTML('beforeend', cmRep2Row(_cmRepCols[containerId] || [], {}));
}

/* ================================================================
   证书管理（cm-cert-*）：上传 / 替换 / 删除 + 详情字段 repeater
   ================================================================ */

var _cmCertSeq = 0;
var _cmAboutId = null;
var _cmAboutBlocks = [];

/** 缩略图：未上传时给个明确的占位，而不是空白方块 */
function cmCertThumbHtml(c) {
  var url = (c && c.imageUrl) || '';
  if (url) {
    return '<div class="cm-cert-thumb"><span class="cm-cert-badge">已上传</span>' +
      '<img src="' + cmTxt(url) + '" alt="证书预览"></div>';
  }
  return '<div class="cm-cert-thumb"><span class="cm-cert-badge pending">待上传</span>' +
    '<div class="ph">' +
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="3" y="4" width="18" height="16" rx="2.5" stroke="#CBD5E1" stroke-width="1.5"></rect>' +
      '<circle cx="9" cy="10" r="1.6" fill="#CBD5E1"></circle>' +
      '<path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>尚未上传<br>点击右侧按钮</div></div>';
}

function cmCertRow(c, seed) {
  c = c || {};
  var fid = 'cmCertFields_' + (seed == null ? (++_cmCertSeq) : seed);
  var fields = Array.isArray(c.fields) ? c.fields : [];
  var url = c.imageUrl || '';
  return '<div class="cm-cert" data-url="' + cmTxt(url) + '">' +
    cmCertThumbHtml(c) +
    '<div>' +
      '<div class="form-group"><label>证书名称</label>' +
        '<input type="text" class="cm-cert-name" value="' + cmTxt(c.name || '') + '" placeholder="如 营业执照"></div>' +
      '<div class="cm-cert-ops">' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="cmCertPick(this)">' +
          (url ? '上传 / 替换' : '上传证书') + '</button>' +
        '<button type="button" class="btn btn-sm btn-outline" onclick="cmCertDel(this)">删除证书</button>' +
        '<input type="file" accept="image/png,image/jpeg,image/webp" style="display:none" onchange="cmCertFile(this)">' +
      '</div>' +
      '<div class="cm-cert-note">图片要求：JPG / PNG / WebP，≤ 8MB，建议长边 ≥ 1600px（横竖版均可，' +
        '查看器等比完整展示，不裁切）。<br>当前文件：<b class="cm-cert-file">' +
        cmTxt(url || '（尚未上传）') + '</b></div>' +
      '<div class="cm-2col" style="margin-top:12px">' +
        '<div class="form-group"><label>机关前缀</label>' +
          '<input type="text" class="cm-cert-issuer-label" value="' + cmTxt(c.issuerLabel || '发证机关') + '"></div>' +
        '<div class="form-group"><label>发证机关</label>' +
          '<input type="text" class="cm-cert-issuer" value="' + cmTxt(c.issuer || '') + '"></div>' +
      '</div>' +
      '<details class="cm-cert-detail"><summary>证书详情字段（卡片上展示的键值对）· ' + fields.length + ' 行</summary>' +
        '<div class="cm-cert-fields">' + cmRep2Html(fid, CM_CERTFIELD_COLS, fields) + '</div>' +
      '</details>' +
    '</div>' +
  '</div>';
}

function cmCertPick(btn) {
  var box = btn.closest ? btn.closest('.cm-cert') : null;
  if (!box) return;
  var inp = box.querySelector('input[type=file]');
  if (inp) { inp.value = ''; inp.click(); }
}

/** 选好文件 → 读成 base64 → POST /upload-cert（接口鉴权走 X-Admin-Token） */
function cmCertFile(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var box = input.closest ? input.closest('.cm-cert') : null;
  var note = box ? box.querySelector('.cm-cert-note') : null;
  var keep = note ? note.innerHTML : '';

  if (file.size > 8 * 1024 * 1024) {
    showAlert('图片 ' + (file.size / 1048576).toFixed(1) + 'MB，超过 8MB 上限。\n' +
      '请先用图片工具压缩（或导出为 JPG 质量 85% 左右）再上传 —— ' +
      '直接截屏保存通常只有几百 KB，已经够用。', '图片过大');
    input.value = '';
    return;
  }
  if (note) note.innerHTML = '⏳ 正在上传 <b>' + cmTxt(file.name) + '</b>（' + (file.size / 1024).toFixed(0) + ' KB）…';

  var fr = new FileReader();
  fr.onload = function () {
    API.content.post(CM_API + '/upload-cert', { image_data: fr.result }).then(function (d) {
      var url = d && d.url;
      if (!url) throw new Error('接口未返回图片地址');
      if (box) {
        box.setAttribute('data-url', url);
        var thumb = box.querySelector('.cm-cert-thumb');
        if (thumb) thumb.innerHTML = '<span class="cm-cert-badge">已上传</span><img src="' + cmTxt(url) + '" alt="证书预览">';
        var upBtn = box.querySelector('.cm-cert-ops .btn-primary');
        if (upBtn) upBtn.textContent = '上传 / 替换';
        var fileEl = box.querySelector('.cm-cert-file');
        if (fileEl) fileEl.textContent = url;
      }
      if (note) {
        note.innerHTML = '图片要求：JPG / PNG / WebP，≤ 8MB，建议长边 ≥ 1600px（横竖版均可，查看器等比完整展示，不裁切）。<br>' +
          '当前文件：<b class="cm-cert-file">' + cmTxt(url) + '</b>' +
          (d.warn ? '<br><span class="cm-cert-note warn">⚠️ ' + cmTxt(d.warn) + '</span>' : '');
      }
      showAlert('证书图片已上传。\n\n记得点最下方「保存关于我们页」—— 官网才会用上这张图。', '上传成功');
    }).catch(function (e) {
      if (note) note.innerHTML = keep;
      showAlert('上传失败：' + (e && e.message ? e.message : e), '出错了');
    });
  };
  fr.onerror = function () {
    if (note) note.innerHTML = keep;
    showAlert('读取本地文件失败，请重试', '出错了');
  };
  fr.readAsDataURL(file);
}

function cmCertDel(btn) {
  var box = btn.closest ? btn.closest('.cm-cert') : null;
  if (!box) return;
  var name = box.querySelector('.cm-cert-name');
  showConfirm('删除证书「' + ((name && name.value) || '未命名') + '」？\n\n' +
    '（只是在表单里移掉这一条，点「保存关于我们页」之后官网才会少一张卡；' +
    '已经上传的图片文件不删除。）', function () {
    box.parentNode.removeChild(box);
  }, '删除证书');
}

function cmCertAdd() {
  var list = $('cmCertList');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', cmCertRow({ issuerLabel: '发证机关' }, null));
}

/** 读回证书列表（结构读 DOM，不按序号 —— 删掉中间一条不会串行） */
function cmCertRead() {
  var list = $('cmCertList');
  var out = [];
  if (!list) return out;
  var blocks = list.querySelectorAll('.cm-cert');
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    out.push({
      name: (b.querySelector('.cm-cert-name') || {}).value || '',
      imageUrl: b.getAttribute('data-url') || '',
      issuerLabel: (b.querySelector('.cm-cert-issuer-label') || {}).value || '发证机关',
      issuer: (b.querySelector('.cm-cert-issuer') || {}).value || '',
      fields: cmRepRead((b.querySelector('.cm-cert-fields .cm-repeater') || {}).id || '')
    });
  }
  return out;
}

/* ================================================================
   关于我们 · 页面渲染
   ================================================================ */

function cmAbGrid2(a, b) {
  // 两列小栅格（区块标题 + 强调后缀这类成对字段）
  return '<div class="cm-2col">' + a + b + '</div>';
}

function renderContentAbout(pane) {
  pane.innerHTML = cmToolbar() + '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  API.content.get(CM_API + '/pages').then(function (rows) {
    var row = cmPageFind(rows, 'about');
    var bl = (row && Array.isArray(row.blocks)) ? row.blocks : [];
    function blk(type) {
      for (var i = 0; i < bl.length; i++) if (bl[i] && bl[i].type === type) return bl[i];
      return null;
    }
    var H = blk('hero') || CM_ABOUT_FB.hero;
    var P = blk('profile') || CM_ABOUT_FB.profile;
    var S = blk('stats') || CM_ABOUT_FB.stats;
    var T = blk('timeline') || CM_ABOUT_FB.timeline;
    var C = blk('crew') || CM_ABOUT_FB.crew;
    var K = blk('tech') || CM_ABOUT_FB.tech;
    var R = blk('credentials') || CM_ABOUT_FB.credentials;
    var A = blk('cta') || CM_ABOUT_FB.cta;

    _cmAboutId = row ? row.id : null;
    _cmAboutBlocks = bl;

    var tags = Array.isArray(P.tags) ? P.tags : [];
    var certItems = Array.isArray(R.items) ? R.items : [];
    var certHtml = '';
    for (var ci = 0; ci < certItems.length; ci++) certHtml += cmCertRow(certItems[ci], ci);

    pane.innerHTML = cmToolbar() +
      '<div class="card" style="margin-bottom:20px;border-left:3px solid #16a34a;background:#f0fdf4">' +
        '<div class="card-body" style="font-size:13px;color:#166534;line-height:1.8">' +
          '✅ 保存后<b>实时作用于官网 /about</b>：页头文案、公司简介、核心数据、品牌时间线、舰队成员、星舰系统、' +
          '航行资质（含<b>证书图片上传</b>）、底部 CTA 全部可编辑。<br>' +
          '留空的字段会保持官网现有文案不变（不会被清空）。' +
        '</div>' +
      '</div>' +

      /* ① 页头 */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>页头 · Hero</h3><span class="cm-hint">官网顶部大标题与按钮</span></div>' +
        '<div class="card-body">' +
          cmFld('cmAb_hero_title', '主标题', H.title || '') +
          cmAbGrid2(
              cmFld('cmAb_hero_bold', '副标题 · 加粗前半段', H.subtitleBold || ''),
            cmFld('cmAb_hero_rest', '副标题 · 后半段', H.subtitleRest || '')) +
          cmAbGrid2(
              cmFld('cmAb_hero_hint', '右上角小字', H.hint || '', 'EST. 2003 · SHANGHAI'),
            cmFld('cmAb_hero_cta', '主按钮文案', H.ctaText || '')) +
        '</div>' +
      '</div>' +

      /* ② 公司简介 */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>公司简介</h3><span class="cm-hint">左侧正文 + 右侧 3D 地球</span></div>' +
        '<div class="card-body">' +
          cmAbGrid2(
              cmFld('cmAb_prof_title', '区块标题', P.title || ''),
            cmFld('cmAb_prof_em', '标题强调后缀', P.em || '')) +
          cmFld('cmAb_prof_eyebrow', '英文小标题', P.eyebrow || '') +
          cmFldTa('cmAb_prof_body', '正文（空行分段，**文字** 加粗）', P.body || '', 7) +
          cmFld('cmAb_prof_tags', '关键词标签（用 · 分隔）', tags.join(' · ')) +
          cmFld('cmAb_prof_caption', '地球下方小字', P.caption || '') +
        '</div>' +
      '</div>' +

      /* ③ 核心数据 */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>核心数据</h3><span class="cm-hint">数字滚动区，图标按顺序自动分配</span></div>' +
        '<div class="card-body">' +
          cmRep2Html('cmAbStats', CM_STAT_COLS, S.items || []) +
          '<p class="cm-note">数值只写数字，单位可写「+ 年」（中间空格会渲染成两段）、「万」、「项」。</p>' +
        '</div>' +
      '</div>' +

      /* ④ 品牌时间线 */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>品牌时间线</h3><span class="cm-hint">可增删条目，「现在」用于高亮最新一条</span></div>' +
        '<div class="card-body">' +
          cmAbGrid2(
              cmFld('cmAb_tl_title', '区块标题', T.title || ''),
            cmFld('cmAb_tl_em', '标题强调后缀', T.em || '')) +
          cmFld('cmAb_tl_eyebrow', '英文小标题', T.eyebrow || '') +
          cmRep2Html('cmAbTl', CM_TL_COLS, T.items || []) +
        '</div>' +
      '</div>' +

      /* ⑤ 舰队成员 */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>舰队成员</h3><span class="cm-hint">全息头像按序号生成，无需上传图片</span></div>' +
        '<div class="card-body">' +
          cmAbGrid2(
              cmFld('cmAb_crew_title', '区块标题', C.title || ''),
            cmFld('cmAb_crew_em', '标题强调后缀', C.em || '')) +
          cmFld('cmAb_crew_eyebrow', '英文小标题', C.eyebrow || '') +
          cmFldTa('cmAb_crew_sub', '区块说明', C.sub || '', 3) +
          cmRep2Html('cmAbCrew', CM_CREW_COLS, C.items || []) +
          '<p class="cm-note">头盔形态按行序自动分配（6 种循环），增删成员不会打乱已有成员的视觉。</p>' +
        '</div>' +
      '</div>' +

      /* ⑥ 星舰系统 */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>星舰系统</h3><span class="cm-hint">六格能力卡，图标按顺序自动分配</span></div>' +
        '<div class="card-body">' +
          cmAbGrid2(
              cmFld('cmAb_tech_title', '区块标题', K.title || ''),
            cmFld('cmAb_tech_em', '标题强调后缀', K.em || '')) +
          cmFld('cmAb_tech_eyebrow', '英文小标题', K.eyebrow || '') +
          cmRep2Html('cmAbTech', CM_TECH_COLS, K.items || []) +
        '</div>' +
      '</div>' +

      /* ⑦ 航行资质 · 证书管理（本页重点） */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>航行资质 · 证书管理</h3><span class="cm-hint">文案 + 图片都要在这里配齐</span></div>' +
        '<div class="card-body">' +
          cmAbGrid2(
              cmFld('cmAb_cert_title', '区块标题', R.title || ''),
            cmFld('cmAb_cert_em', '标题强调后缀', R.em || '')) +
          cmFld('cmAb_cert_eyebrow', '英文小标题', R.eyebrow || '') +
          cmFldTa('cmAb_cert_sub', '区块说明', R.sub || '', 3) +
          '<div id="cmCertList">' + certHtml + '</div>' +
          '<button type="button" class="btn btn-sm btn-outline" onclick="cmCertAdd()">+ 新增一张证书</button>' +
          '<p class="cm-note">未上传图片的证书，官网上按钮显示为「证书待上传」（点击给提示，不会弹出空白浮层）；' +
          '上传后变成「查看证书」，点击弹出舷窗式查看浮层（证书等比完整展示，不裁切）。<br>' +
          '图片按内容哈希命名，换图必换名 —— 所以换了新证书，老访客也不会看到旧图。</p>' +
        '</div>' +
      '</div>' +

      /* ⑧ 底部 CTA */
      '<div class="card" style="margin-bottom:20px">' +
        '<div class="card-header"><h3>底部 CTA</h3><span class="cm-hint">页尾行动号召</span></div>' +
        '<div class="card-body">' +
          cmFld('cmAb_cta_title', '主标题', A.title || '') +
          cmFld('cmAb_cta_sub', '副标题', A.subtitle || '') +
          cmAbGrid2(
              cmFld('cmAb_cta_text', '按钮文案', A.ctaText || ''),
            cmFld('cmAb_cta_url', '按钮链接', A.ctaUrl || '', '站内路由如 /contact，或完整网址')) +
        '</div>' +
      '</div>' +

      '<div class="form-actions"><button type="button" class="btn btn-primary" onclick="cmSaveAbout()">保存关于我们页</button></div>';

    cmLoadVersion();
  }).catch(function (e) { cmFail(pane, e); });
}

function cmSaveAbout() {
  var tags = cmVal('cmAb_prof_tags').split('·').map(function (s) { return s.replace(/^\s+|\s+$/g, ''); })
    .filter(function (s) { return s; });

  var blocks = [
    { type: 'hero',
      title: cmVal('cmAb_hero_title'), subtitleBold: cmVal('cmAb_hero_bold'),
      subtitleRest: cmVal('cmAb_hero_rest'), hint: cmVal('cmAb_hero_hint'),
      ctaText: cmVal('cmAb_hero_cta') },
    { type: 'profile',
      eyebrow: cmVal('cmAb_prof_eyebrow'), title: cmVal('cmAb_prof_title'), em: cmVal('cmAb_prof_em'),
      body: cmVal('cmAb_prof_body'), tags: tags, caption: cmVal('cmAb_prof_caption') },
    { type: 'stats', items: cmRepRead('cmAbStats') },
    { type: 'timeline',
      eyebrow: cmVal('cmAb_tl_eyebrow'), title: cmVal('cmAb_tl_title'), em: cmVal('cmAb_tl_em'),
      items: cmRepRead('cmAbTl') },
    { type: 'crew',
      eyebrow: cmVal('cmAb_crew_eyebrow'), title: cmVal('cmAb_crew_title'), em: cmVal('cmAb_crew_em'),
      sub: cmVal('cmAb_crew_sub'), items: cmRepRead('cmAbCrew') },
    { type: 'tech',
      eyebrow: cmVal('cmAb_tech_eyebrow'), title: cmVal('cmAb_tech_title'), em: cmVal('cmAb_tech_em'),
      items: cmRepRead('cmAbTech') },
    { type: 'credentials',
      eyebrow: cmVal('cmAb_cert_eyebrow'), title: cmVal('cmAb_cert_title'), em: cmVal('cmAb_cert_em'),
      sub: cmVal('cmAb_cert_sub'), items: cmCertRead() },
    { type: 'cta',
      title: cmVal('cmAb_cta_title'), subtitle: cmVal('cmAb_cta_sub'),
      ctaText: cmVal('cmAb_cta_text'), ctaUrl: cmVal('cmAb_cta_url') }
  ];

  var payload = { title: cmVal('cmAb_hero_title') || '关于我们', blocks: blocks };
  var req = _cmAboutId
    ? API.content.put(CM_API + '/pages/' + _cmAboutId, payload)
    : API.content.post(CM_API + '/pages', Object.assign({ slug: 'about', status: 1, channel: 'web' }, payload));
  cmRun(req, '已保存。官网关于我们页最多 60 秒内自动更新。');
}
