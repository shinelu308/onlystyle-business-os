// ===== 系统设置页（ES5 兼容 — 组织架构整合版）=====
var _settingsCurrentTab = 'dept';

function renderSettings() {
  var body = $('contentBody');
  var tab = window._settingsCurrentTab || _settingsCurrentTab || 'dept';
  _settingsCurrentTab = tab;
  window._settingsCurrentTab = '';

  body.innerHTML =
    '<div class="settings-page">' +
      '<div class="settings-tabs" id="settingsTabs">' +
        _tabBtn('dept', tab, '组织架构') +
        _tabBtn('general', tab, '常规配置') +
        _tabBtn('wechat', tab, '微信配置') +
        _tabBtn('biz', tab, '业务配置') +
      '</div>' +
      '<div class="settings-content" id="settingsContent"><div class="loading"><div class="spinner"></div><p>加载中...</p></div></div>';

  var tabsEl = $('settingsTabs');
  if (tabsEl) {
    tabsEl.onclick = function(e) {
      var btn = e.target;
      while (btn && btn !== this) {
        if (btn.classList && btn.classList.contains('settings-tab')) {
          switchSettingsTab(btn.dataset.tab);
          return;
        }
        btn = btn.parentNode;
      }
    };
  }
  _renderSettingsTab(tab);
}

function _tabBtn(name, activeTab, label) {
  var a = name === activeTab ? ' active' : '';
  return '<button class="settings-tab' + a + '" data-tab="' + name + '">' + label + '</button>';
}

function switchSettingsTab(tab) {
  _renderSettingsTab(tab);
}

function _renderSettingsTab(tab) {
  _settingsCurrentTab = tab;
  var container = $('settingsContent');
  if (!container) return;

  var tabs = document.querySelectorAll('.settings-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.tab === tab);
  }
  var titles = { dept: '组织架构', general: '常规配置', wechat: '微信配置', biz: '业务配置' };
  $('pageTitle').textContent = '系统设置 - ' + (titles[tab] || '');
  var subs = document.querySelectorAll('.nav-subitem');
  for (var j = 0; j < subs.length; j++) {
    subs[j].classList.toggle('active', subs[j].dataset.tab === tab);
  }
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  var renderers = {
    dept: renderDeptTab,
    general: renderGeneralTab,
    wechat: renderWechatTab,
    biz: renderBizTab
  };
  if (renderers[tab]) {
    setTimeout(function() { renderers[tab](container); }, 30);
  }
}

// ================================================================
// ===== 组织架构 Tab（包含 部门 + 人员 + 角色权限 三大板块）=====
// ================================================================

// 页面定义列表（给权限矩阵用）
var PAGE_LABELS = {
  dashboard: '数据看板', suppliers: '资源管理', spatial: '项目管理',
  customers: '客户管理', contracts: '合同管理', content: '内容管理', settings: '系统设置'
};

function renderDeptTab(container) {
  var p1 = API.get('/api/departments/tree');
  var p2 = API.get('/api/departments');
  var p3 = API.get('/api/staff');
  var p4 = API.get('/api/settings/role-permissions');
  var tree = null, flat = null, staff = null, rolePerms = null;
  var loaded = 0;

  function checkDone() {
    loaded++;
    if (loaded < 4) return;
    var html = '';
    // ===== 板块一：部门架构 =====
    html += '<div class="card" style="margin-bottom:20px">' +
      '<div class="card-header"><h3>\uD83C\uDFDB\uFE0F 部门架构</h3><button class="btn btn-ghost btn-sm" onclick="showDeptSettingsForm()">+ 新增部门</button></div>' +
      '<div class="card-body" style="padding:0">' +
        '<div style="padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-secondary)">共 ' + flat.length + ' 个部门</div>' +
        renderDeptTreeSettings(tree, 0) +
      '</div></div>';

    // ===== 板块二：人员列表 =====
    var staffRows = '';
    for (var si = 0; si < staff.length; si++) {
      var s = staff[si];
      // 从 rolePerms 动态获取角色名称，找不到时用角色 key 显示
      var roleName = (rolePerms[s.role] && rolePerms[s.role].name) || s.role;
      var roleCls = { admin:'danger', manager:'warning', operator:'info', viewer:'secondary' }[s.role] || 'info';
      var statusLabel = s.status === 'active' ? '<span class="badge success">启用</span>' : '<span class="badge secondary">禁用</span>';
      staffRows += '<tr><td><strong>' + s.staff_id + '</strong></td><td>' + escapeHtml(s.name) + '</td><td><code>' + escapeHtml(s.username) + '</code></td><td>' + escapeHtml(s.dept_name || '-') + '</td><td>' + escapeHtml(s.position || '-') + '</td><td><span class="badge ' + roleCls + '">' + escapeHtml(roleName) + '</span></td><td>' + statusLabel + '</td><td><div class="btn-group"><button class="btn btn-sm btn-ghost" onclick="showStaffSettingsForm(\'' + s.staff_id + '\')">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteStaffSetting(\'' + s.staff_id + '\')">删除</button></div></td></tr>';
    }
    html += '<div class="card" style="margin-bottom:20px">' +
      '<div class="card-header"><h3>\uD83D\uDC65 人员列表</h3><button class="btn btn-ghost btn-sm" onclick="showStaffSettingsForm()">+ 新增人员</button></div>' +
      '<div class="card-body" style="padding:0"><div class="table-wrapper"><table><thead><tr><th>编号</th><th>姓名</th><th>账号</th><th>部门</th><th>职位</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>' + staffRows + '</tbody></table></div></div></div>';

    // ===== 板块三：角色与权限（可编辑）=====
    html += renderRolePermEditor(rolePerms);

    container.innerHTML = html;
  }

  p1.then(function(d) { tree = d; checkDone(); });
  p2.then(function(d) { flat = d; checkDone(); });
  p3.then(function(d) { staff = d; checkDone(); });
  p4.then(function(d) { rolePerms = d; checkDone(); });
}

