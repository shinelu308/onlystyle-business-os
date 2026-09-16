const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');

// Dashboard 聚合数据
router.get('/', (req, res) => {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  // 1. 红区：已过期 + 15天内到期的运营商大线
  const redZoneLines = db.all(`
    SELECT sl.*,
      (SELECT COUNT(DISTINCT pl.node_id) FROM project_lines pl WHERE pl.line_id = sl.line_id) as affected_nodes,
      (SELECT COUNT(*) FROM project_lines pl JOIN contracts ct ON pl.node_id = ct.node_id WHERE pl.line_id = sl.line_id AND ct.status IN ('进行中','即将到期')) as affected_customers,
      CASE WHEN sl.expire_date < ? THEN 1 ELSE 0 END as is_expired
    FROM supplier_lines sl
    WHERE sl.expire_date < ? OR (sl.expire_date >= ? AND sl.expire_date <= date(?, '+15 days'))
    ORDER BY sl.expire_date ASC
  `, today, today, today, today);

  // 2. 黄区：30天内到期的客户合同 + 已过期合同（从合同管理维度分析，不采集客户管理数据）
  const yellowZoneContracts = db.all(`
    SELECT ct.contract_id, ct.customer_id, ct.biz_type, ct.node_id, ct.allocated_bw,
           ct.start_date, ct.duration_months, ct.end_date, ct.monthly_fee, ct.billing_cycle, ct.status,
           c.company_name, sn.node_name
    FROM contracts ct
    LEFT JOIN customers c ON ct.customer_id = c.customer_id
    LEFT JOIN spatial_nodes sn ON ct.node_id = sn.node_id
    WHERE (ct.end_date >= ? AND ct.end_date <= date(?, '+30 days'))
       OR (ct.end_date < ? AND ct.status = '已到期')
    ORDER BY ct.end_date ASC
  `, today, today, today);

  // 3. 运营商大线临期（60天预警 + 已过期）
  const expiringLines = db.all(`
    SELECT sl.*,
      julianday(sl.expire_date) - julianday(?) as days_remaining,
      (SELECT COUNT(*) FROM project_lines pl WHERE pl.line_id = sl.line_id) as affected_nodes,
      (SELECT COUNT(*) FROM project_lines pl JOIN contracts ct ON pl.node_id = ct.node_id WHERE pl.line_id = sl.line_id AND ct.status IN ('进行中','即将到期')) as affected_contracts
    FROM supplier_lines sl
    WHERE sl.expire_date <= date(?, '+60 days')
    ORDER BY sl.expire_date ASC
  `, today, today);

  // 4. 超卖风险检测（按线路聚合）
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

  // 5. 统计数据
  const stats = {
    total_lines: db.get('SELECT COUNT(*) as c FROM supplier_lines').c,
    total_nodes: db.get('SELECT COUNT(*) as c FROM spatial_nodes').c,
    total_customers: db.get('SELECT COUNT(*) as c FROM customers').c,
    active_contracts: db.get("SELECT COUNT(*) as c FROM contracts WHERE status IN ('进行中','即将到期')").c,
    expired_today: db.get("SELECT COUNT(*) as c FROM contracts WHERE status = '已到期'").c,
    red_alert_count: redZoneLines.length,
    yellow_alert_count: yellowZoneContracts.length,
    oversell_count: oversellRisk.length
  };

  res.json({
    stats,
    redZone: redZoneLines,
    yellowZone: yellowZoneContracts,
    expiringLines,
    oversellRisk
  });
});

module.exports = router;
