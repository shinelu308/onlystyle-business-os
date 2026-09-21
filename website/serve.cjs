#!/usr/bin/env node
/**
 * ONLYSTYLE 官网服务 —— 静态 dist + /api、/uploads 反代到后端
 * ---------------------------------------------------------------------------
 *  用法：
 *    node website/serve.cjs
 *  环境变量：
 *    PORT       监听端口，默认 8085
 *    HOST       监听地址，默认 0.0.0.0（跨机代理需要；不要改成 127.0.0.1）
 *    WEB_ROOT   静态根，默认 ./dist（即 website/dist）
 *    API_ORIGIN 后端地址，默认 http://127.0.0.1:3100
 *
 *  为什么需要它（而不是 pm2 内置的纯静态 serve）：
 *    官网是 SPA，内容全靠运行时请求 /api/content/*。
 *    纯静态服务在收到 /api/... 时会走 SPA 兜底返回 index.html（HTML 而非 JSON），
 *    前端解析失败 → 退回设计稿内置兜底 → 表现为「外壳对、内容旧」。
 *    生产域名之所以正常，是因为代理机 Nginx 额外把 /api 反代到了 3100；
 *    但这意味着「凡是绕过 Nginx 的访问（端口转发、内网直连、代理少配一条 location）
 *    看到的都是旧内容」—— 一个已经坑过两次的耦合。
 *    本服务把 /api 与 /uploads 直接反代进 8085，使 8085 自足：
 *    无论从域名还是直连 8085，看到的内容完全一致（实测响应体逐字节相同）。
 *
 *  ⚠️ 依赖：复用后端已安装的 express（不额外装包）。
 *  ⚠️ 静态部分交给 express.static —— 它原生支持 mp4 的 HTTP Range（206），
 *     自己手写静态服务容易把视频拖动播放搞坏，所以不手写。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

let express;
try {
  express = require('express');
} catch (_) {
  // 通常本文件同级没有 node_modules —— 复用后端那份（部署包里后端一定装了依赖）
  express = require(path.join(__dirname, '..', 'biz-os', 'backend', 'node_modules', 'express'));
}

const PORT = parseInt(process.env.PORT || '8085', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(process.env.WEB_ROOT || path.join(__dirname, 'dist'));
const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:3100';

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('[WEB] 找不到静态根或 index.html：' + ROOT);
  process.exit(1);
}

const target = new URL(API_ORIGIN);
const app = express();
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// 1) 反代：/api 与 /uploads 原样转发到后端（保留路径与查询串，支持 POST 等所有方法）
// ---------------------------------------------------------------------------
function proxyToApi(req, res) {
  const headers = Object.assign({}, req.headers);
  headers.host = target.host;
  headers['x-forwarded-proto'] = headers['x-forwarded-proto'] || 'http';
  if (!headers['x-forwarded-for']) {
    headers['x-forwarded-for'] = req.socket.remoteAddress || '';
  }

  const up = http.request({
    protocol: 'http:',
    hostname: target.hostname,
    port: target.port || 80,
    method: req.method,
    // ⚠️ 必须用 originalUrl：req.url 在被 app.use('/api', …) 挂载后会被剥掉前缀
    path: req.originalUrl,
    headers: headers,
  }, (upRes) => {
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res);
  });

  up.on('error', (e) => {
    console.error('[WEB] 代理失败 ' + req.originalUrl + ': ' + e.message);
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: 'backend unreachable' });
    } else {
      res.end();
    }
  });

  // 表单（/api/leads）会带请求体，必须把流接过去，否则上游一直挂着
  req.pipe(up);
}

app.use('/api', proxyToApi);
app.use('/uploads', proxyToApi);

// ---------------------------------------------------------------------------
// 2) 静态产物（缓存策略对齐代理机 Nginx 的规则）
// ---------------------------------------------------------------------------
app.use(express.static(ROOT, {
  index: ['index.html'],
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
    if (rel === 'index.html') {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
    } else if (rel.startsWith('static/')) {
      // 构建产物带内容哈希，可长缓存
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

// ---------------------------------------------------------------------------
// 3) SPA 回退：/about、/cases 等前端路由直链也能打开（HTML 绝不缓存）
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.sendFile(path.join(ROOT, 'index.html'));
});

const server = app.listen(PORT, HOST, () => {
  console.log('\n  🌐 ONLYSTYLE 官网服务已启动');
  console.log('  📍 http://' + HOST + ':' + PORT + '   (静态根 ' + ROOT + ')');
  console.log('  🔁 /api /uploads  → ' + API_ORIGIN + '\n');
});

// 容器/pm2 优雅退出：避免端口占用导致的 restart 失败
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
