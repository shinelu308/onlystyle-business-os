/**
 * 微信公众号模板消息推送服务
 * 封装 access_token 获取 + 模板消息发送
 */
const https = require('https');
const { getDatabase } = require('../database');

// 从 system_settings 中获取微信配置
function getWechatConfig() {
  const db = getDatabase();
  var appid = null, appsecret = null, templateExpire = null, templateRenew = null, templateManagement = null;
  var rows = db.all("SELECT setting_key, setting_value FROM system_settings WHERE setting_group = 'wechat'");
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.setting_key === 'wechat_appid') appid = r.setting_value;
    else if (r.setting_key === 'wechat_appsecret') appsecret = r.setting_value;
    else if (r.setting_key === 'wechat_template_id_expire') templateExpire = r.setting_value;
    else if (r.setting_key === 'wechat_template_id_renew') templateRenew = r.setting_value;
    else if (r.setting_key === 'wechat_template_id_management') templateManagement = r.setting_value;
  }
  return { appid, appsecret, templateExpire, templateRenew, templateManagement };
}

/**
 * 获取管理通知接收人列表（从 staff 表按成员ID查找微信OpenID）
 */
function getReminderStaffContacts() {
  const db = getDatabase();
  var row = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'reminder_staff_contacts'");
  if (!row || !row.setting_value) return [];
  var staffIds = [];
  try { staffIds = JSON.parse(row.setting_value); }
  catch(e) { return []; }
  if (!Array.isArray(staffIds) || staffIds.length === 0) return [];
  var contacts = [];
  for (var i = 0; i < staffIds.length; i++) {
    var staff = db.get("SELECT staff_id, name, wechat_openid FROM staff WHERE staff_id = ? AND status = 'active'", staffIds[i]);
    if (staff && staff.wechat_openid) {
      contacts.push({ name: staff.name, openid: staff.wechat_openid, staff_id: staff.staff_id });
    }
  }
  return contacts;
}

/**
 * 获取到期提前通知时间段（天数数组）
 */
function getReminderAdvanceDays() {
  const db = getDatabase();
  var row = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'reminder_advance_days'");
  if (!row || !row.setting_value) return [60, 30, 15, 7, 3, 1];
  try { return JSON.parse(row.setting_value); }
  catch(e) { return [60, 30, 15, 7, 3, 1]; }
}

// HTTP GET 封装
function httpsGet(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON 解析失败: ' + data)); }
      });
    }).on('error', function(e) {
      reject(e);
    });
  });
}

// HTTP POST 封装
function httpsPost(url, body) {
  return new Promise(function(resolve, reject) {
    var urlObj = new URL(url);
    var postData = JSON.stringify(body);
    var options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON 解析失败: ' + data)); }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.write(postData);
    req.end();
  });
}

// 获取微信 access_token（缓存到内存，过期自动刷新）
var _tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  var now = Date.now();
  // 如果缓存有效且在有效期前5分钟，直接返回
  if (_tokenCache.token && _tokenCache.expiresAt > now + 300000) {
    return _tokenCache.token;
  }

  var config = getWechatConfig();
  if (!config.appid || !config.appsecret || config.appid === 'wx0000000000000000') {
    throw new Error('微信 AppID 或 AppSecret 未配置');
  }

  var url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid='
    + encodeURIComponent(config.appid) + '&secret=' + encodeURIComponent(config.appsecret);

  var result = await httpsGet(url);
  if (result.errcode) {
    throw new Error('获取 access_token 失败: ' + result.errmsg + ' (code: ' + result.errcode + ')');
  }

  _tokenCache.token = result.access_token;
  _tokenCache.expiresAt = now + (result.expires_in || 7200) * 1000;
  console.log('[WeChat] access_token 已刷新，有效期 ' + result.expires_in + 's');
  return result.access_token;
}

// 发送微信模板消息
async function sendTemplate(touser, templateId, data, url, miniprogram) {
  var accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (e) {
    console.error('[WeChat] 获取 token 失败，无法发送模板消息:', e.message);
    return { success: false, error: e.message };
  }

  var body = {
    touser: touser,
    template_id: templateId,
    data: data,
    url: url || ''
  };
  if (miniprogram) body.miniprogram = miniprogram;

  try {
    var apiUrl = 'https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=' + encodeURIComponent(accessToken);
    var result = await httpsPost(apiUrl, body);

    if (result.errcode === 0) {
      console.log('[WeChat] 模板消息发送成功 -> touser=' + touser + ', msgid=' + result.msgid);
      return { success: true, msgid: result.msgid };
    } else {
      console.error('[WeChat] 模板消息发送失败:', result.errmsg, '(code:', result.errcode + ')');
      return { success: false, error: result.errmsg, errcode: result.errcode };
    }
  } catch (e) {
    console.error('[WeChat] 模板消息发送异常:', e.message);
    return { success: false, error: e.message };
  }
}

