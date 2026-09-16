// ===== 运营商资源管理（ES5 兼容）=====
window._supplierSearch = '';
// 临时存储上传的照片文件名（用于新建/编辑时暂存）
var _pendingPhotos = [];

function renderSuppliers() {
  var body = $('contentBody');
  API.get('/api/suppliers?search=' + encodeURIComponent(window._supplierSearch || '')).then(function(data) {
    var rows = '';
    for (var i = 0; i < data.length; i++) {
      var l = data[i];
      var days = daysBetween(l.expire_date);
      var dayCls = days <= 30 ? (days <= 15 ? 'danger' : 'warning') : 'success';
      var photos = parsePhotos(l.device_photos);
      var photoPreview = photos.length > 0
        ? '<span style="cursor:pointer;color:#3b82f6" onclick="showSupplierPhotos(\'' + l.line_id + '\')">\uD83D\uDDBC \u00D7' + photos.length + '</span>'
        : '';
      rows += '<tr>' +
        '<td><input type="checkbox" class="supplier-checkbox" value="' + l.line_id + '"></td>' +
        '<td><strong>' + l.line_id + '</strong></td>' +
        '<td><span class="badge info">' + l.provider + '</span></td>' +
        '<td>' + escapeHtml(l.circuit_number) + '</td>' +
        '<td>' + l.total_bandwidth + ' Mbps</td>' +
        '<td>' + l.purchase_date + '</td>' +
        '<td>' + l.expire_date + '</td>' +
        '<td><span class="badge ' + dayCls + '">' + days + '天</span></td>' +
        '<td>\u00A5' + (l.cost_annual || 0).toLocaleString() + '</td>' +
        '<td style="max-width:140px;font-size:13px;color:#64748b">' + escapeHtml(l.install_location || '-') + '</td>' +
        '<td style="max-width:120px;font-size:13px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(l.remarks || '') + '">' + escapeHtml(truncateText(l.remarks, 15) || '-') + '</td>' +
        '<td>' + photoPreview + '</td>' +
        '<td>' +
          '<button class="btn btn-sm btn-ghost" onclick="window.showSupplierForm(\'' + l.line_id + '\')">编辑</button>' +
          '<button class="btn btn-sm btn-danger" onclick="window.deleteSupplier(\'' + l.line_id + '\')">删除</button>' +
        '</td></tr>';
    }
    var searchHtml = '<div style="display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--border);align-items:center">' +
      '<input id="supplierSearchInput" type="text" placeholder="搜索线路编号/运营商/电路编号..." value="' + (window._supplierSearch || '') + '" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px">' +
      '<button class="btn btn-sm btn-ghost" onclick="doSupplierSearch()">搜索</button>' +
      '<button class="btn btn-sm btn-outline" onclick="resetSupplierSearch()">重置</button></div>';
    var batchBar = '<div id="supplierBatchBar" class="batch-bar" style="display:none">' +
      '<span id="supplierBatchCount">已选择 0 项</span>' +
      '<button class="btn btn-sm btn-danger" onclick="batchDeleteSupplier()">批量删除</button>' +
      '<button class="btn btn-sm btn-outline" onclick="clearSupplierSelection()">取消选择</button></div>';
    body.innerHTML =
      '<div class="card">' +
        '<div class="card-header">' +
          '<h3>\uD83D\uDCE1 运营商线路列表</h3>' +
          '<div class="btn-group">' +
            '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/suppliers/template\', \'资源管理_导入模板.xlsx\')" title="下载导入模板">模板</button>' +
            '<button class="btn btn-sm btn-outline" onclick="downloadCSV(\'/api/suppliers/export\', \'资源管理_运营商线路.xlsx\')" title="导出为Excel">导出</button>' +
            '<button class="btn btn-sm btn-outline" onclick="importCSV(\'/api/suppliers/import\', \'资源\')" title="从CSV导入">导入</button>' +
            '<button class="btn btn-primary btn-sm" onclick="window.showSupplierForm()">+ 新增线路</button></div></div>' +
        '<div class="card-body" style="padding:0">' + searchHtml + batchBar +
        '<div class="table-wrapper"><table>' +
          '<thead><tr><th style="width:36px;text-align:center"><input type="checkbox" id="supplierSelectAll" onclick="toggleSelectAllSupplier()"></th><th>线路编号</th><th>运营商</th><th>电路编号</th><th>总带宽</th><th>采购日期</th><th>到期日</th><th>剩余天数</th><th>年成本</th><th>安装位置</th><th>备注</th><th>照片</th><th>操作</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div></div></div>';
    attachSupplierCheckboxListeners();
    var searchInput = document.getElementById('supplierSearchInput');
    if (searchInput) {
      searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSupplierSearch(); });
    }
  }).catch(function(e) {
    body.innerHTML = '<div class="empty-state"><p>加载失败: ' + e.message + '</p></div>';
  });
}

