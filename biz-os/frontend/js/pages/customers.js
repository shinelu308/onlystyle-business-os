// ===== 客户管理（ES5 兼容）=====
window._customerSearch = '';

function renderCustomers() {
  var body = $('contentBody');
  var p1 = API.get('/api/customers?search=' + encodeURIComponent(window._customerSearch || ''));
  var p2 = API.get('/api/customers/config/types');
  var bothDone = 0, customers = null, types = null;
  function checkDone() {
    if (bothDone < 2) return;
    var typeMap = {};
    for (var t = 0; t < types.length; t++) { typeMap[types[t]] = true; }
    var typeCounts = {};
    for (var c = 0; c < customers.length; c++) {
      var ct = customers[c].cust_type || '未分类';
      typeCounts[ct] = (typeCounts[ct] || 0) + 1;
    }
    var statCards = '';
    statCards += '<div class="stat-card"><div class="stat-icon" style="background:var(--primary-light);color:var(--primary)">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>' +
      '<div class="stat-info"><div class="stat-number">' + customers.length + '</div><div class="stat-label">总客户数</div></div></div>';
    for (var t2 = 0; t2 < types.length; t2++) {
      var count = typeCounts[types[t2]] || 0;
      statCards += '<div class="stat-card"><div class="stat-icon" style="background:var(--success-bg);color:var(--success)">' +
        '<span style="font-size:18px">' + count + '</span></div>' +
        '<div class="stat-info"><div class="stat-number">' + count + '</div><div class="stat-label">' + types[t2] + '</div></div></div>';
    }

    var rows = '';
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      var typeBadge = '<span class="badge info">' + escapeHtml(c.cust_type || '-') + '</span>';
      var wechatIcon = c.wechat_openid ? '<span style="color:#07c160">\u2714 微信绑定</span>' : '<span class="text-secondary">未绑定</span>';
      var chainLabel = '';
      if (c.parent_name) chainLabel = '<span class="text-xs text-secondary"> [' + escapeHtml(c.parent_name) + ']</span>';
      if (c.cust_type === '连锁店' && !c.parent_id) chainLabel = ' <span class="badge warning">总部</span>';
      var addressText = c.address ? escapeHtml(c.address) : '<span class="text-secondary">-</span>';
      rows += '<tr>' +
        '<td><input type="checkbox" class="customer-checkbox" value="' + c.customer_id + '"></td>' +
        '<td><strong>' + escapeHtml(c.customer_id) + '</strong></td>' +
        '<td>' + escapeHtml(c.company_name) + chainLabel + '</td>' +
        '<td>' + typeBadge + '</td>' +
        '<td>' + addressText + '</td>' +
        '<td>' + escapeHtml(c.contact_person || '-') + '</td>' +
        '<td>' + escapeHtml(c.contact_phone || '-') + '</td>' +
        '<td>' + wechatIcon + '</td>' +
        '<td><div class="btn-group">' +
          '<button class="btn btn-sm btn-ghost" onclick="showCustomerForm(\'' + c.customer_id + '\')">编辑</button>' +
          '<button class="btn btn-sm btn-outline" onclick="showCustomerOverview(\'' + c.customer_id + '\')" title="客户全景">全景</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteCustomer(\'' + c.customer_id + '\')">删除</button></div></td></tr>';
    }
    var searchHtml = '<div style="display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--border);align-items:center">' +
      '<input id="customerSearchInput" type="text" placeholder="搜索编号/名称/类型/地址/联系人/电话..." value="' + (window._customerSearch || '') + '" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px">' +
      '<button class="btn btn-sm btn-ghost" onclick="doCustomerSearch()">搜索</button>' +
      '<button class="btn btn-sm btn-outline" onclick="resetCustomerSearch()">重置</button></div>';
    var batchBar = '<div id="customerBatchBar" class="batch-bar" style="display:none">' +
      '<span id="customerBatchCount">已选择 0 项</span>' +
      '<button class="btn btn-sm btn-danger" onclick="batchDeleteCustomer()">批量删除</button>' +
      '<button class="btn btn-sm btn-outline" onclick="clearCustomerSelection()">取消选择</button></div>';
    body.innerHTML =
      '<div class="stats-grid">' + statCards + '</div>' +
      '<div class="card">' +
        '<div class="card-header"><h3>客户列表</h3>' +
          '<div class="btn-group">' +
            '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/customers/template\', \'客户管理_导入模板.xlsx\')" title="下载导入模板">模板</button>' +
            '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/customers/export\', \'客户管理_客户列表.xlsx\')" title="导出为Excel">导出</button>' +
            '<button class="btn btn-sm btn-outline" onclick="importCSV(\'/api/customers/import\', \'客户\')" title="从CSV导入">导入</button>' +
            '<button class="btn btn-sm btn-outline" onclick="showChainTree()" title="查看连锁客户结构树">连锁树</button>' +
            '<button class="btn btn-primary btn-sm" onclick="showCustomerForm()">+ 新增客户</button></div></div>' +
        '<div class="card-body" style="padding:0">' + searchHtml + batchBar +
        '<div class="table-wrapper"><table>' +
          '<thead><tr><th style="width:36px;text-align:center"><input type="checkbox" id="customerSelectAll" onclick="toggleSelectAllCustomer()"></th><th>编号</th><th>公司名称</th><th>类型</th><th>安装地址</th><th>联系人</th><th>联系电话</th><th>微信状态</th><th>操作</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div></div></div>';
    attachCustomerCheckboxListeners();
    var searchInput = document.getElementById('customerSearchInput');
    if (searchInput) {
      searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doCustomerSearch(); });
    }
  }
  p1.then(function(d) { customers = d; bothDone++; checkDone(); });
  p2.then(function(d) { types = d; bothDone++; checkDone(); });
  setTimeout(function() { if (bothDone < 2) body.innerHTML = '<div class="empty-state"><p>加载失败: 请求超时</p></div>'; }, 10000);
}

