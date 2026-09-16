// ===== 数据看板（ES5 兼容）=====
// 依据：design/mockups/dashboard-redesign/（设计稿思路 + dashboard-v2 效果图）
// 接口：GET /api/dashboard?range=7d|30d|q  →  v2 形状（scope / kpis / expiring / todos / revenue）
// 兜底：若响应里没有 kpis（旧服务端），自动走 adaptDashboardV1ToV2() 整形

var DASH_RANGE = '30d';        // 当前时间范围
var DASH_LAST = null;          // 最近一次成功加载的数据（供导出用）

/* ---------- 工具 ---------- */

// 客户首字头像配色（按公司名哈希稳定取色，不随机）
var DASH_AV_COLORS = ['#1F5BFF', '#0E7490', '#334155', '#1747CC', '#2FB3CC', '#1A2238'];
function dashAvColor(name) {
  var h = 0, s = String(name || '?');
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return DASH_AV_COLORS[h % DASH_AV_COLORS.length];
}
function dashAvChar(name) {
  var s = String(name || '?');
  var skip = '上海北京广州深圳杭州成都武汉南京苏州天津重庆东西南北中';
  var c0 = s.charAt(0);
  if (skip.indexOf(c0) >= 0 && s.length > 1) {
    for (var i = 1; i < s.length; i++) {
      if (skip.indexOf(s.charAt(i)) < 0) return s.charAt(i);
    }
  }
  return c0;
}
function dashBizTagClass(t) {
  var m = {
    // 库里 contracts.biz_type 的 CHECK 只允许这三个值
    '宽带自运营': 'tag-blue', '宽带直售': 'tag-blue', 'IT外包': 'tag-cyan',
    // 下面几个是「设计稿里有、当前数据模型还没有」的业务类型，先留映射，
    // 将来放开 CHECK 约束后无需再改前端（注意别写成 'IT 运维' 带空格——库里是 'IT外包'）
    '宽带专线': 'tag-blue', 'IT 运维': 'tag-amber',
    '系统开发': 'tag-cyan', '系统集成': 'tag-cyan',
    '新媒体': 'tag-gray', '营销运营': 'tag-gray'
  };
  return m[t] || 'tag-gray';
}
function dashStatusTagClass(s) {
  var m = {
    '未回款': 'tag-red', '已逾期': 'tag-red', '已到期': 'tag-red',
    '待报价': 'tag-amber', '待签约': 'tag-amber', '待续约': 'tag-amber', '即将到期': 'tag-amber',
    '正常': 'tag-green', '已续约': 'tag-green', '进行中': 'tag-green'
  };
  return m[s] || 'tag-gray';
}
function dashDaysClass(d) {
  if (d === null || d === undefined) return 'green';
  return d <= 7 ? 'red' : (d <= 14 ? 'amber' : 'green');
}
function dashDaysText(d) {
  if (d === null || d === undefined) return '—';
  if (d < 0) return '逾期 ' + Math.abs(d) + ' 天';
  if (d === 0) return '今天到期';
  return d + ' 天';
}

/* ---------- 子渲染 ---------- */

function dashKpi(k) {
  if (!k) return '';
  var pre = k.prefix ? '<span class="kpi-pre">' + escapeHtml(k.prefix) + '</span>' : '';
  // % / ‰ 这类单位要贴着数字读，不留空档；家/份/万这些留 5px 更好看
  var tight = (k.unit === '%' || k.unit === '‰') ? ' tight' : '';
  var unit = k.unit ? '<span class="kpi-unit' + tight + '">' + escapeHtml(k.unit) + '</span>' : '';
  var tag = k.tag ? '<span class="tag ' + (k.tagClass || 'tag-blue') + '">' + escapeHtml(k.tag) + '</span>' : '';
  var foot = '';
  if (k.delta) {
    foot += '<span class="' + (k.delta.dir === 'down' ? 'kpi-dn' : 'kpi-up') + '">' +
      (k.delta.dir === 'down' ? '\u2193 ' : '\u2191 ') + escapeHtml(k.delta.text) + '</span> ';
  }
  if (k.note) foot += k.note;
  return '<div class="kpi">' +
    '<div class="kpi-top"><span class="kpi-label">' + escapeHtml(k.label) + '</span>' + tag + '</div>' +
    '<div class="kpi-val">' + pre + escapeHtml(String(k.value)) + unit + '</div>' +
    (foot ? '<div class="kpi-foot">' + foot + '</div>' : '') +
    '</div>';
}

