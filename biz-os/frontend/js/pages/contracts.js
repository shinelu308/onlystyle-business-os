// ===== 合同管理（ES5 兼容）=====
window._contractSearch = '';
window._contractFoldState = {}; // 续约折叠状态

function renderContracts() {
  var body = $('contentBody');
  API.get('/api/contracts?search=' + encodeURIComponent(window._contractSearch || '')).then(function(data) {
    var counts = { '\u8FDB\u884C\u4E2D': 0, '\u5373\u5C06\u5230\u671F': 0, '\u5DF2\u5230\u671F': 0, '\u5DF2\u7EED\u7EA6': 0 };
    for (var i = 0; i < data.length; i++) {
      var s = data[i].status;
      if (counts[s] !== undefined) counts[s]++;
    }
    var html = '';
    html += '<div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">';
    html += '<div class="stat-card"><div class="stat-info"><div class="stat-number">' + counts['\u8FDB\u884C\u4E2D'] + '</div><div class="stat-label">进行中</div></div></div>';
    html += '<div class="stat-card"><div class="stat-info"><div class="stat-number" style="color:#d97706">' + counts['\u5373\u5C06\u5230\u671F'] + '</div><div class="stat-label">即将到期</div></div></div>';
    html += '<div class="stat-card"><div class="stat-info"><div class="stat-number" style="color:#dc2626">' + counts['\u5DF2\u5230\u671F'] + '</div><div class="stat-label">已到期</div></div></div>';
    html += '<div class="stat-card"><div class="stat-info"><div class="stat-number" style="color:#2563eb">' + counts['\u5DF2\u7EED\u7EA6'] + '</div><div class="stat-label">已续约</div></div></div>';
    html += '</div>';

    // 构建续约父子关系映射
    var renewMap = {};
    var shownAsChild = {};
    for (var i = 0; i < data.length; i++) {
      var ct = data[i];
      if (ct.renewed_from) {
        if (!renewMap[ct.renewed_from]) renewMap[ct.renewed_from] = [];
        renewMap[ct.renewed_from].push(ct);
        shownAsChild[ct.contract_id] = true;
      }
    }

    var rows = '';
    for (var i = 0; i < data.length; i++) {
      var ct = data[i];
      // 跳过已在子行中显示的续约合同
      if (shownAsChild[ct.contract_id]) continue;

      var children = renewMap[ct.contract_id];
      var childCount = children ? children.length : 0;

      // 初始折叠状态：默认展开
      if (childCount > 0 && window._contractFoldState[ct.contract_id] === undefined) {
        window._contractFoldState[ct.contract_id] = true; // true=展开
      }

      // 渲染主合同行（带折叠按钮）
      rows += renderContractRow(ct, false, childCount);

      // 渲染该合同下的续约子合同（缩进 + 淡色，可折叠）
      if (children && children.length > 0) {
        var isExpanded = window._contractFoldState[ct.contract_id];
        rows += '<tbody id="fold-group-' + ct.contract_id + '" class="contract-fold-group"' +
          (isExpanded ? '' : ' style="display:none"') + '>';
        for (var j = 0; j < children.length; j++) {
          rows += renderContractRow(children[j], true);
        }
        rows += '</tbody>';
      }
    }
    var searchHtml = '<div style="display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--border);align-items:center">' +
      '<input id="contractSearchInput" type="text" placeholder="搜索合同编号/客户名称/业务类型/状态..." value="' + (window._contractSearch || '') + '" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px">' +
      // 设计稿纪律：一屏只留一个渐变主按钮（本页是「+ 新增合同」），搜索降为次要
      '<button class="btn btn-sm btn-ghost" onclick="doContractSearch()">搜索</button>' +
      '<button class="btn btn-sm btn-outline" onclick="resetContractSearch()">重置</button></div>';
    var batchBar = '<div id="contractBatchBar" class="batch-bar" style="display:none">' +
      '<span id="contractBatchCount">已选择 0 项</span>' +
      '<button class="btn btn-sm btn-danger" onclick="batchDeleteContract()">批量删除</button>' +
      '<button class="btn btn-sm btn-outline" onclick="clearContractSelection()">取消选择</button></div>';
    html += '<div class="card">' +
      '<div class="card-header"><h3>\uD83D\uDCC4 业务合同列表</h3>' +
        '<div class="btn-group">' +
          '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/contracts/template\', \'合同管理_导入模板.xlsx\')" title="下载导入模板">模板</button>' +
          '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/contracts/export\', \'合同管理_合同列表.xlsx\')" title="导出为Excel">导出</button>' +
          '<button class="btn btn-sm btn-outline" onclick="importCSV(\'/api/contracts/import\', \'合同\')" title="从CSV导入">导入</button>' +
          '<button class="btn btn-primary btn-sm" onclick="showContractForm()">+ 新增合同</button></div></div>' +
      '<div class="card-body" style="padding:0">' + searchHtml + batchBar +
      '<div class="table-wrapper"><table>' +
        '<thead><tr><th style="width:36px;text-align:center"><input type="checkbox" id="contractSelectAll" onclick="toggleSelectAllContract()"></th><th>合同编号</th><th>客户名称</th><th>业务类型</th><th>安装位置</th><th>带宽</th><th>生效日</th><th>到期日</th><th>剩余天数</th><th>状态</th><th>计费</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div></div></div>';
    body.innerHTML = html;
    attachContractCheckboxListeners();
    attachFoldListeners();
    var searchInput = document.getElementById('contractSearchInput');
    if (searchInput) {
      searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doContractSearch(); });
    }
  }).catch(function(e) {
    body.innerHTML = '<div class="empty-state"><p>\u274C 加载失败: ' + e.message + '</p></div>';
  });
}

