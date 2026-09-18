// ===== 主应用 & 路由（ES5 兼容 — 动态权限版）=====
(function() {
  // 页面定义（角色从 API 动态加载）
  var pages = {
    dashboard: { title: '数据看板', render: renderDashboard },
    suppliers: { title: '线路管理', render: renderSuppliers },
    spatial: { title: '项目管理', render: renderSpatial },
    customers: { title: '客户管理', render: renderCustomers },
    contracts: { title: '合同管理', render: renderContracts },
    content: { title: '内容管理', render: renderContent, hasTabs: true },
    settings: { title: '系统设置', render: renderSettings, hasTabs: true }
  };

  // 顶栏面包屑的根节点（设计稿 .crumb：根 › 当前页）
  var CRUMB_ROOT = {
    dashboard: '数据看板',
    customers: '业务管理', contracts: '业务管理',
    suppliers: '资源管理', spatial: '资源管理',
    content: '网站管理', settings: '系统管理'
  };

  var currentUser = null;
  var currentPage = 'dashboard';
  var _permissions = {}; // { role: [page1, page2, ...] }

  /* ===== 侧栏分组（系统设置 / 内容管理 用同一套展开逻辑）=====
     之前只写死了一个系统设置分组，各处都硬编码 settingsMenu/settingsArrow。
     加第二个分组时把这些硬编码收成表，避免复制粘贴出两套半成品逻辑。 */
  var NAV_GROUPS = {
    settings: { menu: 'settingsMenu', arrow: 'settingsArrow' },
    content: { menu: 'contentMenu', arrow: 'contentArrow' }
  };

  // ===== 业务线（bizline-v1）=====
  // 方案1：下拉切换、整组替换。宽带菜单以初始 DOM 快照为准；
  // 新业务线尚无页面，先渲染「建设中」占位，后续按配置化渲染演进。
  var BIZ_LINES = [
    { code: 'broadband', name: '宽带与 IT 服务' },
    { code: 'newmedia', name: '新媒体运营', placeholder: true }
  ];
  var BIZ_KEY = 'bos_bizline';
  var currentBizLine = localStorage.getItem(BIZ_KEY) || 'broadband';
  var _broadbandNavHTML = null; // 宽带菜单快照（首次切走前捕获）
  var _platformNavHTML = null; // 平台级菜单快照（网站管理/系统管理，独立于业务线）

  function bizName(code) {
    for (var i = 0; i < BIZ_LINES.length; i++) { if (BIZ_LINES[i].code === code) return BIZ_LINES[i].name; }
    return code;
  }

  function renderBizPop() {
    var pop = document.getElementById('bizPop');
    if (!pop) return;
    var html = '';
    for (var i = 0; i < BIZ_LINES.length; i++) {
      var b = BIZ_LINES[i];
      var on = b.code === currentBizLine;
      html += '<div class="biz-opt' + (on ? ' on' : '' ) + '" data-biz="' + b.code + '">' +
              '<i class="sb-ls-dot"></i>' + b.name + (on ? '<span class="biz-ck">✓</span>' : '') + '</div>';
    }
    html += '<div class="biz-soon">更多业务线规划中</div>';
    pop.innerHTML = html;
    var opts = pop.querySelectorAll('.biz-opt');
    for (var k = 0; k < opts.length; k++) {
      (function(el) {
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          switchBizLine(el.getAttribute('data-biz'));
        });
      })(opts[k]);
    }
  }

  function toggleBizPop(force) {
    var pop = document.getElementById('bizPop');
    if (!pop) return;
    var show = (typeof force === 'boolean') ? force : !pop.classList.contains('show');
    if (show) renderBizPop();
    pop.classList.toggle('show', show);
  }

  function capturePlatformNav() {
    if (_platformNavHTML) return;
    var cg = document.getElementById('contentGroup');
    var sg = document.getElementById('settingsGroup');
    if (cg && sg) _platformNavHTML = cg.outerHTML + sg.outerHTML;
  }

  function captureBroadbandNav() {
    if (_broadbandNavHTML) return;
    var nav = document.querySelector('.nav-menu');
    // DOM 里还是带 data-page 的原始宽带菜单时才捕获（占位态没有可捕获内容）
    if (nav && nav.querySelector('.nav-item[data-page]')) _broadbandNavHTML = nav.innerHTML;
  }

  function bindNavEvents() {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) {
      (function(el) {
        if (el.__navBound) return;
        el.__navBound = true;
        el.addEventListener('click', function(e) {
          if (el.dataset.page) { e.preventDefault(); navigate(el.dataset.page, el.dataset.tab); }
        });
      })(items[i]);
    }
    var subs = document.querySelectorAll('.nav-subitem');
    for (var si = 0; si < subs.length; si++) {
      (function(el) {
        if (el.__navBound) return;
        el.__navBound = true;
        el.addEventListener('click', function(e) { e.preventDefault(); navigate(el.dataset.page, el.dataset.tab); });
      })(subs[si]);
    }
    var toggles = document.querySelectorAll('.nav-group-toggle');
    for (var gi = 0; gi < toggles.length; gi++) {
      (function(el) {
        if (el.__navBound) return;
        el.__navBound = true;
        el.addEventListener('click', function(e) {
          e.preventDefault();
          var name = el.getAttribute('data-group');
          if (!name) return;
          var open = toggleNavGroup(name);
          if (!open) return;
          var g = NAV_GROUPS[name];
          var menu = g && document.getElementById(g.menu);
          if (!menu) return;
          var subs2 = menu.querySelectorAll('.nav-subitem');
          for (var k = 0; k < subs2.length; k++) {
            if (subs2[k].style.display !== 'none' && hasPagePermission(subs2[k].dataset.page)) {
              navigate(subs2[k].dataset.page, subs2[k].dataset.tab);
              return;
            }
          }
        });
      })(toggles[gi]);
    }
  }

  function switchBizLine(code) {
    if (!code || code === currentBizLine) { toggleBizPop(false); return; }
    captureBroadbandNav();
    currentBizLine = code;
    localStorage.setItem(BIZ_KEY, code);
    applyBizLineUI(true);
    toggleBizPop(false);
  }

  /** 按当前业务线渲染侧栏菜单与内容区。isSwitch=切线时同时刷新内容区 */
  function applyBizLineUI(isSwitch) {
    var nav = document.querySelector('.nav-menu');
    if (!nav) return;
    var nameEl = document.getElementById('bizLineName');
    if (nameEl) nameEl.textContent = bizName(currentBizLine);
    if (currentBizLine === 'broadband') {
      if (_broadbandNavHTML) nav.innerHTML = _broadbandNavHTML;
      bindNavEvents();
      if (currentUser) applyPermissionUI();
      if (isSwitch) {
        // 落点与登录同策略：dashboard 无权限时自动落第一个有权限页，不弹「无权限」提示
        if (hasPagePermission('dashboard')) {
          navigate('dashboard');
        } else {
          var first = firstAllowedPage();
          if (first) { navigate(first); }
          else { showAlert('该账号暂未分配任何页面权限，请联系管理员配置'); }
        }
      }
    } else {
      captureBroadbandNav();
      var b = bizName(currentBizLine);
      capturePlatformNav();
      // 占位态 + 平台级菜单（网站管理/系统管理不随业务线切换收起）
      nav.innerHTML = '<div class="nav-coming"><b>' + b + '</b><span>业务线建设中\n菜单与页面规划中</span></div>' + (_platformNavHTML || '');
      bindNavEvents();
      if (currentUser) applyPermissionUI();
      if (isSwitch) {
        currentPage = '__' + currentBizLine;
        var items = document.querySelectorAll('.nav-item, .nav-subitem');
        for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
        $('pageTitle').textContent = b;
        updateCrumb('业务线', b);
        $('contentBody').innerHTML = '<div class="empty-state"><p>' + b + ' · 建设中</p><p>该业务线的功能页面规划中，敬请期待</p></div>';
      }
    }
  }

  // 业务线卡片点击 → 弹层；点击别处收起
  var bizSwitch = document.getElementById('bizLineSwitch');
  if (bizSwitch) {
    var pop = document.createElement('div');
    pop.id = 'bizPop';
    pop.className = 'biz-pop';
    bizSwitch.appendChild(pop);
    bizSwitch.addEventListener('click', function(e) { e.stopPropagation(); toggleBizPop(); });
  }
  document.addEventListener('click', function() { toggleBizPop(false); });

  function toggleNavGroup(name) {
    var g = NAV_GROUPS[name];
    if (!g) return false;
    var menu = document.getElementById(g.menu);
    var arrow = document.getElementById(g.arrow);
    if (!menu) return false;
    menu.classList.toggle('expand');
    var open = menu.classList.contains('expand');
    if (arrow) arrow.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
    return open;
  }

  function setNavGroup(name, open) {
    var g = NAV_GROUPS[name];
    if (!g) return;
    var menu = document.getElementById(g.menu);
    var arrow = document.getElementById(g.arrow);
    if (menu) menu.classList.toggle('expand', !!open);
    if (arrow) arrow.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
  }

  // ===== 动态权限 =====
  function hasPagePermission(page) {
    if (!currentUser || !currentUser.role || !_permissions[currentUser.role]) return false;
    // settings 需要特殊处理
    if (page === 'settings') {
      return _permissions[currentUser.role].indexOf('settings') >= 0;
    }
    var perms = _permissions[currentUser.role] || [];
    return perms.indexOf(page) >= 0;
  }

  function loadPermissions(callback) {
    API.get('/api/settings/role-permissions').then(function(data) {
      var result = {};
      for (var role in data) {
        if (data.hasOwnProperty(role) && data[role].pages) {
          result[role] = data[role].pages;
        }
      }
      _permissions = result;
      if (typeof callback === 'function') callback();
    }).catch(function() {
      // 默认权限保底（与 routes/settings.js 的 defaultPerms 保持一致，含 content）
      _permissions = {
        admin: ['dashboard','suppliers','spatial','customers','contracts','content','settings'],
        manager: ['dashboard','suppliers','spatial','customers','contracts','content','settings'],
        operator: ['dashboard','suppliers','spatial','customers','contracts','content'],
        viewer: ['dashboard','customers','contracts']
      };
      if (typeof callback === 'function') callback();
    });
  }

  // ===== 顶栏表格筛选 =====
  // 顶栏搜索框按设计稿落在全局位置，但各业务页表格结构不同，做一个通用实现：
  // 即时过滤当前页所有表格行（按整行文本匹配），换页自动清空。
  function applyTableFilter(kw) {
    var rows = document.querySelectorAll('#contentBody table tbody tr');
    var k = (kw || '').replace(/^\s+|\s+$/g, '').toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.__rawText) r.__rawText = (r.textContent || '').toLowerCase();
      r.style.display = (!k || r.__rawText.indexOf(k) >= 0) ? '' : 'none';
    }
  }

  // ===== 导航 =====
  function navigate(page, tab) {
    if (!hasPagePermission(page)) {
      showAlert('您没有访问该页面的权限');
      return;
    }

    currentPage = page;
    var items = document.querySelectorAll('.nav-item, .nav-subitem');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (el.dataset.page === page && (!el.dataset.tab || el.dataset.tab === (tab || ''))) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
    // 展开当前页所属分组，收起其他分组（settings / content 同一套）
    for (var gname in NAV_GROUPS) {
      if (NAV_GROUPS.hasOwnProperty(gname)) setNavGroup(gname, gname === page);
    }
    var titleObj = pages[page];
    var tabNames = {
      dept: '组织架构', general: '常规配置', wechat: '微信配置', biz: '业务配置',
      home: '首页布局', site: '站点配置', catalog: '服务与行业', cases: '案例'
    };
    var titleText;
    if (titleObj && tab && titleObj.hasTabs) {
      titleText = titleObj.title + ' - ' + (tabNames[tab] || '');
    } else {
      titleText = titleObj ? titleObj.title : '';
    }
    $('pageTitle').textContent = titleText;
    updateCrumb(CRUMB_ROOT[page] || '', titleText);

    // 换页时清掉顶栏筛选，否则新页表格会莫名其妙少几行
    var search = document.getElementById('globalSearch');
    if (search && search.value) { search.value = ''; }
    // 数据看板没有表格，「筛选当前页表格」没有意义 → 该页隐藏（客户管理等表格页保留）
    var tbSearch = document.querySelector('.tb-search');
    if (tbSearch) tbSearch.style.display = (page === 'dashboard') ? 'none' : '';

    var body = $('contentBody');
    body.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
    setTimeout(function() {
      try {
        if (page === 'settings' && tab) {
          window._settingsCurrentTab = tab;
        }
        // 内容管理页的 tab 与系统设置同理：先落到全局，页面渲染时读取
        if (page === 'content' && tab) {
          window._contentCurrentTab = tab;
        }
        if (pages[page]) pages[page].render();
        applyTableFilter('');
      } catch (e) {
        body.innerHTML = '<div class="empty-state"><p>加载失败: ' + e.message + '</p></div>';
        console.error(e);
      }
    }, 50);
  }

  /** 面包屑：根 === 当前页时收起根节点，避免「数据看板 › 数据看板」这种废话 */
  function updateCrumb(rootText, titleText) {
    var crumb = document.querySelector('.crumb');
    if (!crumb) return;
    var rootEl = crumb.querySelector('span');
    var sep = crumb.querySelector('svg');
    var show = !!rootText && rootText !== titleText;
    if (rootEl) { rootEl.textContent = rootText; rootEl.style.display = show ? '' : 'none'; }
    if (sep) sep.style.display = show ? '' : 'none';
  }

  /** 登录/会话恢复落点：按侧栏 DOM 顺序返回第一个有权限的页面，一个都没有则返回 null */
  function firstAllowedPage() {
    var items = document.querySelectorAll('.nav-item, .nav-subitem');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var pg = el.dataset.page;
      if (pg && pages[pg] && hasPagePermission(pg)) return pg;
    }
    return null;
  }

  // ===== 按权限隐藏导航项 =====
  function applyPermissionUI() {
    if (!currentUser) return;
    var navItems = document.querySelectorAll('.nav-item, .nav-subitem');
    for (var i = 0; i < navItems.length; i++) {
      var el = navItems[i];
      var pg = el.dataset.page;
      if (!pg || !pages[pg]) continue;
      el.style.display = hasPagePermission(pg) ? '' : 'none';
    }
    // 整个分组（含分组头）按权限整体显隐 —— 无权限时只藏子项会留下一个点不动的空壳
    for (var gname in NAV_GROUPS) {
      if (!NAV_GROUPS.hasOwnProperty(gname)) continue;
      var menu = document.getElementById(NAV_GROUPS[gname].menu);
      var group = menu && menu.parentNode;
      if (group) group.style.display = hasPagePermission(gname) ? '' : 'none';
    }
    applyGroupHeaderVisibility();
  }

  /** 静态分组标题（业务管理 / 资源管理）本身没有权限，靠「组内是否还有可见项」决定显隐 */
  function applyGroupHeaderVisibility() {
    var heads = document.querySelectorAll('.nav-group-h');
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i];
      var sib = h.nextElementSibling;
      var any = false;
      while (sib && !sib.classList.contains('nav-group-h')) {
        if (sib.classList.contains('nav-group')) { break; }
        if (sib.style.display !== 'none') { any = true; break; }
        sib = sib.nextElementSibling;
      }
      h.style.display = any ? '' : 'none';
    }
  }

  // ===== 用户信息更新 =====
  function updateUserUI(user) {
    currentUser = user;
    if (user) {
      var info = $('userInfo');
      info.style.display = 'flex';
      var initial = user.name.charAt(0);
      var roleMap = { admin: '管理员', manager: '经理', operator: '专员', viewer: '观察员' };
      var roleText = roleMap[user.role] || user.role;
      $('userAvatar').innerHTML = user.avatar ? '<img src="/assets/avatars/' + user.avatar + '.png" alt="">' : initial;
      $('userName').textContent = user.name;
      $('userRole').textContent = roleText;
      // 顶栏也有一份用户块（设计稿 .tb-user），两处同步
      var topUser = $('topUser');
      if (topUser) {
        topUser.style.display = 'flex';
        var ta = $('topAvatar');
        if (ta) ta.innerHTML = user.avatar ? '<img src="/assets/avatars/' + user.avatar + '.png" alt="">' : initial;
        $('topUserName').textContent = user.name;
      }
      $('loginOverlay').style.display = 'none';
      loadPermissions(function() {
        applyPermissionUI();
        if (currentBizLine !== 'broadband') { applyBizLineUI(true); }
        else {
          // 落点优化：当前页无权限时自动落到第一个有权限的菜单页，
          // 而不是一进后台就弹「您没有访问该页面的权限」
          if (!hasPagePermission(currentPage)) {
            var first = firstAllowedPage();
            if (first) { currentPage = first; }
            else { showAlert('该账号暂未分配任何页面权限，请联系管理员配置'); return; }
          }
          navigate(currentPage);
        }
      });
    } else {
      $('userInfo').style.display = 'none';
      var tu = $('topUser');
      if (tu) tu.style.display = 'none';
      $('loginOverlay').style.display = 'flex';
    }
  }

  // ===== 登录 =====
  window.doLogin = function() {
    var form = document.querySelector('#loginForm');
    var data = formToObject(form);
    var errorEl = $('loginError');
    errorEl.textContent = '';
    API.post('/api/staff/login', data).then(function(result) {
      if (result.success) {
        sessionStorage.setItem('bos_user', JSON.stringify(result.user));
        // 内容中台令牌：登录时后端签发，内容写接口自动带上（不用运营手贴密钥）
        if (result.token) contentToken(result.token);
        updateUserUI(result.user);
      }
    }).catch(function(e) {
      errorEl.textContent = '登录失败: ' + (e.message || '未知错误');
      console.error('[Login] Error:', e.message);
    });
  };

  // ===== 退出 =====
  window.logout = function() {
    showConfirm('确认退出登录？', function(confirmed) {
      if (!confirmed) return;
      sessionStorage.removeItem('bos_user');
      contentToken(''); // 一并清掉内容中台令牌
      currentUser = null;
      $('userInfo').style.display = 'none';
      var tu = $('topUser');
      if (tu) tu.style.display = 'none';
      $('loginOverlay').style.display = 'flex';
      var allNav = document.querySelectorAll('.nav-item, .nav-subitem');
      for (var i = 0; i < allNav.length; i++) {
        allNav[i].style.display = '';
      }
      // 分组也恢复默认（下次登录时再按权限隐藏）
      for (var g in NAV_GROUPS) {
        if (NAV_GROUPS.hasOwnProperty(g)) setNavGroup(g, false);
      }
      applyGroupHeaderVisibility();
      if (currentBizLine !== 'broadband') {
        currentBizLine = 'broadband';
        localStorage.setItem(BIZ_KEY, 'broadband');
        applyBizLineUI(false); // 只还原菜单，不触发 navigate（此刻未登录）
      }
    });
  };

  // ===== 导航绑定（bizline-v1：收进 bindNavEvents，切线重建 DOM 后可重绑；分组头仍由原循环绑定）=====
  bindNavEvents();

  /* 分组头绑定已并入 bindNavEvents()（bizline-v1）：切线重建 DOM 后可重绑，
     且 __navBound 防双绑 —— 旧的原地循环会与它叠加成双击开关，已移除。 */

  // 兼容旧调用方（settings.js 等可能仍引用）
  window.toggleSettingsMenu = function() { toggleNavGroup('settings'); };

  // ===== 顶栏筛选绑定 =====
  var globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', function() { applyTableFilter(globalSearch.value); });
    globalSearch.addEventListener('keydown', function(e) { if (e.key === 'Escape') { globalSearch.value = ''; applyTableFilter(''); } });
  }

  // ===== 回车登录 =====
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && $('loginOverlay').style.display !== 'none') { doLogin(); }
  });

  // ===== 启动 =====
  window.toggleSidebar = function() {
    var app = document.getElementById('app');
    app.classList.toggle('sidebar-collapsed');
    // 折叠侧边栏时收起所有分组菜单
    if (app.classList.contains('sidebar-collapsed')) {
      for (var g in NAV_GROUPS) {
        if (NAV_GROUPS.hasOwnProperty(g)) setNavGroup(g, false);
      }
    }
  };
  window.navigate = navigate;
  window.applyTableFilter = applyTableFilter;
  window.currentPage = function() { return currentPage; };
  window.getPermissions = function() { return _permissions; };

  var savedUser = sessionStorage.getItem('bos_user');
  if (savedUser) {
    try {
      var u = JSON.parse(savedUser);
      updateUserUI(u);
    } catch(e) {
      updateUserUI(null);
    }
  } else {
    updateUserUI(null);
  }
  applyBrandingSettings();
  applyBizLineUI(false);
})();