// 发送续约成功模板消息
async function sendRenewalNotice(openid, companyName, contractId, newEndDate, bizType, fee, billingCycle) {
  var config = getWechatConfig();
  if (!config.templateRenew) {
    console.log('[WeChat] 未配置续约成功模板ID，跳过推送');
    return { success: false, error: '模板ID未配置' };
  }

  var data = {
    first: { value: '✨ 续约成功通知', color: '#173177' },
    character_string10: { value: contractId },
    character_string8: { value: contractId },
    time5: { value: newEndDate },
    thing9: { value: companyName },
    short_thing3: { value: billingCycle || '月付' },
    remark: { value: '点击查看详情，管理您的合同与续约信息。', color: '#999999' }
  };

  // 不传 url（等配置域名后再启用跳转链接）
  return await sendTemplate(openid, config.templateRenew, data);
}

// 发送到期提醒模板消息
async function sendExpiryNotice(openid, companyName, productName, endDate, contractId) {
  var config = getWechatConfig();
  if (!config.templateExpire) {
    console.log('[WeChat] 未配置到期提醒模板ID，跳过推送');
    return { success: false, error: '模板ID未配置' };
  }

  var data = {
    first: { value: '⚠️ 服务即将到期提醒', color: '#173177' },
    keyword1: { value: productName },
    keyword2: { value: endDate },
    keyword3: { value: companyName },
    remark: { value: '为免影响您的业务使用，请联系您的客户经理及时续约。' }
  };

  return await sendTemplate(openid, config.templateExpire, data,
    'https://bos.example.com/renew?contract=' + contractId);
}

/**
 * 发送到期提醒汇总通知（合并发送给管理人员）
 * summaryGroups: [{ period: "7天内", label: "紧急", items: [...] }]
 */
async function sendManagementConsolidated(touser, contactName, summaryGroups, todayStr) {
  var config = getWechatConfig();
  if (!config.templateManagement) {
    console.log('[WeChat] 未配置管理通知模板ID，跳过合并推送');
    return { success: false, error: '管理通知模板ID未配置' };
  }

  // 构建汇总文本
  var totalContracts = 0, totalLines = 0;
  var detailLines = [];
  for (var g = 0; g < summaryGroups.length; g++) {
    var group = summaryGroups[g];
    totalContracts += group.contracts ? group.contracts.length : 0;
    totalLines += group.lines ? group.lines.length : 0;
    detailLines.push('【' + group.label + '】');
    if (group.contracts && group.contracts.length > 0) {
      detailLines.push('  合同' + group.contracts.length + '份：');
      for (var c = 0; c < Math.min(group.contracts.length, 5); c++) {
        detailLines.push('    ' + group.contracts[c].contract_id + ' ' + group.contracts[c].company_name + ' (' + group.contracts[c].end_date + ')');
      }
      if (group.contracts.length > 5) detailLines.push('    ...等' + group.contracts.length + '份');
    }
    if (group.lines && group.lines.length > 0) {
      detailLines.push('  线路' + group.lines.length + '条：');
      for (var l = 0; l < Math.min(group.lines.length, 3); l++) {
        detailLines.push('    ' + group.lines[l].circuit_number + ' (' + group.lines[l].provider + ') ' + group.lines[l].expire_date);
      }
      if (group.lines.length > 3) detailLines.push('    ...等' + group.lines.length + '条');
    }
    detailLines.push('');
  }

  var summaryText = '到期合同' + totalContracts + '份，线路' + totalLines + '条';
  var earliestDate = '';
  for (var g = 0; g < summaryGroups.length; g++) {
    if (summaryGroups[g].contracts && summaryGroups[g].contracts.length > 0) {
      for (var c = 0; c < summaryGroups[g].contracts.length; c++) {
        if (!earliestDate || summaryGroups[g].contracts[c].end_date < earliestDate) {
          earliestDate = summaryGroups[g].contracts[c].end_date;
        }
      }
    }
    if (summaryGroups[g].lines && summaryGroups[g].lines.length > 0) {
      for (var l = 0; l < summaryGroups[g].lines.length; l++) {
        if (!earliestDate || summaryGroups[g].lines[l].expire_date < earliestDate) {
          earliestDate = summaryGroups[g].lines[l].expire_date;
        }
      }
    }
  }

  var data = {
    first: { value: '【BOS到期提醒汇总】' + (todayStr || new Date().toISOString().split('T')[0]), color: '#173177' },
    keyword1: { value: summaryText },
    keyword2: { value: earliestDate || '无' },
    keyword3: { value: detailLines.join('\n').substring(0, 200) },
    remark: { value: contactName + '，以上为系统自动汇总的到期提醒，请相关管理人员及时跟进处理。', color: '#999999' }
  };

  return await sendTemplate(touser, config.templateManagement, data);
}

module.exports = { getAccessToken, sendTemplate, sendRenewalNotice, sendExpiryNotice, getWechatConfig, sendManagementConsolidated, getReminderStaffContacts, getReminderAdvanceDays };
