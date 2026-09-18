/**
 * 后台写接口的共享鉴权中间件（两把钥匙都认）
 *
 *   ① 共享令牌 `admin.content_token` —— 给脚本 / e2e / CI 用，首次启动打印一次；
 *   ② 登录签发的 staff token —— 运营在后台点按钮时自动带上，不用手贴密钥。
 *
 * 归属：本文件是从 `routes/admin-content.js` 抽出来的**唯一实现**。
 * 抽出来的原因：`routes/leads.js` 也要用同一套鉴权。
 * 「同一份逻辑抄两份必然漂移」—— 所以宁可多一个文件，也不要两处各写一遍
 * （尤其鉴权，漂移一处就是一个洞）。
 *
 * `getDatabase` 是延迟 require 的：database.js 在初始化阶段会 require 本模块的调用方，
 * 顶层直接 require 会成环。
 */
const { verifyStaffToken, safeEqual } = require('../content-auth');

function auth(req, res, next) {
  const { getDatabase } = require('../database');
  const db = getDatabase();
  const row = db.get("SELECT value FROM content_settings WHERE key = 'admin.content_token'");
  const token = req.headers['x-admin-token'] || req.query.token || '';

  // ① 共享令牌（定长比较，避免时序侧信道）
  if (row && row.value && token && safeEqual(token, row.value)) {
    req.contentAuth = { kind: 'shared' };
    return next();
  }

  // ② 登录签发的 staff token（无状态 HMAC，校验签名 + 过期）
  const payload = verifyStaffToken(db, token);
  if (payload) {
    req.contentAuth = { kind: 'staff', sid: payload.sid, role: payload.role };
    return next();
  }

  if (!row || !row.value) {
    return res.status(503).json({ ok: false, error: 'admin token 未初始化，请重启服务端一次' });
  }
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

module.exports = { auth };