// 渲染单行合同（isChild=true 时显示为续约子行，childCount 为主合同的续约次数）
function renderContractRow(ct, isChild, childCount) {
  var days = daysBetween(ct.end_date);
  var dayCls = 'secondary';
  if (days <= 0) dayCls = 'danger';
  else if (days <= 7) dayCls = 'danger';
  else if (days <= 30) dayCls = 'warning';
  else dayCls = 'success';
  var showRenew = ct.status === '\u5373\u5C06\u5230\u671F' || ct.status === '\u5DF2\u5230\u671F';
  var renewBtn = showRenew ? '<button class="btn-renew" onclick="previewRenew(\'' + ct.contract_id + '\')">\uD83D\uDD04 续约</button>' : '';
  var undoBtn = ct.status === '\u5DF2\u7EED\u7EA6' ? '<button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#dc2626" onclick="undoRenew(\'' + ct.contract_id + '\')">\u21A9 撤销续约</button>' : '';
  var daysStr = days <= 0 ? '已过期' : days + '天';
  var rowCls = isChild ? ' class="contract-renewal-row"' : '';
  var txtCls = isChild ? ' class="renewal-faded"' : '';
  // 主合同有续约子合同时：折叠按钮 + 续约次数标签
  var hasChildren = !isChild && childCount && childCount > 0;
  var isExpanded = hasChildren && window._contractFoldState[ct.contract_id];
  var toggleBtn = hasChildren
    ? '<span class="contract-fold-btn' + (isExpanded ? ' expanded' : '') + '" data-fold-id="' + ct.contract_id + '">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</span>'
    : (isChild ? '<span class="contract-fold-spacer"></span>' : '');
  var renewalBadge = hasChildren ? '<span class="contract-renewal-badge">续约\u00D7' + childCount + '</span>' : '';
  return '<tr' + rowCls + '>' +
    '<td class="contract-first-cell">' +
      '<div class="contract-cell-left">' + toggleBtn +
        '<input type="checkbox" class="contract-checkbox" value="' + ct.contract_id + '">' +
      '</div>' +
    '</td>' +
    '<td' + txtCls + '><strong>' + ct.contract_id + '</strong>' + renewalBadge + '</td>' +
    '<td' + txtCls + '>' + escapeHtml(ct.company_name) + '</td>' +
    '<td' + txtCls + '><span class="badge info' + (isChild ? '" style="opacity:.65"' : '') + '">' + ct.biz_type + '</span></td>' +
    '<td' + txtCls + '>' + escapeHtml(ct.node_name || '-') + '</td>' +
    '<td' + txtCls + '>' + (ct.allocated_bw ? ct.allocated_bw + 'Mbps' : '-') + '</td>' +
    '<td' + txtCls + '>' + ct.start_date + '</td>' +
    '<td' + txtCls + '>' + ct.end_date + '</td>' +
    '<td' + txtCls + '><span class="badge ' + dayCls + '">' + daysStr + '</span></td>' +
    '<td' + txtCls + '>' + statusBadge(ct.status) + '</td>' +
    '<td style="font-size:13px"' + txtCls + '><span class="text-secondary' + (isChild ? '-faded' : '') + '">\u00A5' + (ct.monthly_fee || 0).toLocaleString() + '</span><span class="text-xs text-secondary">/' + (ct.billing_cycle || '月') + '</span></td>' +
    '<td><div class="btn-group">' + renewBtn + undoBtn +
      '<button class="btn btn-sm btn-ghost" onclick="showContractForm(\'' + ct.contract_id + '\')">编辑</button></div></td></tr>';
}