// ===== 部门树渲染 =====
function renderDeptTreeSettings(nodes, level) {
  var html = '';
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var hasChildren = n.children && n.children.length > 0;
    html += '<div class="dept-tab-item" style="padding-left:' + (level * 24 + 16) + 'px">' +
      '<div class="dept-tab-row">' +
        '<span class="dept-tab-icon">' + (n.parent_id ? '\uD83D\uDCC2' : '\uD83C\uDFE2') + '</span>' +
        '<span class="dept-tab-name">' + escapeHtml(n.dept_name) + '</span>' +
        '<span class="badge info" style="margin-left:8px">' + n.staff_count + '人</span>' +
        '<span class="dept-tab-meta">' + (n.dept_head || '') + '</span>' +
        '<div class="btn-group" style="margin-left:auto">' +
          '<button class="btn btn-sm btn-ghost" onclick="showDeptSettingsForm(\'' + n.dept_id + '\')">编辑</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteDeptSetting(\'' + n.dept_id + '\')">删除</button></div></div></div>';
    if (hasChildren) html += renderDeptTreeSettings(n.children, level + 1);
  }
  return html;
}

// ===== 角色权限编辑器 =====
function renderRolePermEditor(rolePerms) {
  var pageKeys = Object.keys(PAGE_LABELS);
  var roleKeys = Object.keys(rolePerms);

  // 可用颜色列表（新角色轮换使用）
  var colors = ['danger','warning','info','secondary','success','primary'];

  // 角色卡片概览（含删除按钮）
  var cardsHtml = '';
  var iconMap = { admin:'&#x1F451;', manager:'&#x1F468;&#x200D;&#x1F4BC;', operator:'&#x1F4DD;', viewer:'&#x1F441;&#xFE0F;' };
  for (var ri = 0; ri < roleKeys.length; ri++) {
    var rk = roleKeys[ri];
    var r = rolePerms[rk];
    var ci = ri % colors.length;
    var colorName = colors[ci];
    // 新角色没有预定义图标时，使用默认图标
    var defaultIcons = ['&#x1F451;','&#x1F468;&#x200D;&#x1F4BC;','&#x1F4DD;','&#x1F441;&#xFE0F;','&#x1F464;','&#x1F465;'];
    var icon = iconMap[rk] || defaultIcons[ci] || '&#x1F464;';
    var badges = '';
    for (var pi = 0; pi < r.pages.length; pi++) {
      var label = PAGE_LABELS[r.pages[pi]] || r.pages[pi];
      badges += '<span class="badge ' + colorName + '" style="margin:2px;font-size:11px">' + label + '</span>';
    }
    cardsHtml +=
      '<div class="settings-card settings-card-compact" style="display:block;margin-bottom:10px;position:relative">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">' +
          '<div style="background:var(--' + colorName + '-bg);width:36px;height:36px;border-radius:8px;font-size:16px;text-align:center;line-height:36px;flex-shrink:0">' + icon + '</div>' +
          '<div style="flex:1"><strong style="font-size:14px">' + r.name + '</strong></div>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteRole(\'' + rk + '\')" style="font-size:11px;padding:3px 8px" title="删除此角色">\u2716 删除</button>' +
        '</div>' +
        '<div>' + badges + '</div>' +
      '</div>';
  }

  // 可编辑权限矩阵
  var matrixHtml = '<div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th style="min-width:70px">角色</th>';
  for (var pi = 0; pi < pageKeys.length; pi++) {
    matrixHtml += '<th style="text-align:center;font-size:10px;padding:10px 4px;cursor:pointer" onclick="toggleAllRoleForPage(\'' + pageKeys[pi] + '\')" title="点击切换此模块全选/全不选">' + (PAGE_LABELS[pageKeys[pi]] || pageKeys[pi]) + '</th>';
  }
  matrixHtml += '</tr></thead><tbody>';
  for (var ri = 0; ri < roleKeys.length; ri++) {
    var rk = roleKeys[ri];
    var r = rolePerms[rk];
    matrixHtml += '<tr><td style="font-weight:600;font-size:13px">' + r.name + '</td>';
    for (var pi = 0; pi < pageKeys.length; pi++) {
      var hasAccess = r.pages.indexOf(pageKeys[pi]) >= 0;
      matrixHtml += '<td style="text-align:center;cursor:pointer" onclick="toggleRolePage(\'' + rk + '\',\'' + pageKeys[pi] + '\')" title="点击切换">' +
        '<span id="perm-' + rk + '-' + pageKeys[pi] + '" style="font-size:16px;font-weight:700;transition:all .15s;' +
          (hasAccess ? 'color:var(--success)' : 'color:var(--border)') + '">' +
          (hasAccess ? '&#10003;' : '&#8212;') +
        '</span></td>';
    }
    matrixHtml += '</tr>';
  }
  matrixHtml += '</tbody></table></div>';

  var html =
    '<div class="card" id="rolePermCard">' +
      '<div class="card-header"><h3>\uD83D\uDD11 角色与权限</h3>' +
        '<div class="btn-group">' +
          '<button class="btn btn-sm btn-success" onclick="addNewRole()">+ 添加角色</button>' +
          '<button class="btn btn-primary btn-sm" onclick="saveRolePermissions()">保存权限</button>' +
        '</div></div>' +
      '<div class="card-body">' +
        '<div style="margin-bottom:16px"><p class="settings-desc" style="margin-bottom:0">点击矩阵中的 &#10003; 或 &#8212; 切换权限，点击表头批量操作。角色可添加/删除。</p></div>' +
        cardsHtml +
        matrixHtml +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">' +
          '<button class="btn btn-success" onclick="addNewRole()" style="padding:8px 20px">+ 添加角色</button>' +
          '<button class="btn btn-ghost" onclick="saveRolePermissions()" style="padding:8px 32px">保存权限配置</button>' +
        '</div>' +
      '</div></div>';

  // 存储当前权限数据到全局供编辑使用
  window._editingPerms = rolePerms;
  return html;
}

// ===== 角色编辑交互函数 =====

