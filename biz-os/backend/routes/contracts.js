const express = require('express');
const router = express.Router();
const { getDatabase, updateContractStatuses } = require('../database');
const { generateXlsx, sendExcelResponse, parseImportData } = require('../services/csvService');

// 获取所有合同（支持搜索）
router.get('/', (req, res) => {
  const db = getDatabase();
  const { status, customer_id, search } = req.query;
  let sql = `
    SELECT ct.*, c.company_name, c.cust_type, sn.node_name, sn.node_type
    FROM contracts ct
    LEFT JOIN customers c ON ct.customer_id = c.customer_id
    LEFT JOIN spatial_nodes sn ON ct.node_id = sn.node_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND ct.status = ?'; params.push(status); }
  if (customer_id) { sql += ' AND ct.customer_id = ?'; params.push(customer_id); }
  if (search) {
    sql += ' AND (ct.contract_id LIKE ? OR c.company_name LIKE ? OR ct.biz_type LIKE ? OR ct.status LIKE ?)';
    var like = '%' + search + '%';
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY ct.end_date ASC';

  const rows = db.all(sql, ...params);
  res.json(rows);
});

// 导出 Excel
router.get('/export', async (req, res) => {
  const db = getDatabase();
  const rows = db.all('SELECT contract_id,customer_id,biz_type,node_id,allocated_bw,start_date,duration_months,monthly_fee,billing_cycle FROM contracts ORDER BY contract_id');
  var fields = ['contract_id', 'customer_id', 'biz_type', 'node_id', 'allocated_bw', 'start_date', 'duration_months', 'monthly_fee', 'billing_cycle'];
  var data = rows.map(function(r) {
    return fields.map(function(f) { return r[f] || ''; });
  });
  var buf = await generateXlsx(fields, data);
  sendExcelResponse(res, '合同管理_合同列表.xlsx', buf);
});

// 下载模板
router.get('/template', async (req, res) => {
  var fields = ['contract_id', 'customer_id', 'biz_type', 'node_id', 'allocated_bw', 'start_date', 'duration_months', 'monthly_fee', 'billing_cycle'];
  var buf = await generateXlsx(fields, []);
  sendExcelResponse(res, '合同管理_导入模板.xlsx', buf);
});

// 导入 CSV 或 XLSX
router.post('/import', async (req, res) => {
  const db = getDatabase();
  const { csv, file, format } = req.body;
  if (!csv && !file) return res.status(400).json({ error: '缺少数据，请上传 CSV 或 XLSX 文件' });
  try {
    var records = await parseImportData(file || csv, format || 'csv');
    var imported = 0, errors = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r.contract_id || !r.customer_id || !r.biz_type || !r.start_date || !r.duration_months) {
        errors.push('第' + (i + 2) + '行: 缺少必填字段');
        continue;
      }
      var start = new Date(r.start_date);
      var end = new Date(start);
      end.setMonth(end.getMonth() + parseInt(r.duration_months));
      var end_date = end.toISOString().split('T')[0];
      try {
        db.run('INSERT INTO contracts (contract_id, customer_id, biz_type, node_id, allocated_bw, start_date, duration_months, end_date, monthly_fee, billing_cycle) VALUES (?,?,?,?,?,?,?,?,?,?)',
          r.contract_id, r.customer_id, r.biz_type, r.node_id || null, r.allocated_bw ? parseInt(r.allocated_bw) : null,
          r.start_date, parseInt(r.duration_months), end_date, parseFloat(r.monthly_fee) || 0, r.billing_cycle || '月');
        imported++;
      } catch (e) {
        errors.push('第' + (i + 2) + '行: ' + e.message);
      }
    }
    // 实时更新所有合同的到期状态
    updateContractStatuses();
    res.json({ success: true, imported: imported, errors: errors });
  } catch (e) {
    res.status(400).json({ error: '数据解析失败: ' + e.message });
  }
});

// 获取单个合同
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const row = db.get(`
    SELECT ct.*, c.company_name, c.cust_type, c.contact_person, c.contact_phone, sn.node_name, sn.node_type
    FROM contracts ct
    LEFT JOIN customers c ON ct.customer_id = c.customer_id
    LEFT JOIN spatial_nodes sn ON ct.node_id = sn.node_id
    WHERE ct.contract_id = ?
  `, req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该合同' });
  res.json(row);
});

// 创建合同（自动计算 end_date）
router.post('/', (req, res) => {
  const db = getDatabase();
  const { contract_id, customer_id, biz_type, node_id, allocated_bw, start_date, duration_months, monthly_fee, billing_cycle } = req.body;
  if (!contract_id || !customer_id || !biz_type || !start_date || !duration_months) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  const start = new Date(start_date);
  const end = new Date(start);
  end.setMonth(end.getMonth() + parseInt(duration_months));
  const end_date = end.toISOString().split('T')[0];

  try {
    db.run('INSERT INTO contracts (contract_id, customer_id, biz_type, node_id, allocated_bw, start_date, duration_months, end_date, monthly_fee, billing_cycle) VALUES (?,?,?,?,?,?,?,?,?,?)',
      contract_id, customer_id, biz_type, node_id || null, allocated_bw || null, start_date, duration_months, end_date, monthly_fee || 0, billing_cycle || '月');
    // 实时更新合同到期状态（根据 end_date 与今天对比自动修正状态）
    updateContractStatuses();
    res.json({ success: true, contract_id, end_date });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 一键续约（克隆原合同，更新日期）
router.post('/:id/renew', async (req, res) => {
  const db = getDatabase();
  const oldContract = db.get('SELECT * FROM contracts WHERE contract_id = ?', req.params.id);
  if (!oldContract) return res.status(404).json({ error: '未找到原合同' });

  const { new_start_date, new_duration_months, new_billing_cycle } = req.body;
  const startDate = new_start_date || oldContract.end_date;
  const duration = new_duration_months || oldContract.duration_months;
  const billingCycle = new_billing_cycle || oldContract.billing_cycle || '月';

  const count = db.get("SELECT COUNT(*) as c FROM contracts WHERE contract_id LIKE 'HT-2026-%'");
  const newId = `HT-2026-${String((count.c || 0) + 1).padStart(3, '0')}`;

  const start = new Date(startDate);
  const end = new Date(start);
  end.setMonth(end.getMonth() + parseInt(duration));
  const newEndDate = end.toISOString().split('T')[0];

  try {
    db.run('INSERT INTO contracts (contract_id, customer_id, biz_type, node_id, allocated_bw, start_date, duration_months, end_date, monthly_fee, billing_cycle, status, renewed_from) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      newId, oldContract.customer_id, oldContract.biz_type, oldContract.node_id, oldContract.allocated_bw, startDate, duration, newEndDate, oldContract.monthly_fee, billingCycle, '进行中', req.params.id);
    db.run("UPDATE contracts SET status='已续约', updated_at=datetime('now','localtime') WHERE contract_id=?", req.params.id);
    // 实时更新所有合同到期状态
    updateContractStatuses();

    // 微信续约通知
    var wechatResult = { sent: false, error: null, note: '' };
    try {
      const { sendRenewalNotice, getWechatConfig } = require('../services/wechatService');
      var wxCfg = getWechatConfig();
      if (!wxCfg.appid || wxCfg.appid === 'wx0000000000000000') {
        wechatResult.note = '微信 AppID 未配置';
      } else if (!wxCfg.appid.match(/^wx/)) {
        wechatResult.note = 'AppID 格式不正确（应以 wx 开头，当前是 ' + wxCfg.appid + '）';
      } else if (!wxCfg.templateRenew) {
        wechatResult.note = '续约模板ID未配置';
      } else {
        var customer = db.get('SELECT company_name, wechat_openid FROM customers WHERE customer_id = ?', oldContract.customer_id);
        if (customer && customer.wechat_openid) {
          var result = await sendRenewalNotice(customer.wechat_openid, customer.company_name, newId, newEndDate, oldContract.biz_type, oldContract.monthly_fee, billingCycle);
          wechatResult.sent = result.success;
          wechatResult.error = result.error || null;
          if (result.success) console.log('[Renew] 续约微信通知已发送 -> ' + newId);
          else console.warn('[Renew] 微信推送未发送: ' + (result.error || ''));
        } else {
          wechatResult.note = '客户未绑定微信 OpenID';
        }
      }
    } catch (e) {
      wechatResult.error = e.message;
      console.warn('[Renew] 微信推送服务异常:', e.message);
    }

    res.json({ success: true, new_contract_id: newId, new_end_date: newEndDate, wechat: wechatResult });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 撤销续约（删除续约产生的新合同，还原原合同状态）
router.post('/:id/undo-renew', (req, res) => {
  const db = getDatabase();
  const oldContract = db.get('SELECT * FROM contracts WHERE contract_id = ? AND status = ?', req.params.id, '已续约');
  if (!oldContract) return res.status(400).json({ error: '该合同不是续约状态或不存在' });

  // 查找续约产生的新合同（优先通过 renewed_from 关联，向后兼容：通过业务逻辑推断）
  var newContract = db.get('SELECT * FROM contracts WHERE renewed_from = ?', oldContract.contract_id);
  if (!newContract) {
    // 回退搜索：同客户、进行中、开始日匹配原合同到期日
    newContract = db.get(
      "SELECT * FROM contracts WHERE customer_id = ? AND status = '进行中' AND start_date = ? AND contract_id != ?",
      oldContract.customer_id, oldContract.end_date, oldContract.contract_id
    );
  }

  if (!newContract) return res.status(400).json({ error: '未找到续约产生的新合同，可能已被删除' });

  try {
    // 删除新合同
    db.run('DELETE FROM contracts WHERE contract_id = ?', newContract.contract_id);
    // 还原原合同状态为'进行中'，让 updateContractStatuses 自动校正
    db.run("UPDATE contracts SET renewed_from = NULL, status='进行中', updated_at=datetime('now','localtime') WHERE contract_id=?", oldContract.contract_id);
    // 自动校正所有合同到期状态
    updateContractStatuses();

    res.json({
      success: true,
      reverted_contract: oldContract.contract_id,
      deleted_contract: newContract.contract_id,
      customer_id: oldContract.customer_id
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 更新合同
router.put('/:id', (req, res) => {
  const db = getDatabase();
  const { biz_type, node_id, allocated_bw, start_date, duration_months, monthly_fee, status, billing_cycle } = req.body;

  let endDate = null;
  if (start_date && duration_months) {
    const start = new Date(start_date);
    const end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(duration_months));
    endDate = end.toISOString().split('T')[0];
  }

  try {
    db.run("UPDATE contracts SET biz_type=?, node_id=?, allocated_bw=?, start_date=?, duration_months=?, end_date=?, monthly_fee=?, billing_cycle=?, status=?, updated_at=datetime('now','localtime') WHERE contract_id=?",
      biz_type || null, node_id || null, allocated_bw || null, start_date || null, duration_months || null,
      endDate, monthly_fee || 0, billing_cycle || '月', status || '进行中', req.params.id);
    // 实时更新所有合同到期状态
    updateContractStatuses();
    res.json({ success: true, end_date: endDate });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 删除
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  try {
    db.run('DELETE FROM contracts WHERE contract_id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 批量删除
router.post('/batch-delete', (req, res) => {
  const db = getDatabase();
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '缺少待删除ID列表' });
  }
  try {
    for (let i = 0; i < ids.length; i++) {
      db.run('DELETE FROM contracts WHERE contract_id = ?', ids[i]);
    }
    res.json({ success: true, count: ids.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
