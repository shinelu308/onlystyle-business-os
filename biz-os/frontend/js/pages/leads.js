// ===== 客户线索（官网表单来的）=====
// 数据源：GET /api/leads（列表 + total + statuses）· GET /api/leads/stats · PUT /api/leads/:id
//
// ⚠️ 必须用 API.content.*（自动带 X-Admin-Token + 自动拆 { ok, data } 信封）。
//    用 API.get 会 401 —— 线索里有客户手机号，接口是要鉴权的。
//
// 🔴 线索内容是**访客自己填的**（姓名/公司/需求描述），全部必须过 escapeHtml 再进 innerHTML，
//    否则官网表单就是一个现成的存储型 XSS 入口（后台一打开线索页就中招）。
//
// 状态枚举不写死在这里：随列表接口的 statuses 下发（后端 routes/leads.js 是唯一真相源）。

window._leadFilter = { status: '', q: '' };



/* 轻提示：后台没有全局 toast 函数（只有 showAlert 模态），
   而改状态/存备注是高频小动作，弹模态太打断。这里做一个本页专用的小条，
   不改全局，也不引第三方。2.2s 自动淡出。 */
function leadToast(msg, isErr) {
  var el = document.getElementById('leadToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'leadToast';
    el.style.cssText = 'position:fixed;right:24px;bottom:28px;z-index:9999;padding:11px 18px;' +
      'border-radius:12px;font-size:13.5px;color:#fff;background:#071229;max-width:360px;' +
      'box-shadow:0 10px 30px rgba(7,18,41,.28);opacity:0;transform:translateY(8px);' +
      'transition:opacity .18s,transform .18s;pointer-events:none;font-family:inherit';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = isErr ? '#B91C1C' : '#071229';
  requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 2200);
}

var LEAD_TONE = { info: 'info', warn: 'warning', brand: 'info', ok: 'success', muted: 'secondary' };
var _leadStatuses = [];

/* 状态 key → 中文标签（查接口下发的枚举，查不到就原样显示） */
function leadStatusLabel(key) {
  for (var i = 0; i < _leadStatuses.length; i++) {
    if (_leadStatuses[i].key === key) return _leadStatuses[i].label;
  }
  return key || '-';
}
function leadStatusTone(key) {
  for (var i = 0; i < _leadStatuses.length; i++) {
    if (_leadStatuses[i].key === key) return LEAD_TONE[_leadStatuses[i].tone] || 'secondary';
  }
  return 'secondary';
}
function leadStatusBadge(key) {
  return '<span class="badge ' + leadStatusTone(key) + '">' + escapeHtml(leadStatusLabel(key)) + '</span>';
}

/* 来源页 → 中文（线索大多来自官网 /contact） */
var LEAD_PAGE_MAP = { '/contact': '联系我们', '/about': '关于我们', '/products': '产品介绍', '/cases': '案例星球', '/': '首页' };
function leadPageLabel(p) {
  if (!p) return '-';
  return LEAD_PAGE_MAP[p] || p;
}