// 截断文本（超长加...）
function truncateText(text, maxLen) {
  if (!text) return text;
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

// 解析 device_photos 字段
function parsePhotos(photosVal) {
  if (!photosVal) return [];
  try { return JSON.parse(photosVal); }
  catch(e) { return []; }
}

// 展示设备照片
window.showSupplierPhotos = function(lineId) {
  API.get('/api/suppliers/' + lineId).then(function(l) {
    var photos = parsePhotos(l.device_photos);
    if (photos.length === 0) { showAlert('该线路暂无设备照片'); return; }
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:12px">';
    for (var i = 0; i < photos.length; i++) {
      var f = typeof photos[i] === 'string' ? photos[i] : '';
      html += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">' +
        '<img src="/uploads/' + f + '" style="width:100%;height:180px;object-fit:cover;display:block">' +
        '</div>';
    }
    html += '</div>';
    openModal('\uD83D\uDDBC ' + lineId + ' - 设备照片', html);
  });
};

function doSupplierSearch() {
  var input = document.getElementById('supplierSearchInput');
  window._supplierSearch = input ? input.value.trim() : '';
  renderSuppliers();
}

function resetSupplierSearch() {
  window._supplierSearch = '';
  renderSuppliers();
}

window.showSupplierForm = function(id) {
  var data = { line_id: '', provider: '\u4E2D\u56FD\u7535\u4FE1', circuit_number: '', total_bandwidth: '', purchase_date: '', expire_date: '', cost_annual: '', device_photos: '[]', install_location: '', remarks: '' };
  var isEdit = false;
  _pendingPhotos = [];

  var providerPrefixes = {
    '\u4E2D\u56FD\u7535\u4FE1': 'CT',
    '\u4E2D\u56FD\u8054\u901A': 'CU',
    '\u4E2D\u56FD\u79FB\u52A8': 'CM'
  };

  function openForm() {
    var existingPhotos = isEdit ? parsePhotos(data.device_photos) : [];
    var photosHtml = '<div class="form-group full"><label>\uD83D\uDDBC 设备照片（支持多张）</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px" id="photoPreview">';
    for (var p = 0; p < existingPhotos.length; p++) {
      photosHtml += '<div class="photo-thumb" style="position:relative;width:100px;height:80px;border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
        '<img src="/uploads/' + existingPhotos[p] + '" style="width:100%;height:100%;object-fit:cover">' +
        '<span style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,.8);color:#fff;border-radius:50%;width:18px;height:18px;font-size:12px;line-height:18px;text-align:center;cursor:pointer" onclick="removeSupplierPhoto(this,\'' + existingPhotos[p] + '\')">\u00D7</span></div>';
    }
    photosHtml += '</div>' +
      '<input type="file" accept="image/*" multiple onchange="previewSupplierPhotos(this)" style="font-size:13px">' +
      '<span class="text-xs text-secondary" style="margin-left:8px">支持 JPG/PNG，单张最大 2MB</span></div>';

    openModal(isEdit ? '编辑运营商线路' : '新增运营商线路',
      '<form id="supplierForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">线路编号</label><input name="line_id" value="' + data.line_id + '"' + (isEdit ? ' readonly style="background:#f1f5f9"' : ' required placeholder="选择运营商后自动生成前缀"') + '></div>' +
        '<div class="form-group"><label class="required">运营商</label><select name="provider" required><option value="\u4E2D\u56FD\u7535\u4FE1"' + (data.provider === '\u4E2D\u56FD\u7535\u4FE1' ? ' selected' : '') + '>\u4E2D\u56FD\u7535\u4FE1</option><option value="\u4E2D\u56FD\u8054\u901A"' + (data.provider === '\u4E2D\u56FD\u8054\u901A' ? ' selected' : '') + '>\u4E2D\u56FD\u8054\u901A</option><option value="\u4E2D\u56FD\u79FB\u52A8"' + (data.provider === '\u4E2D\u56FD\u79FB\u52A8' ? ' selected' : '') + '>\u4E2D\u56FD\u79FB\u52A8</option></select></div>' +
        '<div class="form-group"><label class="required">电路编号</label><input name="circuit_number" required value="' + escapeHtml(data.circuit_number) + '" placeholder="如 SZ-TEL-10G-005"></div>' +
        '<div class="form-group"><label class="required">总带宽 (Mbps)</label><input name="total_bandwidth" type="number" required value="' + data.total_bandwidth + '"></div>' +
        '<div class="form-group"><label class="required">采购日期</label><input name="purchase_date" type="date" required value="' + data.purchase_date + '"></div>' +
        '<div class="form-group"><label class="required">到期日期</label><input name="expire_date" type="date" required value="' + data.expire_date + '"></div>' +
        '<div class="form-group"><label>年采购成本 (元)</label><input name="cost_annual" type="number" value="' + data.cost_annual + '" placeholder="0"></div>' +
        '<div class="form-group full"><label>\uD83D\uDCCD 设备安装位置</label><input name="install_location" value="' + escapeHtml(data.install_location || '') + '" placeholder="如：南山科技园A区机房F-12机柜"></div>' +
        '<div class="form-group full"><label>\uD83D\uDCDD 备注</label><textarea name="remarks" rows="3" placeholder="其他需要记录的信息..." style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px;resize:vertical">' + escapeHtml(data.remarks || '') + '</textarea></div>' +
        photosHtml +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-primary" type="button" onclick="submitSupplier(\'' + isEdit + '\')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');

    if (!isEdit) {
      setTimeout(function() {
        var providerSelect = document.querySelector('#supplierForm [name="provider"]');
        var lineIdInput = document.querySelector('#supplierForm [name="line_id"]');
        if (!providerSelect || !lineIdInput) return;
        function updateLineIdPrefix() {
          var prefix = providerPrefixes[providerSelect.value] || '';
          var currentVal = lineIdInput.value;
          var stripped = currentVal;
          var allPrefixes = [''];
          for (var k in providerPrefixes) { allPrefixes.push(providerPrefixes[k]); }
          for (var i = 0; i < allPrefixes.length; i++) {
            var oldP = allPrefixes[i];
            if (oldP && (stripped.indexOf(oldP + '-') === 0)) {
              stripped = stripped.substring(oldP.length + 1);
              break;
            }
          }
          lineIdInput.value = prefix ? prefix + '-' + stripped : stripped;
          if (!prefix && !stripped) lineIdInput.value = '';
        }
        providerSelect.addEventListener('change', updateLineIdPrefix);
        var initPrefix = providerPrefixes[providerSelect.value] || '';
        if (initPrefix && !lineIdInput.value) { lineIdInput.value = initPrefix + '-'; }
      }, 100);
    }
  }
  if (id) {
    API.get('/api/suppliers/' + id).then(function(resp) {
      data = resp;
      isEdit = true;
      _pendingPhotos = parsePhotos(data.device_photos);
      openForm();
    });
  } else {
    openForm();
  }
};

// 预览新选的照片
window.previewSupplierPhotos = function(input) {
  var container = document.getElementById('photoPreview');
  if (!container) return;
  var files = input.files;
  for (var i = 0; i < files.length; i++) {
    (function(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var dataUrl = e.target.result;
        // 估算大小
        if (dataUrl.length > 2.8 * 1024 * 1024) { showAlert('\u26A0\uFE0F 图片过大（' + file.name + '），请压缩后上传'); return; }
        // 存储 base64 数据，稍后上传
        var idx = _pendingPhotos.length;
        _pendingPhotos.push(dataUrl);
        var div = document.createElement('div');
        div.className = 'photo-thumb';
        div.style.cssText = 'position:relative;width:100px;height:80px;border:1px solid var(--border);border-radius:6px;overflow:hidden';
        div.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover">' +
          '<span style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,.8);color:#fff;border-radius:50%;width:18px;height:18px;font-size:12px;line-height:18px;text-align:center;cursor:pointer" onclick="removeSupplierPhoto(this, ' + idx + ')">\u00D7</span>';
        container.appendChild(div);
      };
      reader.readAsDataURL(file);
    })(files[i]);
  }
  input.value = '';
};

// 移除照片（支持已有照片和新上传的）
window.removeSupplierPhoto = function(el, identifier) {
  var div = el.parentNode;
  if (div.parentNode) div.parentNode.removeChild(div);
  var idx = _pendingPhotos.indexOf(identifier);
  if (idx >= 0) _pendingPhotos.splice(idx, 1);
};

window.submitSupplier = function(isEdit) {
  var form = document.querySelector('#supplierForm');
  var fd = formToObject(form);
  var pendingBase64s = [];
  var savedFileNames = [];

  // 分离已有文件名和新上传的 base64
  for (var i = 0; i < _pendingPhotos.length; i++) {
    var p = _pendingPhotos[i];
    if (p && p.indexOf('data:image/') === 0) {
      pendingBase64s.push(p);
    } else if (p) {
      savedFileNames.push(p);
    }
  }

  var submitData = function(extraFiles) {
    var allFiles = savedFileNames.concat(extraFiles || []);
    var payload = {
      line_id: fd.line_id,
      provider: fd.provider,
      circuit_number: fd.circuit_number,
      total_bandwidth: parseInt(fd.total_bandwidth),
      purchase_date: fd.purchase_date,
      expire_date: fd.expire_date,
      cost_annual: parseFloat(fd.cost_annual) || 0,
      device_photos: allFiles,
      install_location: fd.install_location || '',
      remarks: fd.remarks || ''
    };
    var req = (isEdit === 'true' || isEdit === true)
      ? API.put('/api/suppliers/' + payload.line_id, payload)
      : API.post('/api/suppliers', payload);
    req.then(function() {
      closeModal();
      renderSuppliers();
    }).catch(function(e) {
      showAlert('保存失败: ' + e.message);
    });
  };

  if (pendingBase64s.length > 0) {
    // 先把新照片上传到服务器
    API.post('/api/suppliers/upload-photos', { photos: pendingBase64s }).then(function(result) {
      var uploaded = result.files || [];
      var filenames = [];
      for (var i = 0; i < uploaded.length; i++) {
        if (typeof uploaded[i] === 'string') filenames.push(uploaded[i]);
      }
      submitData(filenames);
    }).catch(function(e) {
      showAlert('照片上传失败: ' + e.message);
    });
  } else {
    submitData([]);
  }
};

window.deleteSupplier = function(id) {
  showConfirm('确认删除线路 ' + id + '？', function(confirmed) {
    if (!confirmed) return;
    API.del('/api/suppliers/' + id).then(function() {
      renderSuppliers();
    }).catch(function(e) {
      showAlert('删除失败: ' + e.message);
    });
  });
};

// ===== 批量删除 =====
function attachSupplierCheckboxListeners() {
  var checkboxes = document.querySelectorAll('.supplier-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener('change', function() {
      updateSupplierBatchBar();
      syncSupplierSelectAll();
    });
  }
}