// 添加新角色
window.addNewRole = function() {
  var perms = window._editingPerms;
  if (!perms) return;

  // 弹出对话框让用户输入角色名称
  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '输入角色名称，如 "财务"';
  input.style.cssText = 'width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:15px;font-family:inherit;margin-bottom:16px';
  openModal('添加新角色',
    '<div style="margin-bottom:8px;font-size:14px;color:var(--text-secondary)">请输入新角色的名称：</div>' +
    '<div id="newRoleInputWrapper"></div>' +
    '<div class="form-actions"><button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="confirmAddRole()">确认添加</button></div>');
  var wrapper = document.getElementById('newRoleInputWrapper');
  if (wrapper) {
    wrapper.appendChild(input);
    input.focus();
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') confirmAddRole(); });
  }
  // 存储引用
  window._newRoleInput = input;
};

window.confirmAddRole = function() {
  var input = window._newRoleInput;
  if (!input) { closeModal(); return; }
  var name = input.value.trim();
  if (!name) { showAlert('请输入角色名称'); return; }

  var perms = window._editingPerms;
  if (!perms) { showAlert('权限数据未加载，请刷新页面重试'); closeModal(); return; }

  // 检查名称是否重复
  for (var key in perms) {
    if (perms.hasOwnProperty(key) && perms[key].name === name) {
      showAlert('角色名称 "' + name + '" 已存在，请使用其他名称');
      return;
    }
  }

  // 生成唯一 key
  var baseKey = name.replace(/\s+/g, '_').toLowerCase();
  var newKey = baseKey;
  var counter = 1;
  while (perms[newKey] !== undefined) {
    newKey = baseKey + '_' + counter;
    counter++;
  }

  // 所有页面 key 列表（内联以保证可靠性）
  var allPages = ['dashboard','suppliers','spatial','customers','contracts','settings'];
  perms[newKey] = { name: name, pages: allPages.slice() };

  closeModal();
  // 刷新角色权限卡片
  var card = document.getElementById('rolePermCard');
  if (card && card.parentNode) {
    var temp = document.createElement('div');
    temp.innerHTML = renderRolePermEditor(perms);
    var newCard = temp.firstChild;
    if (newCard) card.parentNode.replaceChild(newCard, card);
  }
  window._newRoleInput = null;
};

// 删除角色
window.deleteRole = function(roleKey) {
  var perms = window._editingPerms;
  if (!perms || !perms[roleKey]) return;
  var roleName = perms[roleKey].name;

  // 不允许删除 admin 角色
  if (roleKey === 'admin') {
    showAlert('管理员角色不可删除');
    return;
  }

  showConfirm('确认删除角色 "' + roleName + '"？所有拥有此角色的人员将受到影响。', function(confirmed) {
    if (!confirmed) return;
    delete perms[roleKey];
    // 刷新角色权限卡片
    var container = document.getElementById('rolePermCard');
    if (container) {
      var temp = document.createElement('div');
      temp.innerHTML = renderRolePermEditor(perms);
      var newCard = temp.firstChild;
      if (newCard) {
        container.parentNode.replaceChild(newCard, container);
      }
    }
  });
};

window.toggleRolePage = function(roleKey, pageKey) {
  var perms = window._editingPerms;
  if (!perms || !perms[roleKey]) return;
  var pages = perms[roleKey].pages;
  var idx = pages.indexOf(pageKey);
  if (idx >= 0) {
    pages.splice(idx, 1);
  } else {
    pages.push(pageKey);
  }
  var el = document.getElementById('perm-' + roleKey + '-' + pageKey);
  if (el) {
    var hasAccess = pages.indexOf(pageKey) >= 0;
    el.innerHTML = hasAccess ? '&#10003;' : '&#8212;';
    el.style.color = hasAccess ? 'var(--success)' : 'var(--border)';
  }
};

window.toggleAllRoleForPage = function(pageKey) {
  var perms = window._editingPerms;
  if (!perms) return;
  var roleKeys = Object.keys(perms);
  // 判断当前列是否全部选中
  var allSelected = true;
  for (var ri = 0; ri < roleKeys.length; ri++) {
    if (perms[roleKeys[ri]].pages.indexOf(pageKey) < 0) { allSelected = false; break; }
  }
  // 切换
  for (var ri = 0; ri < roleKeys.length; ri++) {
    var pages = perms[roleKeys[ri]].pages;
    var idx = pages.indexOf(pageKey);
    if (allSelected) {
      if (idx >= 0) pages.splice(idx, 1);
    } else {
      if (idx < 0) pages.push(pageKey);
    }
    var el = document.getElementById('perm-' + roleKeys[ri] + '-' + pageKey);
    if (el) {
      var hasAccess = pages.indexOf(pageKey) >= 0;
      el.innerHTML = hasAccess ? '&#10003;' : '&#8212;';
      el.style.color = hasAccess ? 'var(--success)' : 'var(--border)';
    }
  }
};

window.saveRolePermissions = function() {
  var perms = window._editingPerms;
  if (!perms) { showAlert('没有可保存的权限数据'); return; }
  showConfirm('确认保存权限配置？保存后所有用户需重新登录才能生效。', function(confirmed) {
    if (!confirmed) return;
    API.put('/api/settings/role-permissions', { permissions: perms }).then(function() {
      showAlert('✅ 权限配置保存成功');
    }).catch(function(e) {
      showAlert('❌ 保存失败: ' + e.message);
    });
  });
};

