'use strict';
/**
 * 品牌图形处理库 —— PNG 读写 + 「白底图」自动去底。纯 JS，不引新依赖。
 *
 * 为什么需要它（背景）：
 *   四处（官网导航/页脚 + 后台侧栏/登录页）共用同一张品牌图形，而其中 3 处是深色底。
 *   一旦上传的是**白底图**（JPG 或没带 alpha 的 PNG），深色底上就是一块白方块 ——
 *   这正是用户反馈过的「logo 显示不对」。
 *   前端已经会在 canvas 阶段处理一次，但接口是可以被**绕过**的
 *   （脚本直接 POST base64），所以服务端必须再兜一道，否则口子还在。
 *
 * 依赖：只用 node:zlib（Deflate/Inflate）。JPEG 无法用纯 JS 解码 —— 遇到直接拒绝并说明，
 *       不让「白底 JPEG」静默落库。
 *
 * 关键设计（容易写错的两点）：
 *   1. 去白底**不能**用全局阈值 `alpha = 255 - min(R,G,B)` ——
 *      那会把 logo 内部的白色（文字、高光）一起抠掉。
 *      必须只去掉**与图片边缘连通**的近白区域（泛洪），内部白色原样保留。
 *   2. 边缘过渡像素要做 unmultiply 反解原色，否则深色底上会残留一圈白边。
 */

const zlib = require('zlib');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function err(msg, code) {
  const e = new Error(msg);
  e.code = code || 'LOGO_PROCESS_ERROR';
  return e;
}