function dashRangeChips(range) {
  var opts = [['7d', '近 7 天'], ['30d', '近 30 天'], ['q', '本季度']];
  var h = '<div class="dash-range">';
  for (var i = 0; i < opts.length; i++) {
    h += '<button type="button" class="range-chip' + (opts[i][0] === range ? ' on' : '') +
      '" onclick="dashSetRange(\'' + opts[i][0] + '\')">' + opts[i][1] + '</button>';
  }
  return h + '</div>';
}

function dashExpiringTable(rows, rangeDays) {
  // 已续约的不需要动作，单独拎出来提示「共 N 条」里有多少是要办的
  var pending = 0;
  for (var q = 0; q < rows.length; q++) { if (rows[q].status !== '已续约') pending++; }
  var h = '<div class="dcard">' +
    '<div class="dcard-hd">' +
      '<span class="dcard-title">合同到期提醒</span>' +
      '<span class="dcard-sub">Expiring / ' + rangeDays + ' days</span>' +
      '<span class="dcard-more"><span>\u5171 ' + rows.length + ' \u6761' +
        (pending !== rows.length && rows.length ? '\uff08\u5f85\u8ddf\u8fdb ' + pending + '\uff09' : '') + '</span>' +
      '<a class="dcard-link" href="#" onclick="navigate(\'contracts\');return false">\u5168\u90E8 \u2192</a></span>' +
    '</div>';

  if (!rows.length) {
    return h + '<div class="dash-empty"><div class="dash-empty-ic">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.4">' +
      '<polyline points="20 6 9 17 4 12"/></svg></div>' +
      '<div class="dash-empty-t">' + rangeDays + ' 天内没有到期合同</div>' +
      '<div class="dash-empty-s">所有在管合同都在安全期内</div></div></div>';
  }

  h += '<div class="ct-wrap"><table class="ct-table"><thead><tr>' +
    '<th>客户</th><th>业务类型</th><th>套餐 / 服务</th><th>到期日期</th>' +
    '<th>剩余</th><th>状态</th><th>操作</th></tr></thead><tbody>';

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var dc = dashDaysClass(r.days_left);
    // 已续约 = 已闭环的历史记录，再顶一条红色紧急条只会稀释真正要跟进的行的信号
    var closed = (r.status === '已续约');
    var rowCls = closed ? '' : (dc === 'red' ? 'hot' : (dc === 'amber' ? 'warm' : ''));
    h += '<tr class="' + rowCls + '">' +
      '<td><div class="ct-cust">' +
        '<span class="ct-av" style="background:' + dashAvColor(r.company_name) + '">' +
          escapeHtml(dashAvChar(r.company_name)) + '</span>' +
        '<span class="ct-info">' +
          '<span class="ct-nm" title="' + escapeHtml(r.company_name) + '">' + escapeHtml(r.company_name) + '</span>' +
          '<span class="ct-no">' + escapeHtml(r.contract_id) + '</span></span>' +
      '</div></td>' +
      '<td><span class="tag ' + dashBizTagClass(r.biz_type) + '">' + escapeHtml(r.biz_type) + '</span></td>' +
      '<td>' + escapeHtml(r.plan || '—') + '</td>' +
      '<td class="mono-c">' + escapeHtml(r.end_date || '—') + '</td>' +
      '<td><span class="days ' + dc + '"><i></i>' + dashDaysText(r.days_left) + '</span></td>' +
      '<td><span class="tag ' + dashStatusTagClass(r.status) + '">' + escapeHtml(r.status || '—') + '</span></td>' +
      '<td><span class="act">' +
        '<a href="#" onclick="dashRenew(\'' + r.contract_id + '\');return false">续约</a>' +
        '<a class="mut" href="#" onclick="navigate(\'contracts\');return false">详情</a>' +
      '</span></td>' +
    '</tr>';
  }
  return h + '</tbody></table></div></div>';
}