// ===== 部门表单（复用）=====
window.showDeptSettingsForm = function(id) {
  var data = { dept_id: '', dept_name: '', parent_id: '', dept_head: '', description: '', sort_order: '' };
  var isEdit = false;
  function openForm(parents) {
    var parentOpts = '<option value="">（顶级部门）</option>';
    for (var p = 0; p < parents.length; p++) {
      if (parents[p].dept_id !== id) {
        parentOpts += '<option value="' + parents[p].dept_id + '"' + (data.parent_id === parents[p].dept_id ? ' selected' : '') + '>' + escapeHtml(parents[p].dept_name) + '</option>';
      }
    }
    openModal(isEdit ? '编辑部门' : '新增部门',
      '<form id="deptForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">部门编号</label><input name="dept_id" value="' + data.dept_id + '"' + (isEdit ? ' readonly style="background:#f1f5f9"' : ' required placeholder="如 DEPT-010"') + '></div>' +
        '<div class="form-group"><label class="required">部门名称</label><input name="dept_name" required value="' + escapeHtml(data.dept_name) + '" placeholder="如 人事部"></div>' +
        '<div class="form-group"><label>上级部门</label><select name="parent_id">' + parentOpts + '</select></div>' +
        '<div class="form-group"><label>排序号</label><input name="sort_order" type="number" value="' + (data.sort_order || '') + '" placeholder="数字越小越靠前"></div>' +
        '<div class="form-group"><label>部门负责人</label><input name="dept_head" value="' + escapeHtml(data.dept_head) + '" placeholder="负责人姓名"></div>' +
        '<div class="form-group full"><label>部门描述</label><input name="description" value="' + escapeHtml(data.description) + '" placeholder="部门职责简述"></div>' +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-primary" type="button" onclick="submitDeptSetting(' + isEdit + ')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');
  }
  var parents = null;
  API.get('/api/departments').then(function(d) { parents = d; if (id) { API.get('/api/departments/' + id).then(function(r) { data = r; isEdit = true; openForm(parents); }); } else { openForm(parents); } });
};

window.submitDeptSetting = function(isEdit) {
  var form = document.querySelector('#deptForm');
  var data = formToObject(form);
  var req = (isEdit === true || isEdit === 'true') ? API.put('/api/departments/' + data.dept_id, data) : API.post('/api/departments', data);
  req.then(function() { closeModal(); _renderSettingsTab('dept'); });
};

window.deleteDeptSetting = function(id) {
  showConfirm('确认删除该部门？', function(confirmed) {
    if (!confirmed) return;
    API.del('/api/departments/' + id).then(function() { _renderSettingsTab('dept'); });
  });
};

// ===== 人员表单（复用）=====
window.showStaffSettingsForm = function(id) {
  var data = { staff_id: '', name: '', username: '', password: '', phone: '', email: '', dept_id: '', position: '', role: 'operator', status: 'active' };
  var isEdit = false;
  function openForm(depts, roles) {
    var deptOpts = '<option value="">（未分配）</option>';
    for (var d = 0; d < depts.length; d++) {
      deptOpts += '<option value="' + depts[d].dept_id + '"' + (data.dept_id === depts[d].dept_id ? ' selected' : '') + '>' + escapeHtml(depts[d].dept_name) + '</option>';
    }
    var roleOpts = '';
    for (var rk in roles) {
      if (roles.hasOwnProperty(rk)) {
        var sel = data.role === rk ? ' selected' : '';
        roleOpts += '<option value="' + rk + '"' + sel + '>' + escapeHtml(roles[rk].name) + '</option>';
      }
    }
    var pwField = isEdit ? '<div class="form-group full"><label>新密码（留空不修改）</label><input name="password" type="password" placeholder="留空则不修改密码"></div>' : '<div class="form-group full"><label>密码</label><input name="password" type="password" required placeholder="输入登录密码"></div>';
    openModal(isEdit ? '编辑人员' : '新增人员',
      '<form id="staffForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">人员编号</label><input name="staff_id" value="' + data.staff_id + '"' + (isEdit ? ' readonly style="background:#f1f5f9"' : ' required placeholder="如 STAFF-011"') + '></div>' +
        '<div class="form-group"><label class="required">姓名</label><input name="name" required value="' + escapeHtml(data.name) + '" placeholder="真实姓名"></div>' +
        '<div class="form-group"><label class="required">登录账号</label><input name="username" required value="' + escapeHtml(data.username) + '"' + (isEdit ? ' readonly style="background:#f1f5f9"' : '') + '></div>' + pwField +
        '<div class="form-group"><label>手机号</label><input name="phone" value="' + escapeHtml(data.phone) + '" placeholder="手机号"></div>' +
        '<div class="form-group"><label>所属部门</label><select name="dept_id">' + deptOpts + '</select></div>' +
        '<div class="form-group"><label>职位</label><input name="position" value="' + escapeHtml(data.position) + '" placeholder="如 销售专员"></div>' +
        '<div class="form-group"><label>角色</label><select name="role">' + roleOpts + '</select></div>' +
        '<div class="form-group full"><label>微信 OpenID（用于接收管理通知）</label><input name="wechat_openid" value="' + escapeHtml(data.wechat_openid || '') + '" placeholder="绑定微信后自动获取OpenID"></div>' +
        '<div class="form-group"><label>状态</label><select name="status"><option value="active"' + (data.status !== 'disabled' ? ' selected' : '') + '>启用</option><option value="disabled"' + (data.status === 'disabled' ? ' selected' : '') + '>禁用</option></select></div>' +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-primary" type="button" onclick="submitStaffSetting(' + isEdit + ')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');
  }
  var p1 = API.get('/api/departments');
  var p2 = API.get('/api/settings/role-permissions');
  var depts = null, roles = null;
  p1.then(function(d) { depts = d; if (depts && roles) { if (id) { API.get('/api/staff/' + id).then(function(r) { data = r; isEdit = true; openForm(depts, roles); }); } else { openForm(depts, roles); } } });
  p2.then(function(d) { roles = d; if (depts && roles) { if (id) { API.get('/api/staff/' + id).then(function(r) { data = r; isEdit = true; openForm(depts, roles); }); } else { openForm(depts, roles); } } });
};

window.submitStaffSetting = function(isEdit) {
  var form = document.querySelector('#staffForm');
  var data = formToObject(form);
  var req = (isEdit === true || isEdit === 'true') ? API.put('/api/staff/' + data.staff_id, data) : API.post('/api/staff', data);
  req.then(function() { closeModal(); _renderSettingsTab('dept'); }).catch(function(e) {
    showAlert('操作失败: ' + (e.message || '未知错误'));
  });
};

window.deleteStaffSetting = function(id) {
  showConfirm('确认删除该人员？', function(confirmed) {
    if (!confirmed) return;
    API.del('/api/staff/' + id).then(function() { _renderSettingsTab('dept'); });
  });
};

// ========================================
// ===== 常规配置 Tab =====
function renderGeneralTab(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  API.get('/api/settings/group/general').then(function(data) {
    function getVal(key) { for (var i = 0; i < data.length; i++) { if (data[i].setting_key === key) return data[i].setting_value; } return ''; }
    var logoVal = getVal('logo_url');
    // 没有透明通道的格式，放到深色底（官网导航/页脚、后台侧栏）就是一块白方块。
    // 这里直接给运营指出来，省得又变成「改了没看到」。
    var logoOpaque = /\.(jpe?g|gif)$/i.test(logoVal);
    var logoExt = (logoVal.match(/\.(\w+)$/) || [])[1] || '';
    function logoTile(cap, cls) {
      return '<div class="logo-preview-tile">' +
        '<span class="logo-preview-cap">' + cap + '</span>' +
        '<div class="logo-preview-stage ' + cls + '" data-logo-stage>' +
          (logoVal ? '<img src="' + escapeHtml(logoVal) + '?t=' + Date.now() + '" alt="">' : '<span>无</span>') +
        '</div></div>';
    }
    var logoCard =
      '<div class="settings-card settings-card-compact">' +
        '<div class="settings-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>' +
        '<div class="settings-card-body">' +
          '<div class="logo-section-header">' +
            '<div><h4>品牌标识</h4><p class="settings-desc">这一张图同时用在 <b>官网顶部导航 / 官网页脚 / 后台侧边栏 / 登录页</b> 四处 —— 改一次，四处同步。</p></div>' +
            '<div class="logo-preview-pair">' +
              logoTile('深色底', 'dark') +
              logoTile('浅色底', 'light') +
            '</div>' +
          '</div>' +
          (logoOpaque
            ? '<div class="logo-warn">⚠️ 当前是 <b>.' + escapeHtml(logoExt) + '</b> —— 这种格式<b>没有透明通道</b>，放到深色底上会变成一块白方块（官网导航、页脚、后台侧栏都是深色）。请换成<b>透明底 PNG</b>。</div>'
            : '') +
          '<div class="logo-upload-compact" id="logoUploadZone">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<span>点击或拖拽上传 Logo</span>' +
            '<small>建议透明底 PNG · 512×512 以上 · 超 2MB 自动压缩</small>' +
          '</div>' +
          '<input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/gif" style="display:none">' +
          '<div id="logoUploadProgress" class="logo-upload-status"></div>' +
          '<input type="hidden" name="logo_url" id="logoUrlInput" value="' + escapeHtml(logoVal) + '">' +
        '</div>' +
      '</div>';
    var brandCard =
      '<div class="settings-card">' +
        '<div class="settings-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>' +
        '<div class="settings-card-body">' +
          '<h4>品牌信息</h4>' +
          '<p class="settings-desc">系统名称、公司名称等基本信息</p>' +
          '<div class="settings-form-grid">' +
            _makeField('site_name', '系统名称', 'text', '浏览器标题显示的系统名称', getVal('site_name')) +
            _makeField('site_abbreviation', '系统缩写', 'text', '侧边栏顶部缩写（如 BOS）', getVal('site_abbreviation')) +
            _makeField('company_name', '公司名称', 'text', '企业全称', getVal('company_name')) +
            _makeField('logo_subtitle', 'Logo 副标题', 'text', '侧边栏 Logo 下方说明文字', getVal('logo_subtitle')) +
          '</div>' +
        '</div>' +
      '</div>';
    var remindCard =
      '<div class="settings-card">' +
        '<div class="settings-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg></div>' +
        '<div class="settings-card-body">' +
          '<h4>提醒配置</h4>' +
          '<p class="settings-desc">合同到期自动提醒相关设置（时间段以天为单位，多个用逗号分隔）</p>' +
          '<div class="settings-form-grid">' +
            _makeField('reminder_days_before', '提前提醒天数', 'number', '合同到期前多少天开始提醒', getVal('reminder_days_before')) +
            _makeField('reminder_advance_days', '管理通知时间段', 'text', 'JSON数组，如 [60,30,15,7,3,1]，到达设定天数时触发', getVal('reminder_advance_days')) +
            _makeField('auto_renew_enabled', '自动续约提醒', 'select', 'true=开启 false=关闭', getVal('auto_renew_enabled')) +
            _makeField('cron_schedule', '定时任务 Cron', 'text', '每日提醒引擎运行时间', getVal('cron_schedule')) +
          '</div>' +
        '</div>' +
      '</div>';
    container.innerHTML =
      '<form id="generalSettingsForm" onsubmit="return false">' +
        logoCard + brandCard + remindCard +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">' +
          '<button class="btn btn-primary" type="button" onclick="saveGeneralSettings()" style="padding:10px 32px;font-size:14px">保存配置</button>' +
        '</div>' +
      '</form>';
    setTimeout(function() {
      var zone = document.getElementById('logoUploadZone');
      var fileInput = document.getElementById('logoFileInput');
      if (!zone || !fileInput) return;
      zone.onclick = function() { fileInput.click(); };
      fileInput.onchange = function() {
        var file = fileInput.files[0];
        if (!file) return;
        var maxSize = 2 * 1024 * 1024;
        var progress = document.getElementById('logoUploadProgress');
        progress.className = 'logo-upload-status uploading';
        progress.textContent = '处理中...';
        var reader = new FileReader();
        reader.onload = function(e) {
          var base64 = e.target.result;
          if (file.size > maxSize) {
            var img = new Image();
            img.onload = function() {
              var canvas = document.createElement('canvas');
              var MAX_W = 512;
              var w = img.width, h = img.height;
              if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
              canvas.width = w; canvas.height = h;
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              // 🔴 压缩必须按原格式走：JPEG 没有透明通道，
              //    把一张透明 PNG 压成 JPEG 会直接丢掉 alpha → 深色底又变白方块。
              var isPngish = /^image\/(png|webp|svg\+xml)$/.test(file.type) || /\.(png|webp|svg)$/i.test(file.name);
              base64 = isPngish ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
              progress.textContent = '已压缩至 ' + Math.round(base64.length * 3 / 4 / 1024) + 'KB，上传中...';
              doUpload(base64);
            };
            img.src = base64;
          } else {
            progress.textContent = '上传中...';
            doUpload(base64);
          }
        };
        reader.readAsDataURL(file);
        function doUpload(data) {
          API.post('/api/settings/upload-logo', { image_data: data }).then(function(result) {
            if (!result.success) return;
            var url = result.url;
            document.getElementById('logoUrlInput').value = url;
            // 两个预览块一起换（深色底 / 浅色底，用来暴露「白底图」这类问题）
            var stages = document.querySelectorAll('[data-logo-stage]');
            for (var si = 0; si < stages.length; si++) {
              stages[si].innerHTML = '<img src="' + url + '?t=' + Date.now() + '" alt="">';
            }
            // 立即可见：不等「保存配置」，直接把 logo_url 落库并刷新侧栏 ——
            // 官网/后台四处同时跟着变（官网有 60 秒缓存，过一会儿刷新即可看到）。
            return API.put('/api/settings/batch/general', { settings: { logo_url: url } }).then(function() {
              progress.className = 'logo-upload-status success';
              progress.textContent = '✅ 上传成功，四处已同步（官网有 60 秒缓存，稍后刷新可见）';
              applyBrandingSettings();
              setTimeout(function() { progress.className = 'logo-upload-status'; progress.textContent = ''; }, 4500);
            });
          }).catch(function(err) {
            progress.className = 'logo-upload-status error';
            progress.textContent = '❌ 上传失败: ' + err.message;
          });
        }
      };
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor = 'var(--primary)'; zone.style.background = 'var(--primary-light)'; });
      zone.addEventListener('dragleave', function() { zone.style.borderColor = 'var(--border)'; zone.style.background = 'var(--bg)'; });
      zone.addEventListener('drop', function(e) { e.preventDefault(); zone.style.borderColor = 'var(--border)'; zone.style.background = 'var(--bg)'; if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });
    }, 100);
  }).catch(function(e) { container.innerHTML = '<div class="empty-state"><p>加载失败: ' + e.message + '</p></div>'; });
}

