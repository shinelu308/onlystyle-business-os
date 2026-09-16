const { getDatabase } = require('../database');

/**
 * 智能级联提醒引擎（增强版）
 * 每天 09:00 扫描三个核心策略：
 *   策略A：运营商大线临期审查 → 级联影响分析
 *   策略B：客户合同到期 → 对内企微待办 + 对外微信模板消息（给终端客户）
 *   策略C：按时间段归并，集中微信通知指定管理人员（多人 + 自定义时间段）
 */
function runReminderEngine() {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const alerts = [];

  console.log('[提醒引擎] ' + new Date().toLocaleString() + ' 开始扫描...');

  // 读取自定义时间段配置
  var advanceDays = [60, 30, 15, 7, 3, 1];
  try {
    var configRow = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'reminder_advance_days'");
    if (configRow && configRow.setting_value) {
      var parsed = JSON.parse(configRow.setting_value);
      if (Array.isArray(parsed) && parsed.length > 0) advanceDays = parsed;
    }
  } catch(e) { /* 使用默认值 */ }

  // ====== 策略A：运营商大线临期审查 ======
  const expiringLines = db.all(`
    SELECT sl.*, julianday(sl.expire_date) - julianday(?) as days_remaining
    FROM supplier_lines sl
    WHERE sl.expire_date <= date(?, '+60 days')
    ORDER BY sl.expire_date ASC
  `, today, today);

  for (const line of expiringLines) {
    const affectedNodes = db.all(`
      SELECT sn.*,
        (SELECT COUNT(*) FROM contracts ct WHERE ct.node_id = sn.node_id AND ct.status IN ('进行中','即将到期')) as customer_count
      FROM spatial_nodes sn
      WHERE sn.node_id IN (SELECT pl.node_id FROM project_lines pl WHERE pl.line_id = ?)
    `, line.line_id);

    const totalCustomers = affectedNodes.reduce((sum, n) => sum + n.customer_count, 0);
    const nodeNames = affectedNodes.map(n => n.node_name).join('、');
    const isUrgent = line.days_remaining <= 15;

    const alert = {
      type: 'supplier_line',
      level: isUrgent ? '🔴 高危' : '🟡 预警',
      title: isUrgent ? '⚠️ 运营商大线即将到期 — 极其紧急' : '⚠️ 运营商大线即将到期',
      line_id: line.line_id,
      provider: line.provider,
      circuit_number: line.circuit_number,
      expire_date: line.expire_date,
      days_remaining: Math.round(line.days_remaining),
      affected_nodes: nodeNames,
      total_customers: totalCustomers,
      wecom_payload: {
        msgtype: 'markdown',
        markdown: {
          content: '### <font color="' + (isUrgent ? 'warning' : 'info') + '">' + (isUrgent ? '🔴' : '⚠️') + ' 运营商大线' + (isUrgent ? '临期断网' : '即将到期') + '预警</font>\n> **线路编号**：' + line.circuit_number + ' (' + line.provider + ')\n> **到期日期**：' + line.expire_date + ' (剩余' + Math.round(line.days_remaining) + '天)\n>\n> **⚠️ 受影响自运营空间**：<font color="comment">【' + nodeNames + '】</font>\n> **🔥 级联影响客户**：当前承载共 **' + totalCustomers + '** 家宽带客户，请立即安排续费采购！'
        }
      }
    };
    alerts.push(alert);
    console.log('  [' + alert.level + '] ' + line.circuit_number + ' 剩余' + Math.round(line.days_remaining) + '天，影响' + affectedNodes.length + '个节点，' + totalCustomers + '个客户');
  }

  // ====== 策略B：客户合同到期审查 ======
  const expiringContracts = db.all(`
    SELECT ct.*, c.company_name, c.contact_person, c.contact_phone, c.wechat_openid, c.cust_type, sn.node_name
    FROM contracts ct
    LEFT JOIN customers c ON ct.customer_id = c.customer_id
    LEFT JOIN spatial_nodes sn ON ct.node_id = sn.node_id
    WHERE ct.end_date >= ? AND ct.end_date <= date(?, '+60 days')
      AND ct.status IN ('进行中','即将到期')
    ORDER BY ct.end_date ASC
  `, today, today);

  for (const contract of expiringContracts) {
    const daysRemaining = Math.round(
      (new Date(contract.end_date) - new Date(today)) / (1000 * 60 * 60 * 24)
    );
    // 在自定义时间段中触发
    const shouldNotify = advanceDays.indexOf(daysRemaining) >= 0 || daysRemaining <= Math.min.apply(null, advanceDays);
    if (!shouldNotify) continue;

    const productName = contract.biz_type === '宽带自运营'
      ? '园区独享商务宽带 (' + (contract.allocated_bw || '?') + 'M)'
      : contract.biz_type === '宽带直售'
        ? '企业宽带 (' + (contract.allocated_bw || '?') + 'M)'
        : 'IT 桌面运维外包';

    // 对内：企微待办
    const internalAlert = {
      type: 'contract_expiring',
      level: daysRemaining <= 7 ? '🔴 紧急' : '🟡 提醒',
      title: '客户合同即将到期',
      contract_id: contract.contract_id,
      customer_name: contract.company_name,
      product_name: productName,
      end_date: contract.end_date,
      days_remaining: daysRemaining,
      biz_type: contract.biz_type,
      node_name: contract.node_name || '-',
      contact_person: contract.contact_person,
      contact_phone: contract.contact_phone,
      wecom_payload: {
        msgtype: 'markdown',
        markdown: {
          content: '### <font color="' + (daysRemaining <= 7 ? 'warning' : 'info') + '">📋 客户合同续费提醒</font>\n> **客户**：' + contract.company_name + '\n> **产品**：' + productName + '\n> **到期时间**：' + contract.end_date + '（剩余' + daysRemaining + '天）\n> **安装位置**：' + (contract.node_name || '-') + '\n> **联系人**：' + contract.contact_person + ' ' + contract.contact_phone + '\n>\n> 请相关经理及时跟进续约事宜！'
        }
      }
    };
    alerts.push(internalAlert);

    // 对外：微信模板消息（发给终端客户）
    if (contract.wechat_openid && daysRemaining <= 30) {
      try {
        const { sendExpiryNotice } = require('./wechatService');
        sendExpiryNotice(contract.wechat_openid, contract.company_name, productName, contract.end_date, contract.contract_id)
          .then(function(result) {
            if (result.success) console.log('[提醒引擎] 微信到期提醒已发送 -> ' + contract.company_name);
            else console.warn('[提醒引擎] 微信发送失败: ' + (result.error || '') + ' -> ' + contract.company_name);
          });
      } catch (e) {
        console.warn('[提醒引擎] 微信服务异常:', e.message);
      }
      alerts.push({
        type: 'wechat_template',
        touser: contract.wechat_openid,
        template_id: 'TEMPLATE_SERVICE_EXPIRY',
        data: {
          first: { value: '尊敬的' + contract.company_name + '，您的服务即将到期', color: '#173177' },
          keyword1: { value: productName },
          keyword2: { value: contract.end_date },
          keyword3: { value: contract.company_name },
          remark: { value: '尊贵的客户，您的服务即将到期。为免影响您日常办公，请联系您的专属客户经理或点击详情在线查看续约方案。' }
        }
      });
    }
  }

  // ====== 策略C：按时间段归并 → 集中微信通知管理人员 ======
  try {
    const { sendManagementConsolidated, getReminderStaffContacts } = require('./wechatService');
    const contacts = getReminderStaffContacts();

    if (contacts && contacts.length > 0) {
      // 按时间段分组
      var summaryGroups = [];
      for (var d = 0; d < advanceDays.length; d++) {
        var day = advanceDays[d];
        var groupContracts = [];
        var groupLines = [];

        // 查找到期时间在 day 天的合同
        for (var c = 0; c < expiringContracts.length; c++) {
          var ct = expiringContracts[c];
          var ctDays = Math.round((new Date(ct.end_date) - new Date(today)) / (1000 * 60 * 60 * 24));
          if (ctDays === day) {
            groupContracts.push({
              contract_id: ct.contract_id,
              company_name: ct.company_name,
              end_date: ct.end_date,
              biz_type: ct.biz_type
            });
          }
        }

        // 查找到期时间在 day 天的线路
        for (var l = 0; l < expiringLines.length; l++) {
          var line = expiringLines[l];
          var lineDays = Math.round(line.days_remaining);
          if (lineDays === day) {
            groupLines.push({
              circuit_number: line.circuit_number,
              provider: line.provider,
              expire_date: line.expire_date,
              line_id: line.line_id
            });
          }
        }

        if (groupContracts.length > 0 || groupLines.length > 0) {
          var label = '';
          if (day <= 3) label = day + '天内到期';
          else if (day <= 7) label = '7天内到期';
          else if (day <= 15) label = '15天内到期';
          else if (day <= 30) label = '30天内到期';
          else label = day + '天到期';
          summaryGroups.push({ period: day, label: label, contracts: groupContracts, lines: groupLines });
        }
      }

      // 也有已过期的线路/合同需要通知
      var overdueLines = [];
      for (var l = 0; l < expiringLines.length; l++) {
        var line = expiringLines[l];
        if (Math.round(line.days_remaining) < 0) {
          overdueLines.push({
            circuit_number: line.circuit_number,
            provider: line.provider,
            expire_date: line.expire_date,
            line_id: line.line_id
          });
        }
      }
      if (overdueLines.length > 0) {
        summaryGroups.unshift({ period: -1, label: '已过期', contracts: [], lines: overdueLines });
      }

      // 发送给每个已启用的管理人员
      if (summaryGroups.length > 0) {
        for (var i = 0; i < contacts.length; i++) {
          var contact = contacts[i];
          if (!contact.enabled && contact.enabled !== undefined && contact.enabled !== true) continue;
          if (!contact.openid) continue;

          (function(contact) {
            sendManagementConsolidated(contact.openid, contact.name || '管理员', summaryGroups, today)
              .then(function(result) {
                if (result.success) console.log('[提醒引擎] 管理通知已发送 -> ' + (contact.name || contact.openid));
                else console.warn('[提醒引擎] 管理通知发送失败: ' + (result.error || '') + ' -> ' + (contact.name || contact.openid));
              });
          })(contact);
        }
      }
    }
  } catch (e) {
    console.warn('[提醒引擎] 管理通知发送异常:', e.message);
  }

  // 更新合同状态
  const { updateContractStatuses } = require('../database');
  updateContractStatuses();

  console.log('[提醒引擎] 扫描完成，共 ' + alerts.length + ' 条提醒\n');
  return alerts;
}

module.exports = { runReminderEngine };