function doCustomerSearch() {
  var input = document.getElementById('customerSearchInput');
  window._customerSearch = input ? input.value.trim() : '';
  renderCustomers();
}

function resetCustomerSearch() {
  window._customerSearch = '';
  renderCustomers();
}

window.showChainTree = function() {
  API.get('/api/customers/tree').then(function(tree) {
    var html = '<div style="max-height:60vh;overflow-y:auto">';
    for (var i = 0; i < tree.length; i++) {
      var p = tree[i];
      html += '<div class="tree-node"><div class="tree-header">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ' +
        escapeHtml(p.company_name) + ' <span class="badge warning" style="margin-left:8px">' + p.cust_type + '</span></div>';
      if (p.children && p.children.length > 0) {
        html += '<div class="tree-children">';
        for (var j = 0; j < p.children.length; j++) {
          var ch = p.children[j];
          html += '<div class="tree-child">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> ' +
            escapeHtml(ch.company_name) + ' <span class="badge info" style="margin-left:8px">' + ch.cust_type + '</span></div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    if (tree.length === 0) html = '<div class="empty-state"><p>无连锁客户结构</p></div>';
    openModal('连锁客户结构树', html);
  }).catch(function(e) {
    openModal('加载失败', '<p>' + e.message + '</p>');
  });
};

window.showCustomerOverview = function(id) {
  API.get('/api/customers/' + id + '/overview').then(function(result) {
    var cust = result.customer;
    var branches = result.branches;
    var contracts = result.contracts;

    // 统计
    var expiredCt = 0, expiringCt = 0, activeCt = 0;
    for (var ci = 0; ci < contracts.length; ci++) {
      if (contracts[ci].status === '已到期') expiredCt++;
      else if (contracts[ci].status === '即将到期') expiringCt++;
      else activeCt++;
    }

    // 基本信息卡片
    var infoHtml =
      '<div class="customer-overview-header">' +
        '<div class="customer-overview-avatar">' + (cust.company_name ? cust.company_name.charAt(0) : '?') + '</div>' +
        '<div class="customer-overview-title">' +
          '<h2>' + escapeHtml(cust.company_name) + '</h2>' +
          '<div class="customer-overview-meta">' +
            '<span class="badge info" style="font-size:11px">' + escapeHtml(cust.cust_type) + '</span>' +
            '<span class="customer-overview-id">#' + escapeHtml(cust.customer_id) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="customer-overview-detail-grid">' +
        '<div class="customer-overview-field"><span class="co-label">联系人</span><span class="co-value">' + escapeHtml(cust.contact_person || '-') + '</span></div>' +
        '<div class="customer-overview-field"><span class="co-label">联系电话</span><span class="co-value">' + escapeHtml(cust.contact_phone || '-') + '</span></div>' +
        '<div class="customer-overview-field co-full"><span class="co-label">安装地址</span><span class="co-value">' + escapeHtml(cust.address || '-') + '</span></div>' +
        '<div class="customer-overview-field co-full"><span class="co-label">微信状态</span><span class="co-value">' +
          (cust.wechat_openid
            ? '<span class="customer-wechat-bound">\u2714 已绑定 <span class="text-xs text-secondary">(' + escapeHtml(cust.wechat_openid) + ')</span></span>'
            : '<span class="customer-wechat-unbound">\u2716 未绑定</span>') +
          (cust.wechat_openid ? '' : ' <button class="btn btn-sm btn-outline" style="color:#07c160;border-color:#07c160;font-size:12px" onclick="showWechatQrCode(\'' + cust.customer_id + '\',\'' + escapeHtml(cust.company_name) + '\')">\uD83D\uDCF7 扫码绑定</button>') +
        '</span></div>' +
      '</div>';

    // 合同统计条
    var statHtml =
      '<div class="customer-overview-stats">' +
        '<div class="cos-item cos-active"><span class="cos-number">' + activeCt + '</span><span class="cos-label">进行中</span></div>' +
        '<div class="cos-item cos-expiring"><span class="cos-number">' + expiringCt + '</span><span class="cos-label">即将到期</span></div>' +
        '<div class="cos-item cos-expired"><span class="cos-number">' + expiredCt + '</span><span class="cos-label">已过期</span></div>' +
        '<div class="cos-item cos-total"><span class="cos-number">' + contracts.length + '</span><span class="cos-label">总合同</span></div>' +
      '</div>';

    // 合同列表
    var contractHtml = '';
    if (contracts.length === 0) {
      contractHtml = '<div class="customer-overview-empty">\uD83D\uDCC4 暂无关联合同</div>';
    } else {
      for (var ci = 0; ci < contracts.length; ci++) {
        var ct = contracts[ci];
        var ctDays = daysBetween(ct.end_date);
        var isExpired = ct.status === '已到期' || ctDays < 0;
        var dayText = isExpired ? '\u5DF2\u8FC7\u671F ' + Math.abs(ctDays) + '\u5929' : ctDays + '\u5929';
        var dayCls = isExpired || ctDays <= 0 ? 'danger' : (ctDays <= 7 ? 'danger' : (ctDays <= 30 ? 'warning' : 'success'));
        var nodeInfo = ct.node_name ? escapeHtml(ct.node_name) : '-';
        contractHtml +=
          '<div class="customer-overview-contract">' +
            '<div class="coc-header">' +
              '<div class="coc-id">' + escapeHtml(ct.contract_id) + '</div>' +
              '<span class="badge ' + dayCls + '" style="font-size:10px">' + dayText + '</span>' +
              statusBadge(ct.status) +
            '</div>' +
            '<div class="coc-body">' +
              '<div class="coc-row"><span class="coc-label">业务类型</span><span class="coc-val">' + escapeHtml(ct.biz_type) + '</span></div>' +
              '<div class="coc-row"><span class="coc-label">安装位置</span><span class="coc-val">' + nodeInfo + '</span></div>' +
              '<div class="coc-row"><span class="coc-label">周期</span><span class="coc-val">' + ct.start_date + ' \u2192 ' + ct.end_date + '</span></div>' +
              '<div class="coc-row"><span class="coc-label">计费</span><span class="coc-val" style="font-weight:600;color:var(--text)">\u00A5' + (ct.monthly_fee || 0).toLocaleString() + '/' + (ct.billing_cycle || '月') + '</span></div>' +
            '</div>' +
          '</div>';
      }
    }

    // 旗下分店
    var branchHtml = '';
    if (branches && branches.length > 0) {
      branchHtml =
        '<div class="customer-overview-section">' +
          '<div class="customer-overview-section-title">\uD83C\uDFE2 旗下分店 <span class="badge info" style="font-size:10px;margin-left:6px">' + branches.length + '</span></div>' +
          '<div class="customer-overview-branches">';
      for (var bi = 0; bi < branches.length; bi++) {
        branchHtml += '<div class="customer-overview-branch-item">' +
          '<div class="cob-avatar">' + (branches[bi].company_name ? branches[bi].company_name.charAt(0) : '?') + '</div>' +
          '<span>' + escapeHtml(branches[bi].company_name) + '</span>' +
        '</div>';
      }
      branchHtml += '</div></div>';
    }

    var fullHtml =
      '<div class="customer-overview">' +
        infoHtml +
        statHtml +
        '<div class="customer-overview-section">' +
          '<div class="customer-overview-section-title">\uD83D\uDCCB 关联合同</div>' +
          '<div class="customer-overview-contracts">' + contractHtml + '</div>' +
        '</div>' +
        branchHtml +
      '</div>';

    openModal('\uD83D\uDD0D 客户全景 - ' + cust.company_name, fullHtml);
    try { document.getElementById('modal').style.maxWidth = '720px'; } catch(e) {}
  }).catch(function(e) {
    openModal('加载失败', '<p>' + e.message + '</p>');
  });
};

window.showCustomerForm = function(id) {
  var data = { customer_id: '', company_name: '', cust_type: '', parent_id: '', wechat_openid: '', contact_person: '', contact_phone: '' };
  var isEdit = false;
  var p1 = API.get('/api/customers');
  var p2 = API.get('/api/customers/config/types');
  var done1 = false, done2 = false;
  var parents = null, types = null;
  function tryOpen() {
    if (!done1 || !done2) return;
    if (id) {
      API.get('/api/customers/' + id).then(function(resp) {
        data = resp;
        isEdit = true;
        openForm();
      });
    } else {
      openForm();
    }
  }
  function openForm() {
    var typeOpts = '<option value="">请选择类型</option>';
    for (var t = 0; t < types.length; t++) {
      typeOpts += '<option value="' + types[t] + '"' + (data.cust_type === types[t] ? ' selected' : '') + '>' + types[t] + '</option>';
    }
    var parentOpts = '<option value="">无（独立客户）</option>';
    for (var p = 0; p < parents.length; p++) {
      if (parents[p].customer_id !== id && parents[p].cust_type === '连锁店' && !parents[p].parent_id) {
        parentOpts += '<option value="' + parents[p].customer_id + '"' + (data.parent_id === parents[p].customer_id ? ' selected' : '') + '>' + escapeHtml(parents[p].company_name) + '</option>';
      }
    }
    openModal(isEdit ? '编辑客户' : '新增客户',
      '<form id="customerForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">客户编号</label><input name="customer_id" value="' + data.customer_id + '"' + (isEdit ? ' readonly style="background:#f1f5f9"' : ' required placeholder="如 CUST-012"') + '></div>' +
        '<div class="form-group"><label class="required">公司名称</label><input name="company_name" required value="' + escapeHtml(data.company_name) + '" placeholder="客户名称"></div>' +
        '<div class="form-group"><label class="required">客户类型</label><select name="cust_type" required>' + typeOpts + '</select></div>' +
        '<div class="form-group"><label>所属总部</label><select name="parent_id">' + parentOpts + '</select></div>' +
        '<div class="form-group"><label>联系人</label><input name="contact_person" value="' + escapeHtml(data.contact_person) + '" placeholder="联系人姓名"></div>' +
        '<div class="form-group"><label>联系电话</label><input name="contact_phone" value="' + escapeHtml(data.contact_phone) + '" placeholder="手机号"></div>' +
        '<div class="form-group full"><label>安装地址</label><input name="address" value="' + escapeHtml(data.address || '') + '" placeholder="客户安装地址"></div>' +
        '<div class="form-group full"><label>微信 OpenID</label><div style="display:flex;gap:8px;align-items:center"><input name="wechat_openid" value="' + escapeHtml(data.wechat_openid) + '" placeholder="微信用户OpenID" style="flex:1">' +
          '<button type="button" class="btn btn-sm btn-outline" style="color:#07c160;border-color:#07c160;white-space:nowrap" onclick="showWechatQrCode(\'' + escapeHtml(data.customer_id) + '\',\'' + escapeHtml(data.company_name) + '\')">\uD83D\uDCF7 扫码绑定</button></div></div>' +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-primary" type="button" onclick="submitCustomer(' + isEdit + ')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');
  }
  p1.then(function(d) { parents = d; done1 = true; tryOpen(); });
  p2.then(function(d) { types = d; done2 = true; tryOpen(); });
};

window.submitCustomer = function(isEdit) {
  var form = document.querySelector('#customerForm');
  var data = formToObject(form);
  var req = (isEdit === true || isEdit === 'true')
    ? API.put('/api/customers/' + data.customer_id, data)
    : API.post('/api/customers', data);
  req.then(function() {
    closeModal();
    renderCustomers();
  });
};

window.deleteCustomer = function(id) {
  showConfirm('确认删除该客户？', function(confirmed) {
    if (!confirmed) return;
    API.del('/api/customers/' + id).then(function() {
      renderCustomers();
    });
  });
};

// ===== 批量删除 =====
function attachCustomerCheckboxListeners() {
  var checkboxes = document.querySelectorAll('.customer-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener('change', function() {
      updateCustomerBatchBar();
      syncCustomerSelectAll();
    });
  }
}

function syncCustomerSelectAll() {
  var allCheckboxes = document.querySelectorAll('.customer-checkbox');
  var allChecked = allCheckboxes.length > 0;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var headerCheckbox = document.getElementById('customerSelectAll');
  if (headerCheckbox) headerCheckbox.checked = allChecked;
}

function updateCustomerBatchBar() {
  var checked = document.querySelectorAll('.customer-checkbox:checked');
  var bar = document.getElementById('customerBatchBar');
  var countEl = document.getElementById('customerBatchCount');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    countEl.textContent = '已选择 ' + checked.length + ' 项';
  } else {
    bar.style.display = 'none';
  }
}

window.toggleSelectAllCustomer = function() {
  var allCheckboxes = document.querySelectorAll('.customer-checkbox');
  var allChecked = true;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var newState = !allChecked;
  for (var i = 0; i < allCheckboxes.length; i++) {
    allCheckboxes[i].checked = newState;
  }
  var headerCheckbox = document.getElementById('customerSelectAll');
  if (headerCheckbox) headerCheckbox.checked = newState;
  updateCustomerBatchBar();
};

window.clearCustomerSelection = function() {
  var checkboxes = document.querySelectorAll('.customer-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = false;
  }
  var headerCheckbox = document.getElementById('customerSelectAll');
  if (headerCheckbox) headerCheckbox.checked = false;
  updateCustomerBatchBar();
};

window.batchDeleteCustomer = function() {
  var checked = document.querySelectorAll('.customer-checkbox:checked');
  if (checked.length === 0) return;
  var ids = [];
  for (var i = 0; i < checked.length; i++) {
    ids.push(checked[i].value);
  }
  showConfirm('确认删除已选择的 ' + ids.length + ' 个客户？', function(confirmed) {
    if (!confirmed) return;
    API.post('/api/customers/batch-delete', { ids: ids }).then(function(result) {
      showAlert('成功删除 ' + result.count + ' 个客户');
      renderCustomers();
    }).catch(function(e) {
      showAlert('批量删除失败: ' + e.message);
    });
  });
};

// ===== 微信扫码绑定 OpenID =====
var _wechatPollTimer = null;

window.showWechatQrCode = function(customerId, companyName) {
  API.get('/api/wechat/config-status').then(function(config) {
    if (!config.configured) {
      showAlert('\u26A0\uFE0F 微信 AppID 未配置或格式不正确，请先在\u201C系统设置\u2192微信配置\u201D中配置');
      return;
    }

    openModal('\uD83D\uDCF7 微信扫码绑定 - ' + companyName,
      '<div style="text-align:center;padding:20px">' +
        '<p style="color:var(--text-secondary);margin-bottom:16px">请客户使用微信扫描下方二维码关注公众号，系统将自动获取 OpenID 并绑定</p>' +
        '<div id="wechatQrCodeContainer" style="width:280px;height:280px;margin:0 auto 16px;background:#f5f5f5;border-radius:12px;display:flex;align-items:center;justify-content:center">' +
          '<span class="text-secondary">正在生成二维码...</span></div>' +
        '<div id="wechatBindStatus" style="font-size:14px;color:var(--text-secondary)">等待扫码...</div>' +
        '<div style="margin-top:16px"><button class="btn btn-outline btn-sm" onclick="closeWechatQrCode()">关闭</button></div></div>');

    API.get('/api/wechat/qrcode/' + customerId).then(function(result) {
      if (result.already_bound) {
        document.getElementById('wechatQrCodeContainer').innerHTML =
          '<span style="color:#07c160;font-size:16px">\u2714 已绑定，无需重复操作</span>';
        document.getElementById('wechatBindStatus').innerHTML =
          '<span style="color:#07c160">\u2714 该客户已绑定微信</span>';
        return;
      }
      document.getElementById('wechatQrCodeContainer').innerHTML =
        '<img src="' + result.qrcode_url + '" alt="微信扫码绑定二维码" style="width:260px;height:260px;border-radius:8px">';
      document.getElementById('wechatBindStatus').innerHTML =
        '<span style="color:#07c160">\uD83D\uDCF7 请客户扫码关注...</span>';
      startWechatPoll(customerId);
    }).catch(function(e) {
      document.getElementById('wechatQrCodeContainer').innerHTML =
        '<span style="color:#dc2626;font-size:14px">\u274C 生成二维码失败: ' + e.message + '</span>';
      document.getElementById('wechatBindStatus').innerHTML =
        '<span style="color:#dc2626">请检查微信配置是否正确</span>';
    });
  });
};

function startWechatPoll(customerId) {
  if (_wechatPollTimer) { clearInterval(_wechatPollTimer); _wechatPollTimer = null; }
  var pollCount = 0;
  _wechatPollTimer = setInterval(function() {
    pollCount++;
    API.get('/api/wechat/check-binding/' + customerId).then(function(result) {
      if (result.bound) {
        clearInterval(_wechatPollTimer);
        _wechatPollTimer = null;
        document.getElementById('wechatBindStatus').innerHTML =
          '<span style="color:#07c160;font-size:16px">\u2714 绑定成功！OpenID: ' + result.wechat_openid + '</span>';
        document.getElementById('wechatQrCodeContainer').innerHTML =
          '<span style="color:#07c160;font-size:40px">\u2705</span>';
        var openidInput = document.querySelector('[name="wechat_openid"]');
        if (openidInput) openidInput.value = result.wechat_openid;
        setTimeout(function() { closeModal(); renderCustomers(); }, 2000);
      } else if (pollCount >= 60) {
        clearInterval(_wechatPollTimer);
        _wechatPollTimer = null;
        document.getElementById('wechatBindStatus').innerHTML =
          '<span class="text-secondary">\u23F0 绑定超时（5分钟），请重新尝试</span>';
      } else {
        document.getElementById('wechatBindStatus').innerHTML =
          '<span class="text-secondary">\u23F3 等待扫码... (' + pollCount + 's)</span>';
      }
    });
  }, 5000);
}

window.closeWechatQrCode = function() {
  if (_wechatPollTimer) { clearInterval(_wechatPollTimer); _wechatPollTimer = null; }
  closeModal();
};