function _makeField(key, label, type, desc, val) {
  var input = '';
  if (type === 'select') {
    input = '<select name="' + key + '"><option value="true"' + (val === 'true' ? ' selected' : '') + '>开启</option><option value="false"' + (val === 'false' ? ' selected' : '') + '>关闭</option></select>';
  } else {
    input = '<input name="' + key + '" type="' + type + '" value="' + escapeHtml(val) + '" placeholder="' + desc + '">';
  }
  return '<div class="settings-field"><label>' + label + '</label>' + input + '<span>' + desc + '</span></div>';
}

window.saveGeneralSettings = function() {
  var form = document.querySelector('#generalSettingsForm');
  var settings = formToObject(form);
  API.put('/api/settings/batch/general', { settings: settings }).then(function() {
    showAlert('✔️ 常规配置保存成功');
    applyBrandingSettings();
    _renderSettingsTab('general');
  }).catch(function(e) { showAlert('❌️ 保存失败: ' + e.message); });
};

// ===== 微信配置 Tab（大师级视觉重制版）=====
function renderWechatTab(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  var p1 = API.get('/api/settings/group/wechat');
  var p2 = API.get('/api/staff');
  var doneCount = 0, wechatData = null, staffList = null;
  function checkDone() {
    if (doneCount < 2) return;
    var getVal = function(key) { for (var di = 0; di < wechatData.length; di++) { if (wechatData[di].setting_key === key) return wechatData[di].setting_value; } return ''; };

    // ====== 基础配置卡片 ======
    var baseCard =
      '<div class="settings-card">' +
        '<div class="settings-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>' +
        '<div class="settings-card-body">' +
          '<h4>\uD83D\uDD11 公众号基础配置</h4>' +
          '<p class="settings-desc">微信公众号的开发者凭据，用于发送模板消息和获取用户信息</p>' +
          '<div class="settings-form-grid">' +
            '<div class="settings-field"><label>公众号 AppID</label><input name="wechat_appid" type="text" value="' + escapeHtml(getVal('wechat_appid')) + '" placeholder="微信开放平台分配的AppID"><span>在微信公众平台「开发 → 基本配置」中查看</span></div>' +
            '<div class="settings-field"><label>公众号 AppSecret</label><input name="wechat_appsecret" type="password" value="' + escapeHtml(getVal('wechat_appsecret')) + '" placeholder="AppSecret 请妥善保管"><span>与 AppID 成对，重置后原Secret失效</span></div>' +
            '<div class="settings-field"><label>服务器 Token</label><input name="wechat_token" type="text" value="' + escapeHtml(getVal('wechat_token')) + '" placeholder="微信公众平台配置的 Token"><span>用于回调验证，扫码绑定时必填</span></div>' +
            '<div class="settings-field"><label>OAuth 回调地址</label><input name="wechat_redirect_uri" type="text" value="' + escapeHtml(getVal('wechat_redirect_uri')) + '" placeholder="https://..."><span>微信网页授权回调域名，需在公众平台配置</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ====== 通知模板卡片 ======
    var tmplCard =
      '<div class="settings-card">' +
        '<div class="settings-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
        '<div class="settings-card-body">' +
          '<h4>\uD83D\uDCE8 提醒模板配置</h4>' +
          '<p class="settings-desc">配置各场景使用的微信模板消息ID，需先在微信公众平台创建对应模板</p>' +
          '<div class="settings-form-grid">' +
            '<div class="settings-field"><label>\uD83D\uDD14 到期提醒模板ID</label><input name="wechat_template_id_expire" type="text" value="' + escapeHtml(getVal('wechat_template_id_expire')) + '" placeholder="XXXXXXXXX_template_expire"><span>发送给终端客户的到期通知模板</span></div>' +
            '<div class="settings-field"><label>\u2705 续约成功模板ID</label><input name="wechat_template_id_renew" type="text" value="' + escapeHtml(getVal('wechat_template_id_renew')) + '" placeholder="XXXXXXXXX_template_renew"><span>续约成功后发送给客户的确认模板</span></div>' +
            '<div class="settings-field"><label>\uD83D\uDCCB 管理通知模板ID</label><input name="wechat_template_id_management" type="text" value="' + escapeHtml(getVal('wechat_template_id_management')) + '" placeholder="微信模板消息ID（管理通知合并发送）"><span>向管理人员集中发送到期汇总提醒的模板</span></div>' +
            '<div class="settings-field"><label>\uD83E\uDD16 企微机器人 Webhook</label><input name="wecom_webhook_url" type="text" value="' + escapeHtml(getVal('wecom_webhook_url')) + '" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxx"><span>企业微信群机器人Webhook地址，用于站内通知</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ====== 管理接收人卡片 ======
    var selectedIds = [];
    try { selectedIds = JSON.parse(getVal('reminder_staff_contacts') || '[]'); } catch(e) { selectedIds = []; }
    var selectedMap = {};
    for (var si = 0; si < selectedIds.length; si++) { selectedMap[selectedIds[si]] = true; }

    var staffGridHtml = '';
    if (staffList.length === 0) {
      staffGridHtml = '<div class="empty-state" style="padding:20px"><p>\u26A0\uFE0F 暂未添加人员，请先在「组织架构」中添加员工并填写微信 OpenID。</p></div>';
    } else {
      staffGridHtml = '<div class="wechat-staff-grid">';
      for (var si = 0; si < staffList.length; si++) {
        var s = staffList[si];
        var checked = selectedMap[s.staff_id] ? ' checked' : '';
        var hasOpenid = s.wechat_openid ? true : false;
        var initial = s.name ? s.name.charAt(0) : '?';
        var avatarColor = hasOpenid ? '#3b82f6' : '#94a3b8';
        var avatarBg = hasOpenid ? '#eff6ff' : '#f1f5f9';
        staffGridHtml +=
          '<div class="wechat-staff-item' + (checked ? ' selected' : '') + '">' +
            '<input type="checkbox" class="reminder-staff-checkbox" value="' + s.staff_id + '"' + checked + ' style="display:none">' +
            '<div class="wechat-staff-avatar" style="background:' + avatarBg + ';color:' + avatarColor + '">' + initial + '</div>' +
            '<div class="wechat-staff-info">' +
              '<div class="wechat-staff-name">' + escapeHtml(s.name) + '</div>' +
              '<div class="wechat-staff-pos">' + escapeHtml(s.position || '-') + '</div>' +
            '</div>' +
            '<div class="wechat-staff-badge">' +
              (hasOpenid
                ? '<span class="badge success" style="font-size:10px">\u2714 已绑定</span>'
                : '<span class="badge secondary" style="font-size:10px">\u2716 未绑定</span>') +
            '</div>' +
          '</div>';
      }
      staffGridHtml += '</div>';
    }

    var contactsCard =
      '<div class="settings-card" style="margin-top:16px">' +
        '<div class="settings-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div>' +
        '<div class="settings-card-body">' +
          '<h4>\uD83D\uDCE3 管理通知接收人</h4>' +
          '<p class="settings-desc">勾选需要接收微信到期通知的管理人员。需先在员工信息中填写微信 OpenID，勾选后系统会在到期时通过微信模板消息合并发送汇总提醒。</p>' +
          '<div id="reminderContactsBody">' + staffGridHtml + '</div>' +
          '<div style="margin-top:12px;display:flex;gap:8px;align-items:center">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer">' +
              '<input type="checkbox" id="wechatSelectAllStaff" onchange="toggleAllStaffContacts(this)" style="width:15px;height:15px"> 全选</label>' +
            '<span class="text-xs text-secondary">已选择 <strong id="wechatStaffCount">' + (checkedIdsCount(selectedIds)) + '</strong> 人</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    function checkedIdsCount(map) {
      var c = 0;
      for (var k in selectedMap) { if (selectedMap[k]) c++; }
      return c;
    }

    container.innerHTML =
      '<form id="wechatSettingsForm" onsubmit="return false">' +
        baseCard + tmplCard + contactsCard +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">' +
          '<button class="btn btn-primary" type="button" onclick="saveWechatSettings()">\uD83D\uDCBE 保存全部配置</button></div>' +
      '</form>';

    // 点击卡片勾选/取消 + 员工计数联动
    var staffItems = document.querySelectorAll('.wechat-staff-item');
    for (var i = 0; i < staffItems.length; i++) {
      (function(item) {
        var cb = item.querySelector('.reminder-staff-checkbox');
        if (!cb) return;
        item.addEventListener('click', function() {
          cb.checked = !cb.checked;
          item.classList.toggle('selected', cb.checked);
          updateStaffCount();
        });
      })(staffItems[i]);
    }
    updateStaffCount();
  }

  function updateStaffCount() {
    var checked = document.querySelectorAll('.reminder-staff-checkbox:checked');
    var countEl = document.getElementById('wechatStaffCount');
    if (countEl) countEl.textContent = checked.length;
  }

  p1.then(function(d) { wechatData = d; doneCount++; checkDone(); });
  p2.then(function(d) { staffList = d; doneCount++; checkDone(); });
  setTimeout(function() { if (doneCount < 2) container.innerHTML = '<div class="empty-state"><p>\u274C 加载失败: 请求超时</p></div>'; }, 10000);
}