function dashTodos(todos) {
  var h = '<div class="dcard">' +
    '<div class="dcard-hd"><span class="dcard-title">待办事项</span>' +
    '<span class="dcard-more"><span class="dcard-cnt">' + todos.length + '</span></span></div>';
  if (!todos.length) {
    return h + '<div class="dash-empty"><div class="dash-empty-ic">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.4">' +
      '<polyline points="20 6 9 17 4 12"/></svg></div>' +
      '<div class="dash-empty-t">暂无待办</div>' +
      '<div class="dash-empty-s">线路与合同都在安全期内</div></div></div>';
  }
  for (var i = 0; i < todos.length; i++) {
    var t = todos[i];
    var cls = t.level === 'danger' ? 'red' : (t.level === 'warn' ? 'amber' : 'green');
    var mk = t.level === 'danger' ? '!' : (t.level === 'warn' ? '!' : '\u2713');
    h += '<div class="todo">' +
      '<span class="todo-ico ' + cls + '">' + mk + '</span>' +
      '<span style="min-width:0">' +
        '<span class="todo-t">' + t.title + '</span>' +
        '<span class="todo-m">' + t.meta + '</span>' +
      '</span></div>';
  }
  return h + '</div>';
}

function dashRevenue(items) {
  var h = '<div class="dcard">' +
    '<div class="dcard-hd"><span class="dcard-title">业务线收入占比</span>' +
    '<span class="dcard-more"><span>按当前月费</span></span></div>';
  if (!items.length) {
    return h + '<div class="dash-empty"><div class="dash-empty-ic">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.4">' +
      '<polyline points="20 6 9 17 4 12"/></svg></div>' +
      '<div class="dash-empty-t">暂无收入数据</div>' +
      '<div class="dash-empty-s">录入在管合同月费后自动汇总</div></div></div>';
  }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    h += '<div class="bar"><div class="bar-top">' +
      '<span class="bar-nm">' + escapeHtml(it.name) + '</span>' +
      '<span class="bar-v">' + escapeHtml(it.amount) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' +
        Math.max(0, Math.min(100, it.pct)) + '%"></div></div></div>';
  }
  return h + '</div>';
}

/* ---------- 主渲染 ---------- */

function renderDashboardV2(data) {
  var scope = data.scope || {};
  var k = data.kpis || {};
  var rangeDays = scope.rangeDays || 30;

  var h = '<div class="dash-head">' +
    '<div>' +
      '<h1 class="dash-title">数据看板</h1>' +
      '<div class="dash-scope">范围：<b>' + escapeHtml(scope.bizLine || '全部业务线') + '</b>' +
        ' · 最后更新 <b>' + escapeHtml(scope.updatedAt || '—') + '</b></div>' +
    '</div>' +
    '<div class="dash-acts">' + dashRangeChips(scope.range || '30d') +
      '<button type="button" class="btn btn-ghost" onclick="dashExport()">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/>' +
        '<line x1="12" y1="15" x2="12" y2="3"/></svg>导出报告</button>' +
      '<button type="button" class="btn btn-primary" onclick="navigate(\'contracts\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">' +
        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>新建合同</button>' +
    '</div></div>';

  h += '<div class="kpi-row">' +
    dashKpi(k.customers) + dashKpi(k.expiring) + dashKpi(k.contractSum) + dashKpi(k.renewRate) +
    '</div>';

  h += '<div class="dash-grid">' +
    '<div>' + dashExpiringTable(data.expiring || [], rangeDays) + '</div>' +
    '<div class="rail">' + dashTodos(data.todos || []) + dashRevenue(data.revenue || []) + '</div>' +
    '</div>';

  return h;
}