function syncSupplierSelectAll() {
  var allCheckboxes = document.querySelectorAll('.supplier-checkbox');
  var allChecked = allCheckboxes.length > 0;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var headerCheckbox = document.getElementById('supplierSelectAll');
  if (headerCheckbox) headerCheckbox.checked = allChecked;
}

function updateSupplierBatchBar() {
  var checked = document.querySelectorAll('.supplier-checkbox:checked');
  var bar = document.getElementById('supplierBatchBar');
  var countEl = document.getElementById('supplierBatchCount');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    countEl.textContent = '已选择 ' + checked.length + ' 项';
  } else {
    bar.style.display = 'none';
  }
}

window.toggleSelectAllSupplier = function() {
  var allCheckboxes = document.querySelectorAll('.supplier-checkbox');
  var allChecked = true;
  for (var i = 0; i < allCheckboxes.length; i++) {
    if (!allCheckboxes[i].checked) { allChecked = false; break; }
  }
  var newState = !allChecked;
  for (var i = 0; i < allCheckboxes.length; i++) {
    allCheckboxes[i].checked = newState;
  }
  var headerCheckbox = document.getElementById('supplierSelectAll');
  if (headerCheckbox) headerCheckbox.checked = newState;
  updateSupplierBatchBar();
};

window.clearSupplierSelection = function() {
  var checkboxes = document.querySelectorAll('.supplier-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = false;
  }
  var headerCheckbox = document.getElementById('supplierSelectAll');
  if (headerCheckbox) headerCheckbox.checked = false;
  updateSupplierBatchBar();
};

window.batchDeleteSupplier = function() {
  var checked = document.querySelectorAll('.supplier-checkbox:checked');
  if (checked.length === 0) return;
  var ids = [];
  for (var i = 0; i < checked.length; i++) {
    ids.push(checked[i].value);
  }
  showConfirm('确认删除已选择的 ' + ids.length + ' 个线路？', function(confirmed) {
    if (!confirmed) return;
    API.post('/api/suppliers/batch-delete', { ids: ids }).then(function(result) {
      showAlert('成功删除 ' + result.count + ' 个线路');
      renderSuppliers();
    }).catch(function(e) {
      showAlert('批量删除失败: ' + e.message);
    });
  });
};
