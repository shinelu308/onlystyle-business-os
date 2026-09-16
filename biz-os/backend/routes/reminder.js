const express = require('express');
const router = express.Router();
const { runReminderEngine } = require('../services/reminderEngine');

// 手动触发提醒引擎
router.post('/run', (req, res) => {
  try {
    const alerts = runReminderEngine();
    res.json({ success: true, alert_count: alerts.length, alerts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 模拟企业微信 Webhook 推送
router.post('/webhook/wecom', (req, res) => {
  const { payload } = req.body;
  if (!payload) return res.status(400).json({ error: '缺少 payload' });
  
  // 模拟发送结果
  console.log('[Webhook] 推送至企业微信:', JSON.stringify(payload, null, 2));
  res.json({ success: true, message: '企业微信消息已推送', payload });
});

// 模拟微信模板消息发送
router.post('/template/wechat', (req, res) => {
  const { template } = req.body;
  if (!template) return res.status(400).json({ error: '缺少模板消息配置' });
  
  console.log('[模板消息] 发送微信模板消息:', JSON.stringify(template, null, 2));
  res.json({ success: true, message: '微信模板消息已发送', template });
});

module.exports = router;
