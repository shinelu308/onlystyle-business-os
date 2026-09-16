// ===== 项目管理（支持多线路）=====
window._spatialSearch = '';

function renderSpatial() {
  var body = $('contentBody');
  API.get('/api/spatial?search=' + encodeURIComponent(window._spatialSearch || '')).then(function(data) {
    var rows = '';
    for (var i = 0; i < data.length; i++) {
      var s = data[i];
      var linesHtml = '';
      if (s.lines && s.lines.length > 0) {
        var lineLabels = [];
        for (var li = 0; li < s.lines.length; li++) {
          var l = s.lines[li];
          lineLabels.push('<span class="badge secondary" style="margin:1px">' + l.line_id + '</span>');
        }
        linesHtml = lineLabels.join(' ');
      } else {
        linesHtml = '<span class="text-secondary">-</span>';
      }
      var circuitInfo = '';
      var expireInfo = '';
      if (s.lines && s.lines.length > 0) {
        var circuits = [];
        var expires = [];
        for (var li = 0; li < s.lines.length; li++) {
          var l = s.lines[li];
          circuits.push(escapeHtml(l.circuit_number || '-'));
          var d = daysBetween(l.line_expire_date);
          var cls = d <= 30 ? (d <= 15 ? 'danger' : 'warning') : 'success';
          expires.push(l.line_expire_date + ' <span class="badge ' + cls + '">' + d + '天</span>');
        }
        circuitInfo = circuits.join('<br>');
        expireInfo = expires.join('<br>');
      } else {
        circuitInfo = '-';
        expireInfo = '-';
      }
      rows += '<tr>' +
        '<td><input type="checkbox" class="spatial-checkbox" value="' + s.node_id + '"></td>' +
        '<td><strong>' + s.node_id + '</strong></td>' +
        '<td>' + escapeHtml(s.node_name) + '</td>' +
        '<td><span class="badge info">' + s.node_type + '</span></td>' +
        '<td>' + linesHtml + '</td>' +
        '<td>' + circuitInfo + '</td>' +
        '<td>' + expireInfo + '</td>' +
        '<td><div class="btn-group">' +
          '<button class="btn btn-sm btn-ghost" onclick="showSpatialForm(\'' + s.node_id + '\')">编辑</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteSpatial(\'' + s.node_id + '\')">删除</button>' +
        '</div></td></tr>';
    }
    var searchHtml = '<div style="display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--border);align-items:center">' +
      '<input id="spatialSearchInput" type="text" placeholder="搜索节点编号/项目名称/类型..." value="' + (window._spatialSearch || '') + '" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px">' +
      '<button class="btn btn-sm btn-ghost" onclick="doSpatialSearch()">搜索</button>' +
      '<button class="btn btn-sm btn-outline" onclick="resetSpatialSearch()">重置</button></div>';
    var batchBar = '<div id="batchDeleteBar" class="batch-bar" style="display:none">' +
      '<span id="batchCount">已选择 0 项</span>' +
      '<button class="btn btn-sm btn-danger" onclick="batchDeleteSpatial()">批量删除</button>' +
      '<button class="btn btn-sm btn-outline" onclick="clearSpatialSelection()">取消选择</button></div>';
    body.innerHTML =
      '<div class="card">' +
        '<div class="card-header"><h3>\uD83C\uDFD7\uFE0F 项目列表</h3>' +
          '<div class="btn-group">' +
            '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/spatial/template\', \'项目管理_导入模板.xlsx\')" title="下载导入模板">模板</button>' +
            '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/spatial/export\', \'项目管理_空间节点.xlsx\')" title="导出为Excel">导出</button>' +
            '<button class="btn btn-sm btn-outline" onclick="importCSV(\'/api/spatial/import\', \'项目\')" title="从CSV导入">导入</button>' +
            '<button class="btn btn-sm btn-primary" onclick="showSpatialForm()">+ 新增节点</button></div></div>' +
        '<div class="card-body" style="padding:0">' + searchHtml + batchBar +
        '<div class="table-wrapper"><table>' +
          '<thead><tr><th style="width:36px;text-align:center"><input type="checkbox" id="spatialSelectAll" onclick="toggleSelectAllSpatial()"></th><th>节点编号</th><th>项目名称</th><th>类型</th><th>承载线路</th><th>电路编号</th><th>线路到期日</th><th>操作</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div></div></div>';
    attachSpatialCheckboxListeners();
    var searchInput = document.getElementById('spatialSearchInput');
    if (searchInput) {
      searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSpatialSearch(); });
    }
  }).catch(function(e) {
    body.innerHTML = '<div class="empty-state"><p>\u274C 加载失败: ' + e.message + '</p></div>';
  });
}

function doSpatialSearch() {
  var input = document.getElementById('spatialSearchInput');
  window._spatialSearch = input ? input.value.trim() : '';
  renderSpatial();
}

function resetSpatialSearch() {
  window._spatialSearch = '';
  renderSpatial();
}

