/**
 * 内容中台 · 令牌签发与校验
 *
 * 背景（为什么要有这个文件）：
 *   BOS 目前零鉴权 —— /api/* 全部匿名可调。内容写接口一旦裸奔，任何人 POST 一下
 *   就能改官网，所以最初只放了一个共享令牌 admin.content_token（首次启动生成并打印一次）。
 *   但那个令牌是给**脚本 / e2e** 用的，运营在后台点按钮时不可能手贴一串 40 位十六进制。
 *
 * 方案：登录时签发 staff token（无状态 HMAC 签名，不落库）。
 *   · 签名密钥复用 admin.content_token —— 不引入新的密钥管理，重启即失效（可接受）；
 *   · 载荷 {sid, role, exp}，默认 12 小时过期，跨班次够用；
 *   · 无状态 = 后台每次登录不写库、多个人同时登录互不覆盖；
 *   · 共享令牌仍然有效（脚本与 e2e 依赖它，不能动）。
 *
 * 注意：这不是完整的会话体系（不能单点注销、不能续期）。宽带业务线的正式鉴权
 * 另立任务，这里只解决「内容写接口别裸奔 + 运营能用」。
 */

const crypto = require('crypto');

/** 签名密钥：复用内容后台共享令牌，缺失则无法签发/校验 */
function getSecret(db) {
  const row = db.get("SELECT value FROM content_settings WHERE key = 'admin.content_token'");
  return row && row.value ? String(row.value) : '';
}

const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** 定长比较，避免时序侧信道 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** 有效期：12 小时。夜班跨零点也够。 */
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 签发 staff token。登录成功时调用。
 * @param {object} db
 * @param {object} staff 至少含 staff_id / role
 * @returns {string} `<payload>.<sig>`
 */
function signStaffToken(db, staff) {
  const secret = getSecret(db);
  if (!secret) return '';
  const payload = {
    sid: staff.staff_id,
    role: staff.role || 'operator',
    exp: Date.now() + TTL_MS,
  };
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', secret).update(body).digest());
  return body + '.' + sig;
}

/**
 * 校验 staff token。
 * @returns {object|null} 合法则返回载荷 {sid, role, exp}，否则 null
 */
function verifyStaffToken(db, token) {
  const secret = getSecret(db);
  if (!secret || !token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0 || i === token.length - 1) return null;

  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = b64u(crypto.createHmac('sha256', secret).update(body).digest());
  if (!safeEqual(sig, expect)) return null;

  let payload;
  try {
    payload = JSON.parse(unb64u(body).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || !payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

module.exports = { signStaffToken, verifyStaffToken, safeEqual, getSecret };