function renderLeads() {
  var body = $('contentBody');
  var f = window._leadFilter;
  var qs = [];
  if (f.status) qs.push('status=' + encodeURIComponent(f.status));
  if (f.q) qs.push('q=' + encodeURIComponent(f.q));
  var listUrl = '/api/leads' + (qs.length ? '?' + qs.join('&') : '');

  var done = 0, stats = null, list = null, err = null;
  function checkDone() {
    if (done < 2) return;
    if (err) {
      body.innerHTML = '<div class="empty-state"><p>加载失败：' + escapeHtml(err.message || String(err)) + '</p></div>';
      return;
    }

    _leadStatuses = (list && list.statuses) || [];
    var statuses = _leadStatuses;
    var rows = (list && list.items) || [];
    var total = (list && list.total) || 0;
    var byStatus = (stats && stats.byStatus) || {};

    /* ── 统计卡 ── */
    var statCards =
      '<div class="stat-card"><div class="stat-icon" style="background:var(--primary-light);color:var(--primary)">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg></div>' +
        '<div class="stat-info"><div class="stat-number">' + (stats ? stats.total : total) + '</div><div class="stat-label">线索总数</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon" style="background:var(--success-bg);color:var(--success)">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>' +
        '<div class="stat-info"><div class="stat-number">' + (stats ? stats.today : 0) + '</div><div class="stat-label">今日新增</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon" style="background:#FFFBEB;color:#B45309">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></div>' +
        '<div class="stat-info"><div class="stat-number">' + (stats ? stats.week : 0) + '</div><div class="stat-label">近 7 天</div></div></div>' +
      '<div class="stat-card"><div class="stat-icon" style="background:#FFF5F5;color:#B91C1C">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg></div>' +
        '<div class="stat-info"><div class="stat-number">' + (byStatus['new'] || 0) + '</div><div class="stat-label">待跟进</div></div></div>' +
      // 「已转客户」= 真的建了客户的线索。它是线索池与客户库之间的唯一桥梁，
      // 放这张卡是为了让人一眼看清：线索有多少最终变成了客户（不是全部）。
      '<div class="stat-card"><div class="stat-icon" style="background:#ECFDF5;color:#047857">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M20 6L9 17l-5-5"/></svg></div>' +
        '<div class="stat-info"><div class="stat-number">' + (stats && stats.converted ? stats.converted : 0) + '</div><div class="stat-label">已转客户</div></div></div>';

    /* ── 状态筛选 chips（「全部」+ 各状态，带数量）── */
    var chips = '<button class="btn btn-sm ' + (!f.status ? 'btn-primary' : 'btn-outline') + '" onclick="leadFilterStatus(\'\')">' +
      '全部 <span style="opacity:.75">' + total + '</span></button>';
    for (var s = 0; s < statuses.length; s++) {
      var st = statuses[s];
      chips += '<button class="btn btn-sm ' + (f.status === st.key ? 'btn-primary' : 'btn-outline') + '" onclick="leadFilterStatus(\'' + st.key + '\')">' +
        escapeHtml(st.label) + ' <span style="opacity:.75">' + (byStatus[st.key] || 0) + '</span></button>';
    }

    /* ── 表格 ── */
    var rowsHtml = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var statusSel = '<select id="leadStatusSel' + r.id + '" onchange="leadSetStatus(' + r.id + ', this.value, this)"' +
        ' style="padding:5px 9px;border:1px solid var(--border);border-radius:8px;font-size:12.5px;' +
        'font-family:inherit;background:var(--surface,#fff);color:var(--text);cursor:pointer;max-width:120px">';
      for (var s2 = 0; s2 < statuses.length; s2++) {
        statusSel += '<option value="' + statuses[s2].key + '"' + (r.status === statuses[s2].key ? ' selected' : '') + '>' +
          escapeHtml(statuses[s2].label) + '</option>';
      }
      statusSel += '</select>';

      var noteIcon = r.follow_note ? '<span title="' + escapeHtml(r.follow_note) + '" style="color:var(--primary)">\u270E</span> ' : '';

      // 客户归属动作。三种状态必须分清，别揉成一个「客户」按钮：
      //   已转正 → 它就是客户的来源，跳去客户管理看；
      //   已归因 → 手机号命中老客户（老客户来询，本就不是新客户），点它只是补记「已成交」；
      //   未归因 → 真正需要建档的那批，用 primary 样式突出，这是线索池的主出口。
      var convertBtn;
      if (r.converted_at) {
        convertBtn = '<button class="btn btn-sm btn-outline" onclick="navigate(\'customers\')" title="已于 ' +
          escapeHtml(r.converted_at) + ' 转正，客户编号 ' + escapeHtml(r.customer_id || '') + '">已转客户</button>';
      } else if (r.customer_id) {
        convertBtn = '<button class="btn btn-sm btn-outline" onclick="showLeadConvert(' + r.id + ')" title="手机号命中已有客户 ' +
          escapeHtml(r.customer_id) + '（老客户来询）；成交后可点此标记转正">转为客户</button>';
      } else {
        convertBtn = '<button class="btn btn-sm btn-primary" onclick="showLeadConvert(' + r.id + ')" title="确认为客户并建档">转为客户</button>';
      }

      rowsHtml += '<tr>' +
        '<td><strong>#' + r.id + '</strong></td>' +
        '<td>' + escapeHtml(r.name || '-') + '</td>' +
        '<td><strong>' + escapeHtml(r.phone || '-') + '</strong></td>' +
        '<td>' + escapeHtml(r.company || '-') + '</td>' +
        '<td>' + (r.interest ? escapeHtml(r.interest) : '<span class="text-secondary">-</span>') + '</td>' +
        '<td><span class="badge secondary">' + escapeHtml(leadPageLabel(r.source_page)) + '</span></td>' +
        '<td>' + leadStatusBadge(r.status) + '</td>' +
        '<td class="text-xs">' + escapeHtml(r.created_at || '-') + '</td>' +
        // ⚠️ statusSel 建好了必须**真的塞进行里**：卡头写着「状态可直接在行内修改」，
        //    漏渲染 = 只有详情模态才能改状态，表头那句话就是骗人的。
        //    放在「操作」列而不是「状态」列 —— 状态列已有彩色徽标，再塞个下拉是同一信息说两遍。
        '<td><div class="btn-group">' + statusSel +
          '<button class="btn btn-sm btn-ghost" onclick="showLeadDetail(' + r.id + ')" title="查看详情与跟进">' + noteIcon + '详情</button>' +
          convertBtn +
        '</div></td></tr>';
    }
    if (!rows.length) {
      rowsHtml = '<tr><td colspan="9"><div class="empty-state"><p>还没有线索。官网「联系我们」表单提交后会实时出现在这里。</p></div></td></tr>';
    }

    var filterBar =
      '<div style="display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);align-items:center;flex-wrap:wrap">' +
        '<div class="btn-group" id="leadChips" style="flex-wrap:wrap">' + chips + '</div>' +
        '<div style="flex:1;min-width:200px;display:flex;gap:8px;margin-left:auto">' +
          '<input id="leadSearchInput" type="text" placeholder="搜索称呼 / 电话 / 公司 / 需求..." value="' + escapeHtml(f.q || '') + '"' +
            ' style="flex:1;padding:9px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px">' +
          '<button class="btn btn-sm btn-ghost" onclick="doLeadSearch()">搜索</button>' +
          '<button class="btn btn-sm btn-outline" onclick="resetLeadSearch()">重置</button>' +
        '</div>' +
      '</div>';

    body.innerHTML =
      '<div class="stats-grid">' + statCards + '</div>' +
      '<div class="card">' +
        '<div class="card-header"><h3>线索列表</h3>' +
          // 把「线索不是客户」这件事写在卡头：线索池与客户库是两个口径，
          // 只有点了「转为客户」才会在客户管理里出现 —— 免得有人找不到客户来问。
          '<div class="btn-group"><span class="text-xs text-secondary" style="align-self:center">共 ' + total +
            ' 条 · 状态可直接在行内修改 · 线索不计入客户数，需点「转为客户」建档</span></div>' +
        '</div>' +
        '<div class="card-body" style="padding:0">' + filterBar +
          '<div class="table-wrapper"><table>' +
            '<thead><tr><th style="width:56px">ID</th><th>您的称呼</th><th>联系电话</th><th>公司名称</th>' +
            '<th>需求方向</th><th>来源页</th><th>状态</th><th>提交时间</th><th style="width:320px">操作</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table></div></div></div>';

    var si = document.getElementById('leadSearchInput');
    if (si) si.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLeadSearch(); });
  }

  API.content.get('/api/leads/stats').then(function (d) { stats = d; done++; checkDone(); },
    function (e) { err = e; done++; checkDone(); });
  API.content.get(listUrl).then(function (d) { list = d; done++; checkDone(); },
    function (e) { err = e; done++; checkDone(); });

  setTimeout(function () {
    if (done < 2) body.innerHTML = '<div class="empty-state"><p>加载超时，请检查后端服务（3100）是否在运行</p></div>';
  }, 12000);
}

