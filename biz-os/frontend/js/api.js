// ===== API 客户端（ES5 兼容 — 增加错误详情） =====
var API = {
  get: function(url) {
    return fetch(url).then(function(res) {
      if (!res.ok) return res.json().then(function(err) { throw new Error(err.error || err.message || 'GET ' + url + ' 失败: ' + res.status); });
      return res.json();
    });
  },
  post: function(url, data) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(res) {
      if (!res.ok) return res.json().then(function(err) { throw new Error(err.error || err.message || 'POST ' + url + ' 失败: ' + res.status); });
      return res.json();
    }).catch(function(e) {
      console.error('[API] POST ' + url + ' error:', e);
      throw e;
    });
  },
  put: function(url, data) {
    return fetch(url, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(res) {
      if (!res.ok) return res.json().then(function(err) { throw new Error(err.error || err.message || 'PUT ' + url + ' 失败: ' + res.status); });
      return res.json();
    });
  },
  del: function(url) {
    return fetch(url, { method: 'DELETE' }).then(function(res) {
      if (!res.ok) return res.json().then(function(err) { throw new Error(err.error || err.message || 'DELETE ' + url + ' 失败: ' + res.status); });
      return res.json();
    });
  }
};

// ===== 内容中台后台接口（带 X-Admin-Token）=====
// 内容写接口必须鉴权：令牌由登录接口签发，存在 sessionStorage.bos_content_token。
// 与 API.get/post/put/del 的区别有两点：
//   ① 自动带 X-Admin-Token；
//   ② 自动拆 { ok, data } 信封 —— 内容接口失败时是 HTTP 200 + {ok:false}，
//      不拆的话页面会把错误对象当数据渲染，症状是「表格里一堆 undefined」。
var CONTENT_TOKEN_KEY = 'bos_content_token';

function contentToken(token) {
  if (token === undefined) return sessionStorage.getItem(CONTENT_TOKEN_KEY) || '';
  if (token) sessionStorage.setItem(CONTENT_TOKEN_KEY, token);
  else sessionStorage.removeItem(CONTENT_TOKEN_KEY);
}

function _contentHeaders() {
  var h = { 'Content-Type': 'application/json' };
  var t = contentToken();
  if (t) h['X-Admin-Token'] = t;
  return h;
}

function _contentHandle(res, url) {
  return res.json().then(function(j) {
    if (j && j.ok === false) throw new Error(j.error || ('内容接口失败: ' + url));
    if (!res.ok) throw new Error((j && j.error) || ('请求失败 ' + res.status + ': ' + url));
    return j && j.ok === true ? j.data : j;
  }, function() {
    throw new Error('响应不是合法 JSON: ' + url + ' (' + res.status + ')');
  });
}

API.content = {
  get: function(url) {
    return fetch(url, { headers: _contentHeaders() }).then(function(r) { return _contentHandle(r, url); });
  },
  post: function(url, data) {
    return fetch(url, { method: 'POST', headers: _contentHeaders(), body: JSON.stringify(data || {}) })
      .then(function(r) { return _contentHandle(r, url); });
  },
  put: function(url, data) {
    return fetch(url, { method: 'PUT', headers: _contentHeaders(), body: JSON.stringify(data || {}) })
      .then(function(r) { return _contentHandle(r, url); });
  },
  del: function(url) {
    return fetch(url, { method: 'DELETE', headers: _contentHeaders() }).then(function(r) { return _contentHandle(r, url); });
  }
};