// ---------------------------------------------------------------------------
// CRC32（PNG 每个 chunk 都要带）
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// PNG 读
// ---------------------------------------------------------------------------
function readChunks(buf) {
  if (!buf || buf.length < 8 || !buf.slice(0, 8).equals(PNG_SIG)) {
    throw err('不是 PNG 文件（JPEG 没有透明通道，无法在服务端自动去白底，请在前台上传）', 'NOT_PNG');
  }
  const chunks = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    chunks.push({ type, data });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

/** 只读头部信息（不解像素）—— 用来判断「有没有 alpha 通道」 */
function pngInfo(buf) {
  const chunks = readChunks(buf);
  let ihdr = null;
  for (const c of chunks) { if (c.type === 'IHDR') { ihdr = c; break; } }
  if (!ihdr || ihdr.data.length < 13) throw err('PNG 缺少 IHDR', 'BAD_PNG');
  const colorType = ihdr.data[9];
  return {
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4),
    bitDepth: ihdr.data[8],
    colorType: colorType,
    interlace: ihdr.data[12],
    hasTRNS: chunks.some((c) => c.type === 'tRNS'),
    // colorType 4=灰度+A、6=RGBA 天生带 alpha；0/2 需靠 tRNS 块才算
    hasAlpha: colorType === 4 || colorType === 6 || chunks.some((c) => c.type === 'tRNS'),
    chunks: chunks,
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}

/** 按 PNG 规范反滤波（filter 逐行作用在前一行结果上，必须顺序处理） */
function unfilterLine(ft, line, prev, bpp) {
  const n = line.length;
  if (ft === 0) return;
  if (ft === 1) {
    for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 255;
    return;
  }
  if (ft === 2) {
    for (let i = 0; i < n; i++) line[i] = (line[i] + prev[i]) & 255;
    return;
  }
  if (ft === 3) {
    for (let i = 0; i < n; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255;
    }
    return;
  }
  if (ft === 4) {
    for (let i = 0; i < n; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      line[i] = (line[i] + paeth(a, b, c)) & 255;
    }
    return;
  }
  throw err('未知的 PNG 滤波类型 ' + ft, 'BAD_PNG');
}

/** 解码成统一 RGBA（Uint8Array，长度 = w*h*4） */
function decodePng(buf) {
  const info = pngInfo(buf);
  const width = info.width, height = info.height;
  if (info.bitDepth !== 8) throw err('只支持 8 位色深的 PNG（当前 ' + info.bitDepth + ' 位）', 'UNSUPPORTED');
  if (info.interlace !== 0) throw err('不支持隔行（Adam7）PNG，请重新导出', 'UNSUPPORTED');
  const chMap = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const ch = chMap[info.colorType];
  if (!ch) {
    throw err('不支持的 PNG 颜色类型 ' + info.colorType + '（索引色 PNG 请先另存为 PNG-24/32）', 'UNSUPPORTED');
  }

  const idat = Buffer.concat(info.chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  if (raw.length < (width * ch + 1) * height) throw err('PNG 数据不完整', 'BAD_PNG');

  const out = new Uint8Array(width * height * 4);
  const stride = width * ch;
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let p = 0;

  for (let y = 0; y < height; y++) {
    const ft = raw[p++];
    for (let i = 0; i < stride; i++) line[i] = raw[p + i];
    p += stride;
    unfilterLine(ft, line, prev, ch);
    for (let x = 0; x < width; x++) {
      const s = x * ch, d = (y * width + x) * 4;
      if (ch === 4) {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3];
      } else if (ch === 3) {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255;
      } else if (ch === 2) {
        out[d] = line[s]; out[d + 1] = line[s]; out[d + 2] = line[s]; out[d + 3] = 255;
      } else {
        out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255;
      }
    }
    prev.set(line);
  }
  return { width, height, data: out, info: info };
}

// ---------------------------------------------------------------------------
// PNG 写（统一输出 colorType 6 = RGBA）
// ---------------------------------------------------------------------------
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePngRGBA(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  for (let y = 0; y < height; y++) {
    const off = y * (stride + 1);
    raw[off] = 0; // filter = None：我们的数据已是最终像素，压缩率交给 deflate
    src.copy(raw, off + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 去白底
// ---------------------------------------------------------------------------

/**
 * 从四边泛洪，标出「与边缘连通的近白区域」= 背景。
 * 为什么必须连通：只按颜色判断会把 logo 内部的白色文字/高光一起抠掉。
 */
function floodWhite(data, w, h, tol) {
  const nearWhite = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    // 「足够亮」且「没有明显色相」——否则浅蓝色块也会被当成背景
    return mn >= 255 - tol && (mx - mn) <= tol;
  };
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qt = 0;
  const push = (idx) => {
    if (visited[idx]) return;
    if (!nearWhite(idx * 4)) return;
    visited[idx] = 1;
    queue[qt++] = idx;
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  let qh = 0;
  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % w, y = (idx - x) / w;
    if (x > 0) push(idx - 1);
    if (x < w - 1) push(idx + 1);
    if (y > 0) push(idx - w);
    if (y < h - 1) push(idx + w);
  }
  return visited;
}

/**
 * 去白底。返回被处理掉的像素数。
 * @param {Uint8Array} data RGBA
 */
function removeWhiteBackground(data, w, h, opts) {
  opts = opts || {};
  const tol = opts.tol == null ? 26 : opts.tol;
  const visited = floodWhite(data, w, h, tol);

  let removed = 0;
  for (let i = 0; i < w * h; i++) {
    if (visited[i]) { data[i * 4 + 3] = 0; removed++; }
  }

  // 与背景相邻的前景像素 = 抗锯齿过渡带。
  // 把它们按「离白有多远」估成半透明，并 unmultiply 反解原色 ——
  // 不反解的话，深色底上会看到一圈白边（这正是「看着不干净」的来源）。
  let softened = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;
      let touch = false;
      if (x > 0 && visited[idx - 1]) touch = true;
      else if (x < w - 1 && visited[idx + 1]) touch = true;
      else if (y > 0 && visited[idx - w]) touch = true;
      else if (y < h - 1 && visited[idx + w]) touch = true;
      if (!touch) continue;

      const i = idx * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mn = Math.min(r, g, b);
      let a = 255 - mn;
      if (a < 0) a = 0;
      if (a > 255) a = 255;
      if (a <= tol) { data[i + 3] = 0; softened++; continue; }

      const af = a / 255;
      const inv = 255 * (1 - af);
      const fix = (c) => {
        const v = Math.round((c - inv) / af);
        return v < 0 ? 0 : (v > 255 ? 255 : v);
      };
      data[i] = fix(r);
      data[i + 1] = fix(g);
      data[i + 2] = fix(b);
      data[i + 3] = a;
      softened++;
    }
  }
  return { removed, softened };
}

/** 四角是否都已透明（说明这张图本来就有可用的透明背景） */
function cornerAlphas(data, w, h) {
  const at = (x, y) => data[(y * w + x) * 4 + 3];
  return [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
}

/** 四角像素是否都接近白色（用来判定「这是一张白底图」） */
function cornerIsWhite(data, w, h, tol) {
  const t = tol == null ? 26 : tol;
  const chk = (x, y) => {
    const i = (y * w + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.min(r, g, b) >= 255 - t && (Math.max(r, g, b) - Math.min(r, g, b)) <= t;
  };
  return chk(0, 0) && chk(w - 1, 0) && chk(0, h - 1) && chk(w - 1, h - 1);
}

/** 预乘 alpha 的 box 降采样（透明像素的颜色不会污染结果） */
function downscaleRGBA(data, w, h, maxSize) {
  if (w <= maxSize && h <= maxSize) return null;
  const scale = maxSize / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy0 = Math.floor(y * h / nh);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * h / nh));
    for (let x = 0; x < nw; x++) {
      const sx0 = Math.floor(x * w / nw);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * w / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * w + sx) * 4;
          const al = data[i + 3];
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al;
          a += al; n++;
        }
      }
      const d = (y * nw + x) * 4;
      if (n === 0 || a === 0) { out[d] = 0; out[d + 1] = 0; out[d + 2] = 0; out[d + 3] = 0; continue; }
      const af = a / n / 255;
      const un = (v) => {
        const q = Math.round(v / n / af);
        return q < 0 ? 0 : (q > 255 ? 255 : q);
      };
      out[d] = un(r); out[d + 1] = un(g); out[d + 2] = un(b);
      out[d + 3] = Math.round(a / n);
    }
  }
  return { width: nw, height: nh, data: out };
}