/* ── 筛选 / 搜索 ── */
window.leadFilterStatus = function (st) {
  window._leadFilter.status = st || '';
  renderLeads();
};
function doLeadSearch() {
  var i = document.getElementById('leadSearchInput');
  window._leadFilter.q = i ? i.value.trim() : '';
  renderLeads();
}
function resetLeadSearch() {
  window._leadFilter = { status: '', q: '' };
  renderLeads();
}

/* ── 行内改状态 ── */
window.leadSetStatus = function (id, status, sel) {
  if (sel) sel.disabled = true;
  API.content.put('/api/leads/' + id, { status: status }).then(function () {
    leadToast('线索 #' + id + ' 状态已更新为「' + leadStatusLabel(status) + '」');
    renderLeads();
  }).catch(function (e) {
    leadToast('更新失败：' + e.message, true);
    renderLeads();
  });
};

/* ── 转为客户 ──
   这是线索变成客户的**唯一**入口。官网表单提交时已经不再自动建客户了 ——
   所以「客户管理里为什么没有这个人」的正解是来点这个按钮，而不是回官网投诉表单没生效。

   为什么不直接跳到「客户管理 → 新增客户」让用户填一遍：
   那样等于让人干重复劳动（姓名/电话再敲一遍），而且会漏掉「给线索打转正标记」这一步，
   结果这条线索永远显示未转正、统计也对不上。 */
