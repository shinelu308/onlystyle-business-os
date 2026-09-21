const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');

/* ============================================================
   数据看板 /api/dashboard
   v2：新增 scope / kpis / expiring / todos / revenue
       旧字段 stats / redZone / yellowZone / expiringLines / oversellRisk 全部保留
       （其它调用方与 e2e 脚本仍可用）
   ============================================================ */

/** 本地日期 YYYY-MM-DD（不能用 toISOString，会因时区偏移一天） */
function localDate(d) {
  const x = d || new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}
function localDateTime(d) {
  const x = d || new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return localDate(x) + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
}
/** 千分位 */
function thousands(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** KPI「N 天内到期合同」的脚注：把「已逾期」和「7 天内到期」分开陈述，
 *  不要揉成一个含糊的数字 —— 前者在窗口外，说「其中」会让运营以为它是子集。 */
function noteOfExpiring(overdue, soon, rangeDays) {
  const parts = [];
  if (overdue > 0) parts.push('已逾期 <b class="kpi-emph">' + overdue + '</b> 份');
  if (soon > 0) parts.push('<b class="kpi-emph">' + soon + '</b> 份 7 天内到期');
  if (!parts.length) return rangeDays + ' 天内无人需要立即续约';
  return parts.join(' · ');
}

const RANGE_DAYS = { '7d': 7, '30d': 30, 'q': 90 };

router.get('/', (req, res) => {
  const db = getDatabase();
  const today = localDate();

  // 时间范围（前端胶囊组）—— 合同到期提醒的窗口跟着它走
  const range = RANGE_DAYS[req.query.range] ? req.query.range : '30d';
  const rangeDays = RANGE_DAYS[range];

  // ---------- 1. 红区：已过期 + 15天内到期的运营商大线 ----------
  const redZoneLines = db.all(`
    SELECT sl.*,
      (SELECT COUNT(DISTINCT pl.node_id) FROM project_lines pl WHERE pl.line_id = sl.line_id) as affected_nodes,
      (SELECT COUNT(*) FROM project_lines pl JOIN contracts ct ON pl.node_id = ct.node_id WHERE pl.line_id = sl.line_id AND ct.status IN ('进行中','即将到期')) as affected_customers,
      CASE WHEN sl.expire_date < ? THEN 1 ELSE 0 END as is_expired
    FROM supplier_lines sl
    WHERE sl.expire_date < ? OR (sl.expire_date >= ? AND sl.expire_date <= date(?, '+15 days'))
    ORDER BY sl.expire_date ASC
  `, today, today, today, today);

  // ---------- 2. 黄区：窗口内到期 + 近 90 天已过期（看板主表格数据源） ----------
  const yellowZoneContracts = db.all(`
    SELECT ct.contract_id, ct.customer_id, ct.biz_type, ct.node_id, ct.allocated_bw,
           ct.start_date, ct.duration_months, ct.end_date, ct.monthly_fee, ct.billing_cycle, ct.status,
           ct.plan_name,
           c.company_name, sn.node_name
    FROM contracts ct
    LEFT JOIN customers c ON ct.customer_id = c.customer_id
    LEFT JOIN spatial_nodes sn ON ct.node_id = sn.node_id
    WHERE ct.end_date <= date(?, '+' || ? || ' days')
      AND ct.end_date >= date(?, '-90 days')
    ORDER BY ct.end_date ASC
  `, today, rangeDays, today);

  // ---------- 3. 运营商大线临期（60天预警 + 已过期） ----------
  const expiringLines = db.all(`
    SELECT sl.*,
      julianday(sl.expire_date) - julianday(?) as days_remaining,
      (SELECT COUNT(*) FROM project_lines pl WHERE pl.line_id = sl.line_id) as affected_nodes,
      (SELECT COUNT(*) FROM project_lines pl JOIN contracts ct ON pl.node_id = ct.node_id WHERE pl.line_id = sl.line_id AND ct.status IN ('进行中','即将到期')) as affected_contracts
    FROM supplier_lines sl
    WHERE sl.expire_date <= date(?, '+60 days')
    ORDER BY sl.expire_date ASC
  `, today, today);

  // ---------- 4. 超卖风险检测（按线路聚合） ----------
  const oversellRisk = db.all(`
    SELECT sn.node_id, sn.node_name, sl.line_id, sl.provider, sl.circuit_number, sl.total_bandwidth,
      COALESCE(SUM(ct.allocated_bw), 0) as allocated_total,
      CASE WHEN sl.total_bandwidth > 0 THEN ROUND(CAST(COALESCE(SUM(ct.allocated_bw), 0) AS REAL) / sl.total_bandwidth * 100, 1) ELSE 0 END as oversell_ratio
    FROM project_lines pl
    JOIN spatial_nodes sn ON pl.node_id = sn.node_id
    JOIN supplier_lines sl ON pl.line_id = sl.line_id
    LEFT JOIN contracts ct ON sn.node_id = ct.node_id AND ct.biz_type IN ('宽带自运营','宽带直售')
    GROUP BY sn.node_id, sl.line_id
    HAVING oversell_ratio > 100
    ORDER BY oversell_ratio DESC
  `);

  // ---- 线索池（**不计入客户口径**）----
  // 「在管客户总数」只统计 customers 表 = 已被确认的业务主体。
  // 未签约线索住在 leads 表，必须分开陈述，否则 KPI 会被撑虚。
  // 历史 bug：官网表单提交时直接往 customers 插一条 cust_type='官网线索'，
  // 于是没签约的线索也被算进了在管客户总数（现已改为线索只进 leads 表）。
  //
  // ⚠️ 必须放在 stats 之前：下面 stats 里要用到它，而 const 有暂时性死区，
  //    写在后面会直接 ReferenceError（已经把看板整个 500 过一次）。
  const pendingLeads = db.get(
    "SELECT COUNT(*) as c FROM leads WHERE status NOT IN ('won','lost')"
  ).c;

  // ---------- 5. 兼容用统计数据（原有字段，含义不变） ----------
  const stats = {
    total_lines: db.get('SELECT COUNT(*) as c FROM supplier_lines').c,
    total_nodes: db.get('SELECT COUNT(*) as c FROM spatial_nodes').c,
    // total_customers 只算 customers 表（已确认的客户）。
    // 线索单列在 total_leads / pending_leads，任何地方都不要把两者相加。
    total_customers: db.get('SELECT COUNT(*) as c FROM customers').c,
    total_leads: db.get('SELECT COUNT(*) as c FROM leads').c,
    pending_leads: pendingLeads,
    active_contracts: db.get("SELECT COUNT(*) as c FROM contracts WHERE status IN ('进行中','即将到期')").c,
    expired_today: db.get("SELECT COUNT(*) as c FROM contracts WHERE status = '已到期'").c,
    red_alert_count: redZoneLines.length,
    yellow_alert_count: yellowZoneContracts.length,
    oversell_count: oversellRisk.length
  };

  /* ============================================================
    v2 部分
    ============================================================ */

  // ---- KPI 1：在管客户总数 + 本月新增 ----
  const newThisMonth = db.get(
    "SELECT COUNT(*) as c FROM customers WHERE created_at >= date('now','start of month')"
  ).c;

  // ---- KPI 2：窗口内到期合同 + 逾期情况 ----
  const expiringInWindow = db.get(
    "SELECT COUNT(*) as c FROM contracts WHERE end_date >= ? AND end_date <= date(?, '+' || ? || ' days')",
    today, today, rangeDays
  ).c;
  // 已逾期：到期日已过且没续约（已续约的老合同不算逾期，它是正常闭环）
  const overdueCount = db.get(
    "SELECT COUNT(*) as c FROM contracts WHERE end_date < ? AND status <> '已续约'", today
  ).c;
  // 7 天内（含今天）即将到期
  const soonIn7 = db.get(
    "SELECT COUNT(*) as c FROM contracts WHERE end_date >= ? AND end_date < date(?, '+7 days') AND status <> '已续约'",
    today, today
  ).c;

  // ---- KPI 3：在管合同总额（按当前月费年化） ----
  const monthlySum = db.get(
    "SELECT COALESCE(SUM(monthly_fee), 0) as s FROM contracts WHERE status IN ('进行中','即将到期')"
  ).s;

  // ---- KPI 4：客户续约率（有后继合同的已到期合同 / 全部已到期合同） ----
  // 口径写死在这里，前端不再推算；分母为 0 时返回 null，前端显示「—」
  const expiredTotal = db.get(
    "SELECT COUNT(*) as c FROM contracts WHERE end_date < ?", today
  ).c;
  const renewedTotal = db.get(`
    SELECT COUNT(*) as c FROM contracts old
    WHERE old.end_date < ?
      AND EXISTS (SELECT 1 FROM contracts n WHERE n.renewed_from = old.contract_id)
  `, today).c;
  const renewRate = expiredTotal > 0 ? Math.round(renewedTotal / expiredTotal * 1000) / 10 : null;

  // ---- 主表格行 ----
  const expiring = yellowZoneContracts.map((ct) => {
    const days = Math.round((new Date(ct.end_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    // 套餐名：优先用 plan_name，没有就按业务类型拼一个可读的
    let plan = (ct.plan_name || '').trim();
    if (!plan) {
      if (ct.biz_type === '宽带自运营' || ct.biz_type === '宽带直售') {
        plan = (ct.allocated_bw ? ct.allocated_bw + 'M 带宽' : '宽带') + (ct.billing_cycle ? ' · ' + ct.billing_cycle + '付' : '');
      } else {
        plan = ct.biz_type || '—';
      }
    }
    return {
      contract_id: ct.contract_id,
      customer_id: ct.customer_id,
      company_name: ct.company_name || '—',
      biz_type: ct.biz_type || '—',
      plan: plan,
      end_date: ct.end_date,
      days_left: days,
      status: ct.status,
      monthly_fee: ct.monthly_fee || 0,
      node_name: ct.node_name || ''
    };
  });

  /* 表格排序：按「还需要不需要动作」分层，而不是单纯按到期日。
     SQL 那边是 ORDER BY end_date ASC，直接沿用会把 3 个月前的已到期、已续约合同
     顶到最上面 —— 但那些要么已经续掉了、要么早就黄了，把真正要跟进的挤出首屏。
       0 即将到期：还没到期，按剩余天数升序（最急的在前）
       1 已到期  ：需要挽回，按逾期时长升序（刚逾期的先补救，太久的意义递减）
       2 已续约  ：已闭环的历史记录，沉到最后
       3 其它    ：兜底 */
  const STATUS_ORDER = { '即将到期': 0, '已到期': 1, '已续约': 2 };
  expiring.sort((a, b) => {
    const oa = STATUS_ORDER[a.status] === undefined ? 3 : STATUS_ORDER[a.status];
    const ob = STATUS_ORDER[b.status] === undefined ? 3 : STATUS_ORDER[b.status];
    if (oa !== ob) return oa - ob;
    if (oa === 0) return a.days_left - b.days_left;    // 即将到期：天数小的在前
    if (oa === 1) return b.days_left - a.days_left;    // 已到期：days_left 更接近 0 的在前
    return b.end_date.localeCompare(a.end_date);       // 已续约 / 其它：新的在前
  });

  /* ---- 右栏：待办事项（只读派生，绝不调 reminderEngine —— 它会真发企微/微信） ----
     排序模型：先按「严重层级」分层，同层内按剩余天数升序（越少越靠前）。
     层级依据「影响面 × 紧迫度」：
       L0 运营商大线已逾期 —— 断了会波及整栋楼，永远置顶
       L1 客户合同 ≤3 天
       L2 运营商大线 ≤15 天
       L3 客户合同 4~7 天（>7 天不进待办，看表格就够了）
       L4 运营商大线 16~60 天
       L5 超卖风险 —— 结构性风险、与时间无关，排在所有时间性待办之后
     颜色统一按天数判定：已逾期或 ≤3 天 = 红（今天必须处理），其余 = 黄。
     注意：这是分层排序，不是「线路一定排合同前面」——
     否则 5 条线路待办会把合同跟进全部挤出 top6。 */
  const LAYER = { lineExpired: 0, contractSoon: 1, lineSoon: 2, contractWarn: 3, lineWarn: 4, oversell: 5 };
  const levelOf = (d) => (d < 0 || d <= 3) ? 'danger' : 'warn';

  const todos = [];
  // ① 运营商大线临期 / 已逾期
  expiringLines.forEach((l) => {
    const d = Math.round(l.days_remaining);
    if (d > 60) return;
    const expired = d < 0;
    const layer = expired ? LAYER.lineExpired : (d <= 15 ? LAYER.lineSoon : LAYER.lineWarn);
    todos.push({
      level: levelOf(d),
      sort: layer * 100 + d,
      title: '运营商大线 ' + (expired ? '已逾期 ' + Math.abs(d) + ' 天' : d + ' 天后到期'),
      meta: (l.circuit_number || l.line_id) + ' · ' + (l.provider || '—') + ' · ' +
            (l.affected_contracts ? l.affected_contracts + ' 个合同受影响' : '暂无客户受影响')
    });
  });
  // ② 客户合同临期（7 天内）
  expiring.forEach((ct) => {
    if (ct.days_left > 7 || ct.days_left < 0) return;
    const layer = ct.days_left <= 3 ? LAYER.contractSoon : LAYER.contractWarn;
    todos.push({
      level: levelOf(ct.days_left),
      sort: layer * 100 + ct.days_left,
      title: ct.company_name + ' 合同 ' + ct.days_left + ' 天后到期',
      meta: ct.contract_id + ' · ' + (ct.days_left === 0 ? '今天' : ct.days_left === 1 ? '明天' : ct.days_left + ' 天后') + ' · 待跟进'
    });
  });
  // ③ 超卖风险
  oversellRisk.forEach((o) => {
    todos.push({
      level: 'warn',
      sort: LAYER.oversell * 100,
      title: o.node_name + ' 带宽超卖 ' + o.oversell_ratio + '%',
      meta: (o.circuit_number || o.line_id) + ' · ' + o.allocated_total + '/' + o.total_bandwidth + ' Mbps'
    });
  });
  todos.sort((a, b) => a.sort - b.sort);
  const todoList = todos.slice(0, 6);

  // ---- 右栏：业务线收入占比（按当前月费） ----
  const revRows = db.all(`
    SELECT biz_type, COALESCE(SUM(monthly_fee), 0) as amount
    FROM contracts
    WHERE status IN ('进行中','即将到期')
    GROUP BY biz_type
    ORDER BY amount DESC
  `);
  const revTotal = revRows.reduce((s, r) => s + r.amount, 0);
  const revenue = revTotal > 0 ? revRows.map((r) => ({
    name: r.biz_type || '未分类',
    amount: '¥ ' + thousands(r.amount / 10000 * 10) / 10 + ' 万/月',
    pct: Math.round(r.amount / revTotal * 100)
  })) : [];

  // ---- v2 响应 ----
  const v2 = {
    scope: {
      bizLine: '宽带与 IT 服务',
      updatedAt: localDateTime(),
      range: range,
      rangeDays: rangeDays
    },
    kpis: {
      customers: {
        label: '在管客户总数', value: db.get('SELECT COUNT(*) as c FROM customers').c,
        unit: '家', tag: '活跃', tagClass: 'tag-blue',
        delta: newThisMonth > 0 ? { dir: 'up', text: String(newThisMonth) } : null,
        // 明确写出「线索不计入」——否则用户看到线索页有 N 条，
        // 又看到客户数没变，会以为数字错了。数字没错，是口径分开了。
        note: (newThisMonth > 0 ? '本月新增 ' + newThisMonth + ' 家' : '本月暂无新增') +
              (pendingLeads > 0
                ? ' · 另有 <b class="kpi-emph">' + pendingLeads + '</b> 条线索待跟进（未计入）'
                : '')
      },
      expiring: {
        label: rangeDays + ' 天内到期合同', value: expiringInWindow,
        unit: '份',
        // 有逾期就是红标（客户流失信号），只有临期是黄标，都没有才是绿标
        tag: overdueCount > 0 ? '有逾期' : (soonIn7 > 0 ? '需跟进' : '正常'),
        tagClass: overdueCount > 0 ? 'tag-red' : (soonIn7 > 0 ? 'tag-amber' : 'tag-green'),
        // 口语化陈述，避免「其中 N 份」这种让人以为 N 是子集的说法
        note: noteOfExpiring(overdueCount, soonIn7, rangeDays)
      },
      contractSum: {
        label: '在管合同总额', prefix: '¥',
        value: thousands(monthlySum * 12 / 10000), unit: '万/年',
        delta: null,                       // 环比需要历史快照表，暂缺
        note: '按当前月费年化 · 环比待历史数据'
      },
      renewRate: {
        label: '客户续约率',
        value: renewRate === null ? '—' : String(renewRate), unit: renewRate === null ? '' : '%',
        delta: null,                       // 同比需要历史，暂缺
        note: renewRate === null
          ? '暂无已到期合同，数据积累中'
          : renewedTotal + ' / ' + expiredTotal + ' 份已到期合同完成续约'
      }
    },
    expiring: expiring,
    todos: todoList,
    revenue: revenue
  };

  res.json(Object.assign({}, v2, {
    // 旧字段保留，保证兼容
    stats: stats,
    redZone: redZoneLines,
    yellowZone: yellowZoneContracts,
    expiringLines: expiringLines,
    oversellRisk: oversellRisk
  }));
});

module.exports = router;