window.toggleAllStaffContacts = function(checkbox) {
  var items = document.querySelectorAll('.wechat-staff-item');
  var checkedCount = 0;
  for (var i = 0; i < items.length; i++) {
    var cb = items[i].querySelector('.reminder-staff-checkbox');
    if (cb) { cb.checked = checkbox.checked; items[i].classList.toggle('selected', checkbox.checked); }
    if (cb && cb.checked) checkedCount++;
  }
  var countEl = document.getElementById('wechatStaffCount');
  if (countEl) countEl.textContent = checkbox.checked ? items.length : checkedCount;
};

window.saveWechatSettings = function() {
  var form = document.querySelector('#wechatSettingsForm');
  var settings = formToObject(form);
  var checkedStaff = document.querySelectorAll('.reminder-staff-checkbox:checked');
  var staffIds = [];
  for (var i = 0; i < checkedStaff.length; i++) {
    staffIds.push(checkedStaff[i].value);
  }
  settings.reminder_staff_contacts = JSON.stringify(staffIds);
  API.put('/api/settings/batch/wechat', { settings: settings }).then(function() {
    showAlert('\u2714\uFE0F 微信配置保存成功');
    _renderSettingsTab('wechat');
  }).catch(function(e) { showAlert('\u274C\uFE0F 保存失败: ' + e.message); });
};