// 折叠/展开续约子合同（通过事件委托监听）
function attachFoldListeners() {
  var container = document.querySelector('.table-wrapper');
  if (!container) return;
  container.addEventListener('click', function(e) {
    var btn = e.target.closest ? e.target.closest('.contract-fold-btn') : null;
    if (!btn) {
      // 兼容不支持 closest 的浏览器（检查 class）
      btn = e.target;
      if (!btn.classList || !btn.classList.contains('contract-fold-btn')) return;
    }
    var parentId = btn.getAttribute('data-fold-id');
    if (!parentId) return;
    window._contractFoldState[parentId] = !window._contractFoldState[parentId];
    var group = document.getElementById('fold-group-' + parentId);
    if (group) {
      group.style.display = window._contractFoldState[parentId] ? '' : 'none';
    }
    btn.classList.toggle('expanded', window._contractFoldState[parentId]);
  });
}

function doContractSearch() {
  var input = document.getElementById('contractSearchInput');
  window._contractSearch = input ? input.value.trim() : '';
  renderContracts();
}

function resetContractSearch() {
  window._contractSearch = '';
  renderContracts();
}

window.previewRenew = function(contractId) {
  API.get('/api/contracts/' + contractId).then(function(ct) {
    var defaultStart = ct.end_date;
    var d = new Date(defaultStart);
    d.setMonth(d.getMonth() + ct.duration_months);
    var defaultEnd = d.toISOString().split('T')[0];

    openModal('\uD83D\uDD04 一键续约 - ' + ct.contract_id,
      '<div style="margin-bottom:16px">' +
        '<p style="font-size:14px;color:var(--text-secondary);margin-bottom:8px">以下数据将<strong>自动克隆</strong>原合同：</p>' +
        '<div class="detail-grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">' +
          '<div class="detail-row"><span class="detail-label">客户</span><span class="detail-value">' + ct.company_name + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">业务类型</span><span class="detail-value">' + ct.biz_type + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">安装位置</span><span class="detail-value">' + (ct.node_name || '-') + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">带宽</span><span class="detail-value">' + (ct.allocated_bw ? ct.allocated_bw + 'Mbps' : '-') + '</span></div>' +
          '<div class="detail-row"><span class="detail-label">原计费</span><span class="detail-value">\u00A5' + (ct.monthly_fee || 0) + '/' + (ct.billing_cycle || '月') + '</span></div>' +
        '</div></div>' +
      '<form id="renewForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">新开始日期</label><input name="new_start_date" type="date" value="' + defaultStart + '" required><span class="text-xs text-secondary">默认顺延（接续原到期日）</span></div>' +
        '<div class="form-group"><label class="required">签约周期（月）</label><input name="new_duration_months" type="number" value="' + ct.duration_months + '" required></div>' +
        '<div class="form-group"><label class="required">计费周期</label><select name="new_billing_cycle" required>' +
          '<option value="月"' + ((ct.billing_cycle || '月') === '月' ? ' selected' : '') + '>月费</option>' +
          '<option value="季"' + ((ct.billing_cycle || '月') === '季' ? ' selected' : '') + '>季费</option>' +
          '<option value="年"' + ((ct.billing_cycle || '月') === '年' ? ' selected' : '') + '>年费</option>' +
        '</select></div>' +
        '<div class="form-group full"><label>预计新到期日</label><input id="newEndDatePreview" type="date" value="' + defaultEnd + '" readonly style="background:#f1f5f9"></div>' +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-success" type="button" onclick="executeRenew(\'' + contractId + '\')">\u2705 确认续约</button></div></form>');

    setTimeout(function() {
      var f = document.querySelector('#renewForm');
      if (!f) return;
      var startInput = f.querySelector('[name="new_start_date"]');
      var durInput = f.querySelector('[name="new_duration_months"]');
      var preview = f.querySelector('#newEndDatePreview');
      function updatePreview() {
        var s = new Date(startInput.value);
        var months = parseInt(durInput.value) || 12;
        s.setMonth(s.getMonth() + months);
        preview.value = s.toISOString().split('T')[0];
      }
      startInput.addEventListener('change', updatePreview);
      durInput.addEventListener('change', updatePreview);
    }, 100);
  }).catch(function(e) {
    openModal('加载失败', '<p>' + e.message + '</p>');
  });
};

window.executeRenew = function(contractId) {
  var form = document.querySelector('#renewForm');
  var fd = formToObject(form);
  var data = {
    new_start_date: fd.new_start_date,
    new_duration_months: parseInt(fd.new_duration_months),
    new_billing_cycle: fd.new_billing_cycle || '月'
  };
  API.post('/api/contracts/' + contractId + '/renew', data).then(function(result) {
    closeModal();
    var msg = '✅ 续约成功！新合同 ' + result.new_contract_id + '，到期日 ' + result.new_end_date;
    if (result.wechat) {
      if (result.wechat.sent) {
        msg += '\n📱 微信通知已推送至客户';
      } else if (result.wechat.error) {
        msg += '\n⚠️ 微信推送失败: ' + result.wechat.error;
      } else if (result.wechat.note) {
        msg += '\n📋 ' + result.wechat.note;
      }
    }
    showAlert(msg);
    renderContracts();
    if (window.currentPage && window.currentPage() === 'dashboard') renderDashboard();
  }).catch(function(e) {
    showAlert('❌ 续约失败: ' + e.message);
  });
};

// 撤销续约（删除续约新合同，恢复原合同）
window.undoRenew = function(contractId) {
  showConfirm('⚠️ 确认撤销续约？\n\n将删除续约产生的新合同，原合同恢复为「已到期」状态。此操作不可逆！', function(confirmed) {
    if (!confirmed) return;
    API.post('/api/contracts/' + contractId + '/undo-renew', {}).then(function(result) {
      showAlert('✅ 撤销成功！已删除新合同 ' + result.deleted_contract + '，原合同 ' + result.reverted_contract + ' 已恢复');
      renderContracts();
      if (window.currentPage && window.currentPage() === 'dashboard') renderDashboard();
    }).catch(function(e) {
      showAlert('❌ 撤销失败: ' + e.message);
    });
  });
};

window.showContractForm = function(id) {
  var data = { contract_id: '', customer_id: '', biz_type: '\u5BBD\u5E26\u81EA\u8FD0\u8425', node_id: '', allocated_bw: '', start_date: '', duration_months: 12, monthly_fee: '', billing_cycle: '月' };
  var isEdit = false;

  function openForm(customers, nodes) {
    var custOpts = '';
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      var sel = data.customer_id === c.customer_id ? ' selected' : '';
      custOpts += '<option value="' + c.customer_id + '"' + sel + '>' + c.customer_id + ' - ' + c.company_name + '</option>';
    }
    var nodeOpts = '';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var sel = data.node_id === n.node_id ? ' selected' : '';
      nodeOpts += '<option value="' + n.node_id + '"' + sel + '>' + n.node_id + ' - ' + n.node_name + ' (' + n.node_type + ')</option>';
    }
    openModal(isEdit ? '编辑合同' : '新增合同',
      '<form id="contractForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">合同编号</label><input name="contract_id" value="' + data.contract_id + '" ' + (isEdit ? 'readonly style="background:#f1f5f9"' : 'required placeholder="如 HT-2026-010"') + '></div>' +
        '<div class="form-group"><label class="required">关联客户</label><select name="customer_id" required>' + custOpts + '</select></div>' +
        '<div class="form-group"><label class="required">业务线</label><select name="biz_type" required><option value="\u5BBD\u5E26\u81EA\u8FD0\u8425"' + (data.biz_type === '\u5BBD\u5E26\u81EA\u8FD0\u8425' ? ' selected' : '') + '>宽带自运营</option><option value="\u5BBD\u5E26\u76F4\u552E"' + (data.biz_type === '\u5BBD\u5E26\u76F4\u552E' ? ' selected' : '') + '>宽带直售</option><option value="IT\u5916\u5305"' + (data.biz_type === 'IT\u5916\u5305' ? ' selected' : '') + '>IT外包</option></select></div>' +
        '<div class="form-group"><label>安装项目位置</label><select name="node_id"><option value="">- 无 -</option>' + nodeOpts + '</select></div>' +
        '<div class="form-group"><label>分配带宽 (Mbps)</label><input name="allocated_bw" type="number" value="' + (data.allocated_bw || '') + '" placeholder="IT外包留空"></div>' +
        '<div class="form-group"><label class="required">生效日期</label><input name="start_date" type="date" value="' + data.start_date + '" required></div>' +
        '<div class="form-group"><label class="required">签约周期（月）</label><input name="duration_months" type="number" value="' + data.duration_months + '" required min="1"></div>' +
        '<div class="form-group"><label class="required">计费周期</label><select name="billing_cycle" required>' +
          '<option value="月"' + ((data.billing_cycle || '月') === '月' ? ' selected' : '') + '>月费</option>' +
          '<option value="季"' + ((data.billing_cycle || '月') === '季' ? ' selected' : '') + '>季费</option>' +
          '<option value="年"' + ((data.billing_cycle || '月') === '年' ? ' selected' : '') + '>年费</option>' +
        '</select></div>' +
        '<div class="form-group"><label class="required">费用 (元)</label><input name="monthly_fee" type="number" value="' + (data.monthly_fee || '') + '" required><span id="billingHint" class="text-xs text-secondary">当前为月费金额</span></div>' +
        '<div class="form-group full"><label>自动计算的到期日</label><input id="autoEndDate" type="date" readonly style="background:#f1f5f9;color:var(--primary);font-weight:600"><span class="text-xs text-secondary">\u26A0\uFE0F 到期日由系统根据【生效日+签约周期】自动计算，不可人工修改</span></div>' +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-primary" type="button" onclick="submitContract(\'' + isEdit + '\')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');

    setTimeout(function() {
      var f = document.querySelector('#contractForm');
      if (!f) return;
      var startInput = f.querySelector('[name="start_date"]');
      var durInput = f.querySelector('[name="duration_months"]');
      var preview = f.querySelector('#autoEndDate');
      function calcEnd() {
        if (!startInput.value || !durInput.value) { preview.value = ''; return; }
        var s = new Date(startInput.value);
        s.setMonth(s.getMonth() + parseInt(durInput.value));
        preview.value = s.toISOString().split('T')[0];
      }
      startInput.addEventListener('change', calcEnd);
      durInput.addEventListener('change', calcEnd);
      calcEnd();
      // 计费周期提示联动
      var cycleSelect = f.querySelector('[name="billing_cycle"]');
      var hint = f.querySelector('#billingHint');
      if (cycleSelect && hint) {
        function updateBillingHint() {
          var cycleLabels = { '月': '当前为月费金额', '季': '当前为季费金额（×3 = 年化' + ((parseInt(f.querySelector('[name=\"monthly_fee\"]').value) || 0) * 3).toLocaleString() + '）', '年': '当前为年费金额（月均' + ((parseInt(f.querySelector('[name=\"monthly_fee\"]').value) || 0) / 12).toLocaleString(undefined, {maximumFractionDigits:1}) + '）' };
          hint.textContent = cycleLabels[cycleSelect.value] || '';
        }
        cycleSelect.addEventListener('change', updateBillingHint);
        var feeInput = f.querySelector('[name="monthly_fee"]');
        if (feeInput) feeInput.addEventListener('input', updateBillingHint);
        updateBillingHint();
      }
    }, 100);
  }

  if (id) {
    API.get('/api/contracts/' + id).then(function(resp) {
      data = resp;
      isEdit = true;
      var p1 = API.get('/api/customers');
      var p2 = API.get('/api/spatial');
      var c = null, n = null;
      p1.then(function(d) { c = d; if (c && n) openForm(c, n); });
      p2.then(function(d) { n = d; if (c && n) openForm(c, n); });
    });
  } else {
    var p1 = API.get('/api/customers');
    var p2 = API.get('/api/spatial');
    var c = null, n = null;
    p1.then(function(d) { c = d; if (c && n) openForm(c, n); });
    p2.then(function(d) { n = d; if (c && n) openForm(c, n); });
  }
};