window.showLeadConvert = function (id) {
  var pList = API.content.get('/api/leads?limit=500');
  // 客户类型走公开的 /config/types（与「客户管理」表单同一个来源，避免两处类型列表漂移）
  var pTypes = API.get('/api/customers/config/types');
  Promise.all([pList, pTypes]).then(function (res) {
    var rows = (res[0] && res[0].items) || [];
    var types = (res[1] && res[1].length) ? res[1] : ['园区租户', '连锁店', '散客', '楼宇'];
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) r = rows[i];
    if (!r) { openModal('未找到', '<p>线索 #' + id + ' 不在当前列表里。</p>'); return; }

    // 已归因到老客户：后端会直接挂到老客户名下、不新建，所以这里只要确认，不要填表
    var attributed = !!(r.customer_id && !r.converted_at);

    var contextHtml =
      '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-bottom:14px;padding:10px 14px;background:#F8FAFC;border-radius:10px">' +
        '称呼：<b>' + escapeHtml(r.name || '-') + '</b> · 电话：<b>' + escapeHtml(r.phone || '-') + '</b>' +
        (r.company ? ' · 公司：<b>' + escapeHtml(r.company) + '</b>' : '') +
        (r.interest ? '<br>需求：' + escapeHtml(r.interest) : '') +
      '</div>';

    if (attributed) {
      openModal('转为客户 · 线索 #' + r.id,
        contextHtml +
        '<div style="font-size:13.5px;line-height:1.8;color:#B45309;margin-bottom:16px">' +
          '该手机号已命中已有客户 <b>' + escapeHtml(r.customer_id) + '</b>，属于<b>老客户来询</b>。' +
          '确认后会把这条线索标记为已成交并挂到该客户名下，<b>不会新建重复客户</b>。' +
        '</div>' +
        '<div class="form-actions full">' +
          '<button class="btn btn-outline" type="button" onclick="closeModal()">取消</button>' +
          '<button class="btn btn-primary" type="button" onclick="confirmLeadConvert(' + r.id + ')">确认标记转正</button>' +
        '</div>');
      return;
    }

    var typeOpts = '';
    var hasSanke = types.indexOf('散客') >= 0;
    for (var t = 0; t < types.length; t++) {
      var sel = (types[t] === '散客' || (!hasSanke && t === 0)) ? ' selected' : '';
      typeOpts += '<option value="' + escapeHtml(types[t]) + '"' + sel + '>' + escapeHtml(types[t]) + '</option>';
    }
    var suggestId = 'C' + String(Date.now()).slice(-8);

    openModal('转为客户 · 线索 #' + r.id,
      contextHtml +
      '<form id="leadConvertForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">客户类型</label><select name="cust_type">' + typeOpts + '</select></div>' +
        '<div class="form-group"><label class="required">客户编号</label><input name="customer_id" value="' + escapeHtml(suggestId) + '" placeholder="如 CUST-012"></div>' +
        '<div class="form-group full"><label class="required">客户名称</label><input name="company_name" value="' +
          escapeHtml(r.company || r.name || '') + '" placeholder="公司 / 客户名称"></div>' +
        '<div class="form-actions full">' +
          '<button class="btn btn-outline" type="button" onclick="closeModal()">取消</button>' +
          '<button class="btn btn-primary" type="button" onclick="confirmLeadConvert(' + r.id + ')">确认转为客户</button>' +
        '</div>' +
      '</form>');
  }).catch(function (e) {
    openModal('加载失败', '<p>' + escapeHtml(e.message) + '</p>');
  });
};