// ===== 业务配置 Tab =====
function renderBizTab(container) {
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  API.get('/api/settings/group/biz').then(function(data) {
    function getVal(key) { for (var i = 0; i < data.length; i++) { if (data[i].setting_key === key) return data[i].setting_value; } return ''; }
    var customerTypesVal = getVal('customer_types');
    var contractTypesVal = getVal('contract_biz_types');
    var customerTypes = [];
    var contractTypes = [];
    try { customerTypes = JSON.parse(customerTypesVal); } catch(e) { customerTypes = ['园区租户','连锁店','散客','楼宇']; }
    try { contractTypes = JSON.parse(contractTypesVal); } catch(e) { contractTypes = ['宽带自运营','宽带直售','IT外包']; }
    var customerHtml = '';
    for (var i = 0; i < customerTypes.length; i++) {
      customerHtml += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
        '<input name="customer_types_' + i + '" value="' + escapeHtml(customerTypes[i]) + '" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px">' +
        '<button type="button" class="btn btn-sm btn-danger" onclick="removeCustomerType(' + i + ')">删除</button></div>';
    }
    customerHtml += '<button type="button" class="btn btn-sm btn-outline" onclick="addCustomerType()" style="margin-top:4px">+ 添加</button>';
    var contractHtml = '';
    for (var i = 0; i < contractTypes.length; i++) {
      contractHtml += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
        '<input name="contract_biz_types_' + i + '" value="' + escapeHtml(contractTypes[i]) + '" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px">' +
        '<button type="button" class="btn btn-sm btn-danger" onclick="removeContractType(' + i + ')">删除</button></div>';
    }
    contractHtml += '<button type="button" class="btn btn-sm btn-outline" onclick="addContractType()" style="margin-top:4px">+ 添加</button>';
    container.innerHTML =
      '<div class="card"><div class="card-header"><h3>业务配置</h3></div><div class="card-body">' +
        '<form id="bizSettingsForm" class="form-grid" onsubmit="return false">' +
          '<div class="form-group full"><label>客户分类</label><div id="customerTypesContainer">' + customerHtml + '</div><span class="text-xs text-secondary" style="margin-top:2px">客户分类列表，可自定义增删改</span></div>' +
          '<div class="form-group full"><label>合同业务类型</label><div id="contractTypesContainer">' + contractHtml + '</div><span class="text-xs text-secondary" style="margin-top:2px">合同业务类型列表</span></div>' +
          '<div class="form-actions full"><button class="btn btn-primary" type="button" onclick="saveBizSettings()">保存配置</button></div></form></div></div>';
    window._bizCustomerCount = customerTypes.length;
    window._bizContractCount = contractTypes.length;
  }).catch(function(e) { container.innerHTML = '<div class="empty-state"><p>加载失败: ' + e.message + '</p></div>'; });
}