window.submitContract = function(isEdit) {
  var form = document.querySelector('#contractForm');
  var fd = formToObject(form);
  var data = {
    contract_id: fd.contract_id,
    customer_id: fd.customer_id,
    biz_type: fd.biz_type,
    node_id: fd.node_id || null,
    allocated_bw: fd.allocated_bw ? parseInt(fd.allocated_bw) : null,
    start_date: fd.start_date,
    duration_months: parseInt(fd.duration_months),
    monthly_fee: parseFloat(fd.monthly_fee) || 0,
    billing_cycle: fd.billing_cycle || '月'
  };
  var req = (isEdit === 'true' || isEdit === true)
    ? API.put('/api/contracts/' + data.contract_id, data)
    : API.post('/api/contracts', data);
  req.then(function() {
    closeModal();
    renderContracts();
    if (window.currentPage && window.currentPage() === 'dashboard') renderDashboard();
  });
};

// ===== 批量删除 =====
function attachContractCheckboxListeners() {
  var checkboxes = document.querySelectorAll('.contract-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener('change', function() {
      updateContractBatchBar();
      syncContractSelectAll();
    });
  }
}

function syncContractSelectAll() {
  var allCheckboxes = document.querySelectorAll('.contract-checkbox');
  var allChecked = allCheckboxes.length > 0;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var headerCheckbox = document.getElementById('contractSelectAll');
  if (headerCheckbox) headerCheckbox.checked = allChecked;
}

