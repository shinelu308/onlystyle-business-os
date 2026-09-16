// ===== Dashboard 页面（ES5 兼容 — 大师级视觉重制版） =====
function renderDashboard() {
  var body = $('contentBody');
  API.get('/api/dashboard').then(function(data) {
    var stats = data.stats;
    var redZone = data.redZone;
    var yellowZone = data.yellowZone;
    var expiringLines = data.expiringLines;
    var oversellRisk = data.oversellRisk;

    var html = '';

    // ======== 顶部统计卡片 ========
    html += '<div class="dashboard-stats">';
    html += premiumStatCard('primary', '线路', stats.total_lines, 'M12 3v1m0 4v1m0 4v1m0 4v1M4 4l16 16M4 20L20 4');
    html += premiumStatCard('info', '项目', stats.total_nodes, 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z');
    html += premiumStatCard('success', '活跃合同', stats.active_contracts, 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z');
    var redIcon = redZone.length > 0 ? 'M12 9v2m0 4h.01M12 3l9.66 15H2.34L12 3z' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
    html += premiumStatCard(redZone.length > 0 ? 'danger' : 'success', '紧急警报', redZone.length, redIcon);
    html += '</div>';

    // ======== 红区：线路已过期 / 即将到期 ========
    html += renderRedZone(redZone);

    // ======== 黄区：终端客户合同临期 ========
    html += renderYellowZone(yellowZone);

    // ======== 超卖风险看板 ========
    html += renderOversellRisk(oversellRisk);

    // ======== 级联影响分析 ========
    html += renderCascadeImpact(expiringLines);

    body.innerHTML = html;
  }).catch(function(e) {
    body.innerHTML = '<div class="empty-state"><p>\u274C 加载看板数据失败: ' + e.message + '</p></div>';
  });
}

// ===== 渲染函数 =====

function renderRedZone(redZone) {
  var h = '<div class="dboard-section">';
  h += '<div class="dboard-section-header red"><h2>\u26A0\uFE0F 线路已过期 / 即将到期</h2><span class="dboard-section-count">' + redZone.length + ' 条</span></div>';
  if (redZone.length === 0) {
    h += '<div class="dboard-empty"><div class="dboard-empty-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="dboard-empty-text">\u2705 当前无紧急线路到期</div><div class="dboard-empty-sub">所有运营商线路均在安全期内</div></div>';
  } else {
    for (var i = 0; i < redZone.length; i++) {
      var l = redZone[i];
      var days = daysBetween(l.expire_date);
      var isExpired = l.is_expired === 1 || l.is_expired === '1' || days < 0;
      var tagText = isExpired ? '已过期 ' + Math.abs(days) + '天' : days + '天后到期';
      h += '<div class="dboard-alert ' + (isExpired || days <= 7 ? 'red' : 'yellow') + '">' +
        '<div class="dboard-alert-info">' +
          '<div class="dboard-alert-title">' +
            '<span class="dboard-alert-tag ' + (isExpired ? 'danger' : (days <= 7 ? 'danger' : 'warning')) + '">' + tagText + '</span> ' +
            l.circuit_number + ' <span class="text-secondary" style="font-weight:400;font-size:13px">(' + l.provider + ')</span>' +
          '</div>' +
          '<div class="dboard-alert-desc">\u00A5' + (l.cost_annual || 0).toLocaleString() + '/年 \u00B7 ' + l.total_bandwidth + 'Mbps</div>' +
          '<div class="dboard-alert-meta">到期日 ' + l.expire_date + ' \u00B7 影响 ' + (l.affected_nodes||0) + ' 个项目\u00B7' + (l.affected_customers||0) + ' 个客户</div>' +
        '</div></div>';
    }
  }
  h += '</div>';
  return h;
}

function renderYellowZone(yellowZone) {
  var h = '<div class="dboard-section">';
  h += '<div class="dboard-section-header yellow"><h2>\uD83D\uDCCB 终端客户合同临期</h2><span class="dboard-section-count">' + yellowZone.length + ' 条</span></div>';
  if (yellowZone.length === 0) {
    h += '<div class="dboard-empty"><div class="dboard-empty-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="dboard-empty-text">\u2705 当前无30天内到期合同</div></div>';
  } else {
    h += '<div class="dboard-table-wrap"><table><thead><tr><th>合同编号</th><th>客户名称</th><th>类型</th><th>计费</th><th>到期日</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    for (var i = 0; i < yellowZone.length; i++) {
      var ct = yellowZone[i];
      var ctDays = daysBetween(ct.end_date);
      var isExpired = ct.status === '已到期' || ctDays < 0;
      var dayCls = isExpired ? 'danger' : (ctDays <= 7 ? 'danger' : 'warning');
      var dayText = isExpired ? '已过期 ' + Math.abs(ctDays) + '天' : ctDays + '天';
      var rowCls = isExpired ? 'row-expired' : '';
      var billingText = '\u00A5' + (ct.monthly_fee || 0).toLocaleString() + '/' + (ct.billing_cycle || '月');
      // 状态颜色映射
      var statusColor = isExpired ? 'danger' : (ctDays <= 7 ? 'warning' : (ctDays <= 30 ? 'warning' : 'success'));
      h += '<tr class="' + rowCls + '">' +
        '<td><strong>' + ct.contract_id + '</strong></td>' +
        '<td>' + escapeHtml(ct.company_name) + '</td>' +
        '<td><span class="badge info" style="font-size:11px">' + ct.biz_type + '</span></td>' +
        '<td><span class="text-secondary" style="font-size:12px">' + billingText + '</span></td>' +
        '<td style="font-size:12px">' + ct.end_date + '</td>' +
        '<td><span class="badge ' + statusColor + '" style="font-size:11px">' + dayText + '</span></td>' +
        '<td><button class="dboard-renew" onclick="previewRenew(\'' + ct.contract_id + '\')">\u27F3 续约</button></td>' +
      '</tr>';
    }
    h += '</tbody></table></div>';
  }
  h += '</div>';
  return h;
}

function renderOversellRisk(oversellRisk) {
  var h = '<div class="dboard-section">';
  h += '<div class="dboard-section-header purple"><h2>\u26A1 超卖风险看板</h2><span class="dboard-section-count">' + oversellRisk.length + ' 条</span></div>';
  if (oversellRisk.length === 0) {
    h += '<div class="dboard-empty"><div class="dboard-empty-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="dboard-empty-text">\u2705 所有项目带宽分配均在安全范围内</div></div>';
  } else {
    h += '<div class="dboard-table-wrap"><table><thead><tr><th>项目</th><th>承载线路</th><th>总带宽</th><th>已分配</th><th>超卖比</th><th>预警</th></tr></thead><tbody>';
    for (var i = 0; i < oversellRisk.length; i++) {
      var o = oversellRisk[i];
      var ratio = parseFloat(o.oversell_ratio);
      var isDanger = ratio >= 150;
      h += '<tr>' +
        '<td><strong>' + escapeHtml(o.node_name) + '</strong></td>' +
        '<td><span class="text-secondary">' + o.circuit_number + '</span></td>' +
        '<td>' + o.total_bandwidth + ' Mbps</td>' +
        '<td>' + o.allocated_total + ' Mbps</td>' +
        '<td><span style="font-weight:600;color:' + (isDanger ? '#dc2626' : '#d97706') + '">' + o.oversell_ratio + '%</span></td>' +
        '<td><span class="badge ' + (isDanger ? 'danger' : 'warning') + '" style="font-size:11px">' + (isDanger ? '\uD83D\uDD34 拥堵风险' : '\u26A0\uFE0F 注意') + '</span></td>' +
      '</tr>';
    }
    h += '</tbody></table></div>';
  }
  h += '</div>';
  return h;
}

function renderCascadeImpact(expiringLines) {
  var h = '<div class="dboard-section">';
  h += '<div class="dboard-section-header blue"><h2>\u26A1 级联影响：运营商线路到期对下游影响</h2><span class="dboard-section-count">' + expiringLines.length + ' 条</span></div>';
  if (expiringLines.length === 0) {
    h += '<div class="dboard-empty"><div class="dboard-empty-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="dboard-empty-text">\u2705 60天内无到期线路</div></div>';
  } else {
    for (var i = 0; i < expiringLines.length; i++) {
      var el = expiringLines[i];
      var dr = Math.round(el.days_remaining);
      var isExpired = dr < 0;
      var tagText = isExpired ? '已过期 ' + Math.abs(dr) + '天' : dr + '天后到期';
      h += '<div class="dboard-alert ' + (isExpired || dr <= 15 ? 'red' : 'yellow') + '">' +
        '<div class="dboard-alert-info">' +
          '<div class="dboard-alert-title">' +
            '<span class="dboard-alert-tag ' + (isExpired ? 'danger' : (dr <= 15 ? 'danger' : 'warning')) + '">' + tagText + '</span> ' +
            el.circuit_number + ' <span class="text-secondary" style="font-weight:400;font-size:13px">(' + el.provider + ')</span>' +
          '</div>' +
          '<div class="dboard-alert-desc">此线路中断将影响 <strong>' + (el.affected_nodes||0) + '</strong> 个项目及 <strong>' + (el.affected_contracts||0) + '</strong> 个客户合同</div>' +
          '<div class="dboard-alert-meta">企微推送：<code style="font-size:11px;opacity:.8">主线即将到期，将导致 X 园区及旗下 Y 家客户断网！</code></div>' +
        '</div></div>';
    }
  }
  h += '</div>';
  return h;
}

// ===== Premium 统计卡片 =====
function premiumStatCard(color, label, value, iconPath) {
  var colorMap = {
    primary: { bar: 'linear-gradient(90deg,#3b82f6,#60a5fa)', bg: '#eff6ff', stroke: '#3b82f6', text: '#1d4ed8' },
    success: { bar: 'linear-gradient(90deg,#10b981,#34d399)', bg: '#ecfdf5', stroke: '#10b981', text: '#047857' },
    danger: { bar: 'linear-gradient(90deg,#ef4444,#f87171)', bg: '#fef2f2', stroke: '#ef4444', text: '#b91c1c' },
    info: { bar: 'linear-gradient(90deg,#06b6d4,#22d3ee)', bg: '#ecfeff', stroke: '#06b6d4', text: '#0e7490' }
  };
  var c = colorMap[color] || colorMap.primary;
  return '<div class="dboard-stat">' +
    '<div class="dboard-stat-bar" style="background:' + c.bar + '"></div>' +
    '<div class="dboard-stat-body">' +
      '<div class="dboard-stat-icon" style="background:' + c.bg + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="' + c.stroke + '" stroke-width="1.8"><path d="' + iconPath + '"/></svg>' +
      '</div>' +
      '<div class="dboard-stat-info">' +
        '<div class="dboard-stat-number" style="color:' + c.text + '">' + value + '</div>' +
        '<div class="dboard-stat-label">' + label + '</div>' +
      '</div>' +
    '</div></div>';
}