window.addCustomerType = function() {
  var container = document.querySelector('#customerTypesContainer');
  var count = window._bizCustomerCount || 0;
  var div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;align-items:center';
  div.innerHTML = '<input name="customer_types_' + count + '" value="" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px" placeholder="新分类名称"><button type="button" class="btn btn-sm btn-danger" onclick="removeCustomerType(' + count + ')">删除</button>';
  container.insertBefore(div, container.lastElementChild);
  window._bizCustomerCount = count + 1;
};
window.removeCustomerType = function(index) {
  var container = document.querySelector('#customerTypesContainer');
  var items = container.querySelectorAll('div[style*="display:flex"]');
  if (items.length <= 1) { showAlert('至少保留一个分类'); return; }
  if (index < items.length) items[index].remove();
};
window.addContractType = function() {
  var container = document.querySelector('#contractTypesContainer');
  var count = window._bizContractCount || 0;
  var div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;align-items:center';
  div.innerHTML = '<input name="contract_biz_types_' + count + '" value="" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px" placeholder="新类型名称"><button type="button" class="btn btn-sm btn-danger" onclick="removeContractType(' + count + ')">删除</button>';
  container.insertBefore(div, container.lastElementChild);
  window._bizContractCount = count + 1;
};
window.removeContractType = function(index) {
  var container = document.querySelector('#contractTypesContainer');
  var items = container.querySelectorAll('div[style*="display:flex"]');
  if (items.length <= 1) { showAlert('至少保留一个类型'); return; }
  if (index < items.length) items[index].remove();
};
window.saveBizSettings = function() {
  var customerTypes = [];
  var inputs = document.querySelectorAll('#customerTypesContainer input');
  for (var i = 0; i < inputs.length; i++) { var v = inputs[i].value.trim(); if (v) customerTypes.push(v); }
  var contractTypes = [];
  inputs = document.querySelectorAll('#contractTypesContainer input');
  for (var i = 0; i < inputs.length; i++) { var v = inputs[i].value.trim(); if (v) contractTypes.push(v); }
  API.put('/api/settings/batch/biz', {
    settings: { customer_types: JSON.stringify(customerTypes), contract_biz_types: JSON.stringify(contractTypes) }
  }).then(function() {
    showAlert('业务配置保存成功');
    _renderSettingsTab('biz');
  }).catch(function(e) { showAlert('保存失败: ' + e.message); });
};