function updateContractBatchBar() {
  var checked = document.querySelectorAll('.contract-checkbox:checked');
  var bar = document.getElementById('contractBatchBar');
  var countEl = document.getElementById('contractBatchCount');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    countEl.textContent = '已选择 ' + checked.length + ' 项';
  } else {
    bar.style.display = 'none';
  }
}

window.toggleSelectAllContract = function() {
  var allCheckboxes = document.querySelectorAll('.contract-checkbox');
  var allChecked = true;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var newState = !allChecked;
  for (var i = 0; i < allCheckboxes.length; i++) {
    allCheckboxes[i].checked = newState;
  }
  var headerCheckbox = document.getElementById('contractSelectAll');
  if (headerCheckbox) headerCheckbox.checked = newState;
  updateContractBatchBar();
};

window.clearContractSelection = function() {
  var checkboxes = document.querySelectorAll('.contract-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = false;
  }
  var headerCheckbox = document.getElementById('contractSelectAll');
  if (headerCheckbox) headerCheckbox.checked = false;
  updateContractBatchBar();
};

window.batchDeleteContract = function() {
  var checked = document.querySelectorAll('.contract-checkbox:checked');
  if (checked.length === 0) return;
  var ids = [];
  for (var i = 0; i < checked.length; i++) {
    ids.push(checked[i].value);
  }
  showConfirm('确认删除已选择的 ' + ids.length + ' 个合同？', function(confirmed) {
    if (!confirmed) return;
    API.post('/api/contracts/batch-delete', { ids: ids }).then(function(result) {
      showAlert('成功删除 ' + result.count + ' 个合同');
      renderContracts();
    }).catch(function(e) {
      showAlert('批量删除失败: ' + e.message);
    });
  });
};