window.confirmLeadConvert = function (id) {
  // 「老客户来询」那条分支没有表单，payload 为空对象即可（后端只做标记，不建客户）
  var form = document.getElementById('leadConvertForm');
  var payload = form ? formToObject(form) : {};
  if (form && !payload.company_name) { leadToast('请填写客户名称', true); return; }

  API.content.post('/api/leads/' + id + '/convert', payload).then(function (d) {
    closeModal();
    var cid = (d && d.customer_id) ? d.customer_id : '';
    leadToast(d && d.created === false
      ? '已标记转正，挂到已有客户 ' + cid
      : '已转为客户 ' + cid);
    renderLeads();
  }).catch(function (e) {
    leadToast('转正失败：' + e.message, true);
  });
};

/* ── 详情 + 跟进 ── */
window.showLeadDetail = function (id) {
  API.content.get('/api/leads?limit=500').then(function (list) {
    _leadStatuses = (list && list.statuses) || _leadStatuses;
    var rows = (list && list.items) || [];
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) r = rows[i];
    if (!r) { openModal('未找到', '<p>线索 #' + id + ' 不在当前列表里。</p>'); return; }

    var fields = [
      ['您的称呼', r.name],
      ['联系电话', r.phone],
      ['公司名称', r.company || '-'],
      ['需求方向', r.interest || '-'],
      ['来源页', leadPageLabel(r.source_page)],
      ['提交时间', r.created_at || '-'],
    ];
    var infoHtml = '<div class="customer-overview-detail-grid">';
    for (var k = 0; k < fields.length; k++) {
      infoHtml += '<div class="customer-overview-field"><span class="co-label">' + escapeHtml(fields[k][0]) + '</span>' +
        '<span class="co-value">' + escapeHtml(fields[k][1]) + '</span></div>';
    }
    // 客户归属三种状态，别揉成一句话（旧文案「没填公司名时不会建客户」描述的是已废弃的旧模型）：
    //   已转正 → 它是该客户的来源，可跳转过去
    //   已归因 → 手机号命中老客户，属「老客户来询」，本身不产生新客户
    //   未归因 → 留在线索池待人工分诊
    var linkHtml;
    if (r.converted_at) {
      linkHtml = '<span class="badge success">已转正</span> <span class="badge info">' + escapeHtml(r.customer_id || '') + '</span> ' +
        '<span class="text-xs text-secondary">' + escapeHtml(r.converted_at) + '</span> ' +
        '<button class="btn btn-sm btn-outline" onclick="closeModal();navigate(\'customers\')">去客户管理</button>';
    } else if (r.customer_id) {
      linkHtml = '<span class="badge warning">老客户来询</span> <span class="badge info">' + escapeHtml(r.customer_id) + '</span> ' +
        '<span class="text-xs text-secondary">手机号命中已有客户，不会新建重复客户</span> ' +
        '<button class="btn btn-sm btn-primary" onclick="closeModal();showLeadConvert(' + r.id + ')">标记转正</button>';
    } else {
      linkHtml = '<span class="text-secondary">未归因 · 留在线索池待人工分诊</span> ' +
        '<button class="btn btn-sm btn-primary" onclick="closeModal();showLeadConvert(' + r.id + ')">转为客户</button>';
    }
    infoHtml += '<div class="customer-overview-field co-full"><span class="co-label">客户归属</span><span class="co-value">' +
      linkHtml + '</span></div></div>';

    var msgHtml = '<div class="customer-overview-section">' +
      '<div class="customer-overview-section-title">\uD83D\uDCAC 需求描述</div>' +
      '<div style="white-space:pre-wrap;line-height:1.7;padding:4px 2px">' +
      (r.message ? escapeHtml(r.message) : '<span class="text-secondary">（访客未填写）</span>') + '</div></div>';

    var statusBtns = '<div class="btn-group" style="flex-wrap:wrap">';
    for (var s = 0; s < _leadStatuses.length; s++) {
      var st = _leadStatuses[s];
      statusBtns += '<button class="btn btn-sm ' + (r.status === st.key ? 'btn-primary' : 'btn-outline') + '"' +
        ' onclick="leadDetailSetStatus(' + r.id + ',\'' + st.key + '\')">' + escapeHtml(st.label) + '</button>';
    }
    statusBtns += '</div>';

    var noteHtml = '<div class="customer-overview-section">' +
      '<div class="customer-overview-section-title">\uD83D\uDCDD 跟进备注</div>' +
      '<textarea id="leadNoteInput" rows="4" placeholder="记录本次沟通结果、下一步动作..." ' +
        'style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-lg);font-size:14px;font-family:inherit;resize:vertical">' +
        escapeHtml(r.follow_note || '') + '</textarea>' +
      '<div style="margin-top:10px;display:flex;gap:8px;align-items:center">' +
        '<button class="btn btn-primary btn-sm" onclick="leadSaveNote(' + r.id + ')">保存备注</button>' +
        '<span class="text-xs text-secondary">' + (r.updated_at ? '上次更新：' + escapeHtml(r.updated_at) : '尚未跟进') + '</span>' +
      '</div></div>';

    openModal('\uD83D\uDCE8 线索详情 #' + r.id + ' - ' + (r.name || ''), infoHtml + statusBtns + msgHtml + noteHtml);
    try { document.getElementById('modal').style.maxWidth = '680px'; } catch (e) { /* 忽略 */ }
  }).catch(function (e) {
    openModal('加载失败', '<p>' + escapeHtml(e.message) + '</p>');
  });
};

window.leadDetailSetStatus = function (id, status) {
  API.content.put('/api/leads/' + id, { status: status }).then(function () {
    leadToast('状态已更新为「' + leadStatusLabel(status) + '」');
    showLeadDetail(id);
    renderLeads();
  }).catch(function (e) {
    leadToast('更新失败：' + e.message, true);
  });
};

window.leadSaveNote = function (id) {
  var t = document.getElementById('leadNoteInput');
  var val = t ? t.value : '';
  API.content.put('/api/leads/' + id, { follow_note: val }).then(function () {
    leadToast('跟进备注已保存');
    showLeadDetail(id);
  }).catch(function (e) {
    leadToast('保存失败：' + e.message, true);
  });
};