// ---------------------------------------------------------------------------
// 对外主入口
// ---------------------------------------------------------------------------

/**
 * 处理一张上传的品牌图形。
 * @param {Buffer} buf 原始文件字节
 * @param {object} [opts] { tol=26, maxSize=512 }
 * @returns {{buf: Buffer, changed: boolean, reason: string, detail: string,
 *            width: number, height: number, removed: number}}
 *   reason 取值：ok-transparent（本来就好） / white-removed（已自动去白底）
 *                / non-white-bg（背景不是白色，未动） / resized（仅缩了尺寸）
 */
function prepareBrandLogo(buf, opts) {
  opts = opts || {};
  const maxSize = opts.maxSize == null ? 512 : opts.maxSize;
  const tol = opts.tol == null ? 26 : opts.tol;

  const info = pngInfo(buf); // 非 PNG 会在这里抛出带说明的错误
  const dec = decodePng(buf);
  let data = dec.data;
  let w = dec.width, h = dec.height;
  const parts = [];
  let changed = false;
  let reason = 'ok-transparent';

  const corners = cornerAlphas(data, w, h);
  const transparentAlready = corners.every((a) => a < 16);

  if (transparentAlready) {
    reason = 'ok-transparent';
    parts.push('原图已带透明背景');
  } else if (cornerIsWhite(data, w, h, tol)) {
    const r = removeWhiteBackground(data, w, h, { tol });
    reason = 'white-removed';
    changed = true;
    parts.push('已自动去除白底（' + r.removed + ' 个背景像素，' + r.softened + ' 个边缘像素做了柔化）');
  } else {
    reason = 'non-white-bg';
    parts.push('四角不是白色（当前 ' + corners.join('/') + '），未做透明处理');
  }

  const small = downscaleRGBA(data, w, h, maxSize);
  if (small) {
    data = small.data; w = small.width; h = small.height;
    changed = true;
    if (reason === 'ok-transparent') reason = 'resized';
    parts.push('已缩放到 ' + w + '×' + h);
  }

  const out = changed ? encodePngRGBA(w, h, data) : buf;
  return {
    buf: out,
    changed: changed,
    reason: reason,
    detail: parts.join('；'),
    width: w,
    height: h,
    removed: (function () {
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] === 0) n++;
      return n;
    })(),
  };
}

module.exports = {
  PNG_SIG,
  crc32,
  pngInfo,
  decodePng,
  encodePngRGBA,
  removeWhiteBackground,
  cornerAlphas,
  cornerIsWhite,
  downscaleRGBA,
  prepareBrandLogo,
};