// ===== 工具函数 =====
function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  if (!str) return '';
  var map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return String(str).replace(/[&<>"']/g, function(c) { return map[c]; });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  var d = new Date(dateStr);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1);
  var day = String(d.getDate());
  if (m.length < 2) m = '0' + m;
  if (day.length < 2) day = '0' + day;
  return y + '-' + m + '-' + day;
}

function daysBetween(dateStr) {
  var today = new Date(); today.setHours(0,0,0,0);
  var target = new Date(dateStr); target.setHours(0,0,0,0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function statusBadge(status) {
  var map = {
    '\u8FDB\u884C\u4E2D': 'success',
    '\u5373\u5C06\u5230\u671F': 'warning',
    '\u5DF2\u5230\u671F': 'danger',
    '\u5DF2\u7EED\u7EA6': 'info'
  };
  var cls = map[status] || 'secondary';
  return '<span class="badge ' + cls + '">' + status + '</span>';
}

function openModal(title, html) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modal').classList.add('show');
  $('modalBackdrop').classList.add('show');
}

function closeModal() {
  $('modal').classList.remove('show');
  $('modalBackdrop').classList.remove('show');
}

// ===== 系统内置对话框（替代浏览器 alert/confirm）=====
function showAlert(message, title) {
  if (!title) title = '\u63D0\u793A';
  $('dialogTitle').textContent = title;
  $('dialogBody').textContent = message;
  $('dialogFooter').innerHTML = '<button class="btn btn-primary" onclick="closeDialog()">\u786E\u5B9A</button>';
  $('dialog').classList.add('show');
  $('dialogBackdrop').classList.add('show');
}

function showConfirm(message, callback, title) {
  if (!title) title = '\u786E\u8BA4\u64CD\u4F5C';
  $('dialogTitle').textContent = title;
  $('dialogBody').textContent = message;
  $('dialogFooter').innerHTML =
    '<button class="btn btn-outline" onclick="closeDialog()">\u53D6\u6D88<\/button>' +
    '<button class="btn btn-danger" onclick="confirmAction(true)">\u786E\u5B9A<\/button>';
  window._confirmCallback = callback;
  $('dialog').classList.add('show');
  $('dialogBackdrop').classList.add('show');
}

function closeDialog() {
  $('dialog').classList.remove('show');
  $('dialogBackdrop').classList.remove('show');
  window._confirmCallback = null;
}

function confirmAction(result) {
  var cb = window._confirmCallback;
  closeDialog();
  if (typeof cb === 'function') {
    cb(result);
  }
}

// ===== CSV / XLSX 导入导出工具 =====
function downloadCSV(url, filename) {
  fetch(url).then(function(res) {
    if (!res.ok) throw new Error('下载失败');
    return res.blob();
  }).then(function(blob) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'export.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
  }).catch(function(e) {
    showAlert('下载失败: ' + e.message);
  });
}

/** 将 ArrayBuffer 转为 base64 字符串 */
function arrayBufferToBase64(buffer) {
  var binary = '';
  var bytes = new Uint8Array(buffer);
  for (var i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
  return btoa(binary);
}

function importCSV(url, label) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt,.xlsx';
  input.addEventListener('change', function() {
    var file = input.files[0];
    if (!file) return;
    var isXlsx = file.name.toLowerCase().endsWith('.xlsx');
    if (isXlsx) {
      // XLSX → 读取 ArrayBuffer → 转 base64 → 发往后端
      var reader = new FileReader();
      reader.onload = function(e) {
        var base64 = arrayBufferToBase64(e.target.result);
        API.post(url, { file: base64, format: 'xlsx' }).then(function(result) {
          var msg = '✅ 成功导入 ' + result.imported + ' 条记录';
          if (result.errors && result.errors.length > 0) {
            msg += '\n⚠️ ' + result.errors.length + ' 条失败: ' + result.errors.join('; ');
          }
          showAlert(msg);
          if (typeof renderSuppliers === 'function') renderSuppliers();
          if (typeof renderSpatial === 'function') renderSpatial();
          if (typeof renderCustomers === 'function') renderCustomers();
          if (typeof renderContracts === 'function') renderContracts();
        }).catch(function(e) {
          showAlert('❌ 导入失败: ' + e.message);
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV/TXT → 读取文本 → 发往后端
      var reader = new FileReader();
      reader.onload = function(e) {
        var csv = e.target.result;
        API.post(url, { csv: csv }).then(function(result) {
          var msg = '✅ 成功导入 ' + result.imported + ' 条记录';
          if (result.errors && result.errors.length > 0) {
            msg += '\n⚠️ ' + result.errors.length + ' 条失败: ' + result.errors.join('; ');
          }
          showAlert(msg);
          if (typeof renderSuppliers === 'function') renderSuppliers();
          if (typeof renderSpatial === 'function') renderSpatial();
          if (typeof renderCustomers === 'function') renderCustomers();
          if (typeof renderContracts === 'function') renderContracts();
        }).catch(function(e) {
          showAlert('❌ 导入失败: ' + e.message);
        });
      };
      reader.readAsText(file);
    }
  });
  input.click();
}

function formToObject(form) {
  var obj = {};
  for (var i = 0; i < form.elements.length; i++) {
    var el = form.elements[i];
    if (el.name) obj[el.name] = el.value;
  }
  return obj;
}

function runReminderNow() {
  API.post('/api/reminder/run').then(function(result) {
    var count = result.alert_count || 0;
    var html = '';
    if (result.alerts && result.alerts.length > 0) {
      html = '<div class="notification-preview">';
      for (var i = 0; i < result.alerts.length; i++) {
        var a = result.alerts[i];
        var tag = a.type === 'supplier_line' ? '<span class="tag-wecom">\u4F01\u5FAE\u9884\u8B66</span>'
          : (a.type === 'wechat_template' ? '<span class="tag-wechat">\u5FAE\u4FE1\u6A21\u677F</span>'
          : '<span class="tag-wecom">\u4F01\u5FAE\u5F85\u529E</span>');
        var content = a.wecom_payload ? a.wecom_payload.markdown.content
          : (a.data ? '\uD83D\uDCF1 \u53D1\u9001\u7ED9 ' + a.touser + ': ' + a.data.first.value : '');
        html += '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">'
          + tag + ' ' + (a.level || '') + ' ' + (a.title || '')
          + '<br><span style="color:var(--text-secondary)">' + content + '</span></div>';
      }
      html += '</div>';
    } else {
      html = '<div class="empty-state"><p>\u2705 \u5F53\u524D\u6CA1\u6709\u9700\u8981\u63D0\u9192\u7684\u4E8B\u9879</p></div>';
    }
    openModal('\u63D0\u9192\u5F15\u64CE\u7ED3\u679C (' + count + '\u6761)', html);
  }).catch(function(e) {
    openModal('\u8FD0\u884C\u5931\u8D25', '<p class="text-secondary">' + e.message + '</p>');
  });
}

// ===== 品牌配置应用 =====
function applyBrandingSettings() {
  API.get('/api/settings/group/general').then(function(settings) {
    var map = {};
    for (var i = 0; i < settings.length; i++) {
      map[settings[i].setting_key] = settings[i].setting_value;
    }
    // 浏览器标题
    if (map.site_name) document.title = map.site_name;
    // 侧边栏品牌字：ONLYSTYLE 的 STYLE 要单独渐变（设计稿 .sb-brand-name span），
    // 所以这里必须写 innerHTML —— 用 textContent 会把 <span> 抹掉，渐变就没了
    if (map.site_abbreviation) {
      var ab = String(map.site_abbreviation);
      var m = ab.match(/^(.*?)(STYLE)$/i);
      $('sidebarTitle').innerHTML = (m && m[1])
        ? escapeHtml(m[1]) + '<span>' + escapeHtml(m[2].toUpperCase()) + '</span>'
        : '<span>' + escapeHtml(ab) + '</span>';
    }
    // 侧边栏副标题
    if (map.logo_subtitle) $('sidebarSub').textContent = map.logo_subtitle;
    // 侧栏品牌标记固定用设计稿的渐变描边 logo（系统身份，不随上传图变）；
    // 上传的 logo_url 只作用于登录页，见下方 loginLogo
    // 登录页 Logo
    if (map.logo_url) {
      $('loginLogo').innerHTML = '<img src="' + escapeHtml(map.logo_url) + '" alt="logo" style="height:44px;max-width:150px;object-fit:contain">';
    }
    // 登录页标题
    if (map.company_name) $('loginTitle').textContent = map.company_name;
    // 登录页副标题
    if (map.site_name) $('loginSubtitle').textContent = map.site_name;
  }).catch(function() { /* 静默忽略 */ });
}