window.showSpatialForm = function(id) {
  var data = { node_id: '', node_name: '', node_type: '\u56ED\u533A', lines: [] };
  var isEdit = false;

  function afterLoad() {
    API.get('/api/suppliers').then(function(lines) {
      var selectedIds = {};
      if (data.lines) {
        for (var si = 0; si < data.lines.length; si++) {
          selectedIds[data.lines[si].line_id || data.lines[si]] = true;
        }
      }
      var lineCheckboxes = '';
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        var checked = selectedIds[l.line_id] ? ' checked' : '';
        lineCheckboxes += '<label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:13px;cursor:pointer">' +
          '<input type="checkbox" name="line_ids" value="' + l.line_id + '"' + checked + ' style="width:16px;height:16px"> ' +
          l.line_id + ' - ' + escapeHtml(l.circuit_number) + ' (' + l.provider + ') ' + l.total_bandwidth + 'Mbps</label>';
      }
      openModal(isEdit ? '编辑项目' : '新增项目',
        '<form id="spatialForm" class="form-grid" onsubmit="return false">' +
          '<div class="form-group"><label class="required">节点编号</label>' +
            '<input name="node_id" value="' + data.node_id + '" ' + (isEdit ? 'readonly style="background:#f1f5f9"' : 'required placeholder="如 NODE-010"') + '></div>' +
          '<div class="form-group"><label class="required">项目名称</label>' +
            '<input name="node_name" required value="' + escapeHtml(data.node_name) + '" placeholder="如 腾讯科技园A区"></div>' +
          '<div class="form-group"><label class="required">项目类型</label>' +
            '<select name="node_type">' +
              '<option value="园区"' + (data.node_type === '园区' ? ' selected' : '') + '>园区</option>' +
              '<option value="单体楼宇"' + (data.node_type === '单体楼宇' ? ' selected' : '') + '>单体楼宇</option>' +
              '<option value="独立散点"' + (data.node_type === '独立散点' ? ' selected' : '') + '>独立散点</option>' +
            '</select></div>' +
          '<div class="form-group full"><label>承载线路（可多选）</label>' +
            '<div style="border:1px solid var(--border);border-radius:var(--r-lg);padding:10px 14px;max-height:200px;overflow-y:auto">' + lineCheckboxes + '</div></div>' +
          '<div class="form-actions full">' +
            '<button class="btn btn-outline" type="button" onclick="closeModal()">取消</button>' +
            '<button class="btn btn-primary" type="button" onclick="submitSpatial(\'' + isEdit + '\')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');
    });
  }

  if (id) {
    API.get('/api/spatial/' + id).then(function(resp) {
      data = resp;
      isEdit = true;
      afterLoad();
    });
  } else {
    afterLoad();
  }
};

window.submitSpatial = function(isEdit) {
  var form = document.querySelector('#spatialForm');
  var data = formToObject(form);
  var checkboxes = form.querySelectorAll('input[name="line_ids"]:checked');
  var lines = [];
  for (var i = 0; i < checkboxes.length; i++) {
    lines.push(checkboxes[i].value);
  }
  data.lines = lines;
  var req = (isEdit === 'true' || isEdit === true)
    ? API.put('/api/spatial/' + data.node_id, data)
    : API.post('/api/spatial', data);
  req.then(function() {
    closeModal();
    renderSpatial();
  });
};

window.deleteSpatial = function(id) {
  showConfirm('\u786E\u8BA4\u5220\u9664\u8282\u70B9 ' + id + '\uFF1F', function(confirmed) {
    if (!confirmed) return;
    API.del('/api/spatial/' + id).then(function() {
      renderSpatial();
    }).catch(function(e) {
      showAlert('\u5220\u9664\u5931\u8D25: ' + e.message);
    });
  });
};

// ===== 批量删除 =====
function attachSpatialCheckboxListeners() {
  var checkboxes = document.querySelectorAll('.spatial-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener('change', function() {
      updateSpatialBatchBar();
      syncSpatialSelectAll();
    });
  }
}

function syncSpatialSelectAll() {
  var allCheckboxes = document.querySelectorAll('.spatial-checkbox');
  var allChecked = allCheckboxes.length > 0;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var headerCheckbox = document.getElementById('spatialSelectAll');
  if (headerCheckbox) headerCheckbox.checked = allChecked;
}

function updateSpatialBatchBar() {
  var checked = document.querySelectorAll('.spatial-checkbox:checked');
  var bar = document.getElementById('batchDeleteBar');
  var countEl = document.getElementById('batchCount');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    countEl.textContent = '\u5DF2\u9009\u62E9 ' + checked.length + ' \u9879';
  } else {
    bar.style.display = 'none';
  }
}

window.toggleSelectAllSpatial = function() {
  var allCheckboxes = document.querySelectorAll('.spatial-checkbox');
  var allChecked = true;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var newState = !allChecked;
  for (var i = 0; i < allCheckboxes.length; i++) {
    allCheckboxes[i].checked = newState;
  }
  var headerCheckbox = document.getElementById('spatialSelectAll');
  if (headerCheckbox) headerCheckbox.checked = newState;
  updateSpatialBatchBar();
};

window.clearSpatialSelection = function() {
  var checkboxes = document.querySelectorAll('.spatial-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = false;
  }
  var headerCheckbox = document.getElementById('spatialSelectAll');
  if (headerCheckbox) headerCheckbox.checked = false;
  updateSpatialBatchBar();
};

window.batchDeleteSpatial = function() {
  var checked = document.querySelectorAll('.spatial-checkbox:checked');
  if (checked.length === 0) return;
  var ids = [];
  for (var i = 0; i < checked.length; i++) {
    ids.push(checked[i].value);
  }
  showConfirm('\u786E\u8BA4\u5220\u9664\u5DF2\u9009\u62E9\u7684 ' + ids.length + ' \u4E2A\u8282\u70B9\uFF1F', function(confirmed) {
    if (!confirmed) return;
    API.post('/api/spatial/batch-delete', { ids: ids }).then(function(result) {
      showAlert('\u6210\u529F\u5220\u9664 ' + result.count + ' \u4E2A\u8282\u70B9');
      renderSpatial();
    }).catch(function(e) {
      showAlert('\u6279\u91CF\u5220\u9664\u5931\u8D25: ' + e.message);
    });
  });
};