/* ---------- 兜底整形：旧服务端响应 → v2 形状 ---------- */
function adaptDashboardV1ToV2(d) {
  var s = d.stats || {}, yz = d.yellowZone || [], rz = d.redZone || [];
  var now = new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) +
    ' ' + p(now.getHours()) + ':' + p(now.getMinutes());

  var sumMonthly = 0;
  for (var i = 0; i < yz.length; i++) sumMonthly += (yz[i].monthly_fee || 0);
  var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return {
    scope: { bizLine: '宽带与 IT 服务', updatedAt: fmt, range: DASH_RANGE, rangeDays: 30 },
    kpis: {
      customers:   { label: '在管客户总数', value: s.total_customers || 0, unit: '家', tag: '活跃', tagClass: 'tag-blue' },
      expiring:    { label: '30 天内到期合同', value: s.yellow_alert_count || 0, unit: '份', tag: '需跟进', tagClass: 'tag-amber' },
      contractSum: { label: '在管合同总额', prefix: '¥',
                     value: Math.round(sumMonthly * 12 / 10000).toLocaleString(), unit: '万/年',
                     note: '按当前月费年化' },
      renewRate:   { label: '客户续约率', value: '—', unit: '', note: '需要后端 v2 接口' }
    },
    expiring: yz.map(function (c) {
      var d = Math.round((new Date(c.end_date + 'T00:00:00') - today0) / 86400000);
      return {
        contract_id: c.contract_id, company_name: c.company_name, biz_type: c.biz_type,
        plan: (c.allocated_bw ? c.allocated_bw + 'M 带宽' : (c.biz_type || '—')),
        end_date: c.end_date, days_left: d, status: c.status
      };
    }),
    todos: rz.map(function (l) {
      var d = typeof daysBetween === 'function' ? daysBetween(l.expire_date) : 0;
      return { level: d <= 15 ? 'danger' : 'warn',
               title: '运营商大线 ' + (d < 0 ? '已逾期 ' + Math.abs(d) + ' 天' : d + ' 天后到期'),
               meta: (l.circuit_number || l.line_id) + ' · ' + (l.provider || '—') };
    }),
    revenue: []
  };
}

/* ---------- 页面入口 ---------- */

function renderDashboard() {
  var body = $('contentBody');
  body.innerHTML = '<div class="dash-head"><div><h1 class="dash-title">数据看板</h1>' +
    '<div class="dash-scope">加载中…</div></div></div>';

  API.get('/api/dashboard?range=' + encodeURIComponent(DASH_RANGE)).then(function (data) {
    DASH_LAST = data;
    var v2 = (data && data.kpis) ? data : adaptDashboardV1ToV2(data || {});
    body.innerHTML = renderDashboardV2(v2);
  }).catch(function (e) {
    body.innerHTML = '<div class="empty-state"><p>\u274C 加载看板数据失败：' + escapeHtml(e.message) + '</p></div>';
  });
}

/* ---------- 交互 ---------- */

window.dashSetRange = function (r) {
  if (['7d', '30d', 'q'].indexOf(r) < 0) return;
  DASH_RANGE = r;
  renderDashboard();
};

window.dashRenew = function (contractId) {
  if (typeof window.previewRenew === 'function') window.previewRenew(contractId);
  else navigate('contracts');
};

// 导出当前可见的到期合同为 CSV（纯前端，不依赖后端）
window.dashExport = function () {
  var rows = (DASH_LAST && DASH_LAST.expiring) || [];
  if (!rows.length) {
    if (typeof showAlert === 'function') showAlert('当前没有可导出的到期合同');
    return;
  }
  var head = ['客户', '合同编号', '业务类型', '套餐/服务', '到期日期', '剩余天数', '状态', '月费'];
  var lines = [head.join(',')];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    lines.push([r.company_name, r.contract_id, r.biz_type, r.plan, r.end_date,
                r.days_left, r.status, r.monthly_fee]
      .map(function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; })
      .join(','));
  }
  var csv = '\uFEFF' + lines.join('\r\n');   // BOM 保证 Excel 正确识别 UTF-8
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '合同到期提醒_' + DASH_RANGE + '_' +
    new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
};
