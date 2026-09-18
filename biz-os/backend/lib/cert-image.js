/**
 * 证书图片识别 —— 用 magic bytes 判类型 + 读原始像素尺寸。
 *
 * 为什么不信后缀 / Content-Type：上传接口是**任何拿到令牌的人**都能调的，
 * 后缀与 mime 都是调用方自己写的字符串，用来做安全判断等于没做。
 *
 * 只放行 png / jpg / webp，**明确不接 svg**：
 * svg 是可执行的 XML（能内嵌 <script>），而 /uploads 与官网同源，
 * 直接打开就等于给上传者一个 XSS 入口 —— 证书场景不需要矢量图，没必要开这个口子。
 *
 * 尺寸只是「够不够清晰」的提示，不做硬性拦截：
 * 证件照常见 1200~4000px，小于 1000px 打出来字会糊，接口回 warn 让运营自己决定。
 */
'use strict';

/** 原始文件上限 8MB（再多 base64 就要撑爆请求体了，见 server.js 的 express.json limit） */
const MAX_BYTES = 8 * 1024 * 1024;

/** 长边低于这个值就提示「可能不清晰」（不拦截） */
const MIN_LONG_EDGE = 1000;

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** 认出这是哪种图；认不出返回 null */
function sniff(buf) {
  if (!buf || buf.length < 16) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // WEBP: 'RIFF' + 4 字节长度 + 'WEBP'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** PNG：IHDR 紧跟 8 字节签名 + 4 字节长度 + 4 字节类型，宽高是 BE u32 */
function pngSize(buf) {
  if (buf.length < 24) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * JPEG：SOFn 段里带尺寸（高在前、宽在后，各 BE u16）。
 * 不能假设 SOF0 在固定偏移 —— 前面可能还有 APPn/EXIF/缩略图段，
 * 必须逐段按「marker + 长度」跳过去。
 */
function jpgSize(buf) {
  let i = 2;
  while (i + 9 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    // 填充字节 / 独立标记（无长度字段）
    if (m === 0xff || m === 0x01 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    const isSOF =
      (m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) ||
      (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf);
    if (isSOF) {
      if (i + 9 > buf.length) return null;
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xda) return null; // 进入扫描数据，后面不会再有 SOF
    i += 2 + len;
  }
  return null;
}

/** WEBP：三种子格式（有损 VP8 / 无损 VP8L / 扩展 VP8X）尺寸位置各不相同 */
function webpSize(buf) {
  if (buf.length < 30) return null;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    if (!(buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a)) return null;
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    if (buf[20] !== 0x2f) return null;
    const b = [buf[21], buf[22], buf[23], buf[24]];
    return {
      w: (((b[1] & 0x3f) << 8) | b[0]) + 1,
      h: (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) + 1,
    };
  }
  if (fourcc === 'VP8X') {
    return {
      w: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
      h: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
    };
  }
  return null;
}

/**
 * 总入口。**不抛异常**，一律返回结果对象，由调用方决定怎么回。
 * @returns {{ok:boolean, ext?:string, mime?:string, width?:number, height?:number,
 *            longEdge?:number, warn?:string, code?:string, error?:string}}
 */
function inspect(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) {
    return { ok: false, code: 'EMPTY', error: '图片内容为空' };
  }
  if (buf.length > MAX_BYTES) {
    return { ok: false, code: 'TOO_LARGE', error: '图片过大（上限 8MB），请先压缩后再上传' };
  }
  const ext = sniff(buf);
  if (!ext) {
    return {
      ok: false,
      code: 'BAD_TYPE',
      error: '只支持 JPG / PNG / WebP 三种格式（按文件真实内容判断，改后缀没用）',
    };
  }
  const size = ext === 'png' ? pngSize(buf) : ext === 'jpg' ? jpgSize(buf) : webpSize(buf);
  const out = { ok: true, ext, mime: MIME[ext] };
  if (size && size.w > 0 && size.h > 0) {
    out.width = size.w;
    out.height = size.h;
    out.longEdge = Math.max(size.w, size.h);
    if (out.longEdge < MIN_LONG_EDGE) {
      out.warn = '图片长边只有 ' + out.longEdge + 'px，打印或放大查看可能不清晰，建议换长边 ' + MIN_LONG_EDGE + 'px 以上的图。';
    }
  }
  return out;
}

module.exports = { inspect, sniff, MAX_BYTES, MIN_LONG_EDGE };
