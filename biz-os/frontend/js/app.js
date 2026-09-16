// ===== 主应用 & 路由（ES5 兼容 — 动态权限版）=====
(function() {
  // 页面定义（角色从 API 动态加载）
  var pages = {
    dashboard: { title: '数据看板', render: renderDashboard },
    suppliers: { title: '资源管理', render: renderSuppliers },
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
    suppliers: '资源台账', spatial: '资源台账',
    content: '增长与内容', settings: '系统'
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

  /** 静态分组标题（业务管理 / 资源台账）本身没有权限，靠「组内是否还有可见项」决定显隐 */
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
      $('userAvatar').textContent = initial;
      $('userName').textContent = user.name;
      $('userRole').textContent = roleText;
      // 顶栏也有一份用户块（设计稿 .tb-user），两处同步
      var topUser = $('topUser');
      if (topUser) {
        topUser.style.display = 'flex';
        $('topAvatar').textContent = initial;
        $('topUserName').textContent = user.name;
      }
      $('loginOverlay').style.display = 'none';
      loadPermissions(function() {
        applyPermissionUI();
        navigate(currentPage);
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
    });
  };

  // ===== 导航绑定 =====
  var navItems = document.querySelectorAll('.nav-item');
  for (var ni = 0; ni < navItems.length; ni++) {
    (function(el) {
      el.addEventListener('click', function(e) {
        if (el.dataset.page) { e.preventDefault(); navigate(el.dataset.page, el.dataset.tab); }
      });
    })(navItems[ni]);
  }
  var subItems = document.querySelectorAll('.nav-subitem');
  for (var si = 0; si < subItems.length; si++) {
    (function(el) {
      el.addEventListener('click', function(e) { e.preventDefault(); navigate(el.dataset.page, el.dataset.tab); });
    })(subItems[si]);
  }

  /* 分组头：之前只绑了第一个 .nav-group-toggle，还写死了 settingsMenu ——
     第二个分组（内容管理）点了没反应。改成按 data-group 逐个绑。 */
  var groupToggles = document.querySelectorAll('.nav-group-toggle');
  for (var gi = 0; gi < groupToggles.length; gi++) {
    (function(el) {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        var name = el.getAttribute('data-group');
        if (!name) return;
        var open = toggleNavGroup(name);
        if (!open) return;
        // 展开时自动跳到该分组下第一个有权限的子项
        var g = NAV_GROUPS[name];
        var menu = g && document.getElementById(g.menu);
        if (!menu) return;
        var subs = menu.querySelectorAll('.nav-subitem');
        for (var k = 0; k < subs.length; k++) {
          if (subs[k].style.display !== 'none' && hasPagePermission(subs[k].dataset.page)) {
            navigate(subs[k].dataset.page, subs[k].dataset.tab);
            return;
          }
        }
      });
    })(groupToggles[gi]);
  }

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
})();
