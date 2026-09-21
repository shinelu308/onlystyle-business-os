/**
 * 微信扫码绑定 OpenID 路由
 * 支持：生成二维码、事件回调（扫码关注后自动绑定）、绑定状态查询
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDatabase } = require('../database');
const { getAccessToken, getWechatConfig } = require('../services/wechatService');
const https = require('https');

// ========== 工具函数 ==========

function httpsGet(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON 解析失败: ' + data)); }
      });
    }).on('error', function(e) { reject(e); });
  });
}

function httpsPost(url, body) {
  return new Promise(function(resolve, reject) {
    var urlObj = new URL(url);
    var postData = JSON.stringify(body);
    var options = {
      hostname: urlObj.hostname, port: 443,
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

// XML 解析（简化版，只解析事件推送）
function parseWechatXml(xml) {
  var result = {};
  var tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
  var match;
  while ((match = tagRegex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  // 处理 CDATA
  var cdataRegex = /<(\w+)><!\[CDATA\[([^\]]*)\]\]><\/\1>/g;
  while ((match = cdataRegex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

// ========== 配置管理 ==========
function getWechatToken() {
  var db = getDatabase();
  var row = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'wechat_token'");
  return row ? row.setting_value : '';
}

// ========== 1. 微信服务器验证（GET 回调）==========
// 用户需在微信公众平台 → 设置 → 公众号设置 → 功能设置 → 配置
// URL: https://bos.onlystyle.com.cn/api/wechat/callback
router.get('/callback', (req, res) => {
  var signature = req.query.signature;
  var timestamp = req.query.timestamp;
  var nonce = req.query.nonce;
  var echostr = req.query.echostr;

  if (!signature || !timestamp || !nonce || !echostr) {
    return res.status(400).send('缺少参数');
  }

  var token = getWechatToken();
  if (!token) {
    // 未配置 Token 时，不做验证直接返回 echostr（方便 ngrok 测试）
    return res.send(echostr);
  }

  var arr = [token, timestamp, nonce].sort();
  var str = arr.join('');
  var sha1 = crypto.createHash('sha1').update(str).digest('hex');

  if (sha1 === signature) {
    res.send(echostr);
  } else {
    res.status(403).send('验证失败');
  }
});

// ========== 2. 微信事件回调（POST）==========
// 接收用户扫码关注事件，自动绑定 OpenID 到客户
router.post('/callback', (req, res) => {
  var xml = req.body && req.body.toString ? req.body.toString() : '';
  if (!xml) {
    // 尝试从 rawBody 获取
    xml = req.rawBody || '';
  }
  if (!xml) return res.status(200).send('success');

  var msg = parseWechatXml(xml);
  var event = msg.Event;
  var fromUser = msg.FromUserName; // 用户的 OpenID
  var eventKey = msg.EventKey || ''; // 场景值

  // 关注事件：eventKey = "qrscene_场景值"
  // 扫码事件：eventKey = "场景值"
  if ((event === 'subscribe' && eventKey.indexOf('qrscene_') === 0) || event === 'SCAN') {
    var sceneStr = event === 'subscribe' ? eventKey.replace('qrscene_', '') : eventKey;

    console.log('[WeChat] 扫码事件: fromUser=' + fromUser + ', scene=' + sceneStr);

    if (sceneStr && fromUser) {
      // 检查该客户是否存在
      var db = getDatabase();
      var customer = db.get('SELECT customer_id FROM customers WHERE customer_id = ?', sceneStr);
      if (customer) {
        db.run("UPDATE customers SET wechat_openid = ?, updated_at = datetime('now','localtime') WHERE customer_id = ?",
          fromUser, sceneStr);
        console.log('[WeChat] OpenID 绑定成功: customer=' + sceneStr + ' -> openid=' + fromUser);
      } else {
        console.warn('[WeChat] 未找到客户: ' + sceneStr);
      }
    }
  }

  res.status(200).send('success');
});

// ========== 3. 生成绑定二维码 ==========
// GET /api/wechat/qrcode/:customer_id
router.get('/qrcode/:customerId', async (req, res) => {
  var customerId = req.params.customerId;

  // 验证客户存在
  var db = getDatabase();
  var customer = db.get('SELECT customer_id, company_name FROM customers WHERE customer_id = ?', customerId);
  if (!customer) return res.status(404).json({ error: '客户不存在' });

  // 如果已经绑定，直接返回
  if (customer.wechat_openid) {
    return res.json({ already_bound: true, company_name: customer.company_name });
  }

  try {
    var accessToken = await getAccessToken();
    // 创建临时二维码（场景值为客户ID，有效期30天）
    var result = await httpsPost(
      'https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=' + encodeURIComponent(accessToken),
      {
        expire_seconds: 2592000, // 30天
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: customerId } }
      }
    );

    if (result.errcode) {
      return res.status(400).json({ error: '创建二维码失败: ' + result.errmsg, errcode: result.errcode });
    }

    res.json({
      ticket: result.ticket,
      expire_seconds: result.expire_seconds,
      url: result.url,
      qrcode_url: 'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=' + encodeURIComponent(result.ticket)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== 4. 查询绑定状态 ==========
// GET /api/wechat/check-binding/:customer_id
router.get('/check-binding/:customerId', (req, res) => {
  var db = getDatabase();
  var customer = db.get('SELECT customer_id, company_name, wechat_openid FROM customers WHERE customer_id = ?', req.params.customerId);
  if (!customer) return res.status(404).json({ error: '客户不存在' });

  res.json({
    bound: !!customer.wechat_openid,
    wechat_openid: customer.wechat_openid || null,
    company_name: customer.company_name
  });
});

// ========== 5. 获取微信配置状态（前端用于判断是否显示绑定功能）==========
router.get('/config-status', (req, res) => {
  var config = getWechatConfig();
  var token = getWechatToken();
  var valid = config.appid && config.appid !== 'wx0000000000000000' && config.appid.match(/^wx/);
  res.json({
    configured: !!valid,
    has_token: !!token,
    appid: valid ? (config.appid.substring(0, 6) + '****') : null
  });
});

module.exports = router;
