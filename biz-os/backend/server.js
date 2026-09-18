const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { initializeDatabase, updateContractStatuses } = require('./database');

const app = express();
const PORT = process.env.PORT || 3100;
const frontendDir = path.join(__dirname, '..', 'frontend');

// ======== 微信回调需使用原始 body（XML 格式），须在 express.json() 之前处理 ========
app.use('/api/wechat/callback', express.raw({ type: '*/*' }));

// Middleware
app.use(cors());
// ⚠️ 16mb 而不是 10mb：证书图片走 base64 提交，原始文件上限 8MB
//    （见 lib/cert-image.js）→ base64 后约 10.7MB，10mb 的闸门会在接口之前就 413。
app.use(express.json({ limit: '16mb' })); // 扩大请求体限制以支持 Logo / 证书图片上传

// ======== 缓存策略 ========
// 默认仍然全面禁缓存 —— 这是后台/业务接口一直以来的行为，不要动它。
// 两个例外：
//   1) 内容中台的公开读接口 —— 官网内容属于「可长缓存 + 发布时失效」，
//      被 no-store 一起带上会变成每次打开页面都回源查库。要短 max-age + ETag 协商缓存。
//   2) /uploads 下的上传素材 —— 文件名一律带时间戳（logo_<ts>.png / device_<ts>_<i>.png），
//      内容不可变，每次访问都回源纯属浪费带宽。
// 注意：后台写接口 /api/content/admin/* 与 /api/leads 必须继续 no-store。
const CONTENT_CACHEABLE = /^\/api\/content\/(?!admin)/;
const UPLOADS_CACHEABLE = /^\/uploads\//;
app.use(function(req, res, next) {
  const readable = req.method === 'GET' || req.method === 'HEAD';
  if (readable && UPLOADS_CACHEABLE.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (readable && CONTENT_CACHEABLE.test(req.path)) {
    // ETag 由 express 自动生成；响应体里带 version，任何一次内容变更都会让 ETag 变化
    // 预览模式：后台实时预览面板的官网会带 ?pv=时间戳 拉接口 → 不缓存，保存即见
    if (req.query.pv) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ======== 确保上传目录存在 ========
const uploadsDir = path.join(__dirname, 'uploads');
if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir);

// ======== 提供前端静态文件 ========
app.use('/css', express.static(path.join(frontendDir, 'css')));
app.use('/js', express.static(path.join(frontendDir, 'js')));
app.use('/assets', express.static(path.join(frontendDir, 'assets')));
app.use('/uploads', express.static(uploadsDir));

/**
 * 官网的媒体素材（星球贴图等）也要从**后端这个源**提供一份。
 *
 * 为什么：后台是在后端这个源上打开的（开发 = 3100；线上 = 8081 的 nginx，
 * 它对后台 server 块是 `location / { proxy_pass 3100 }` 的**全量反代**）。
 * 后台「案例 → 选择星球」的缩略图用的就是星球库给的 `/media/galaxy/*.webp` ——
 * 后端不挂这一层的话，官网能显示、后台里 8 个缩略图全是空的深色圆。
 *   ⚠️ 这个坑很难自然发现：`getComputedStyle().backgroundImage` 在 404 时
 *      照样返回那个 URL，只看 CSS 是看不出图没加载的。
 *
 * 两个候选目录：开发指向源码 `website/public/media`；线上包里只有构建产物
 * `website/dist/media`（Vite 会把 public/ 整个拷进 dist）。谁存在挂谁。
 * 线上官网 8080 由 nginx 直接从 dist 发，不走这里；这里是给后台那一侧用的。
 */
for (const d of [
  path.join(__dirname, '..', '..', 'website', 'public', 'media'),
  path.join(__dirname, '..', '..', 'website', 'dist', 'media'),
]) {
  if (require('fs').existsSync(d)) app.use('/media', express.static(d));
}

// ======== API 路由 ========
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/spatial', require('./routes/spatial'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reminder', require('./routes/reminder'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/wechat', require('./routes/wechat'));

// ======== 内容运营域（官网 / 小程序 / 公众号的内容源）========
// ⚠️ admin 必须先注册：否则 /api/content 会先把 /admin/... 吃掉。
app.use('/api/content/admin', require('./routes/admin-content'));
app.use('/api/content', require('./routes/content'));
app.use('/api/leads', require('./routes/leads'));

// ======== 首页 ========
app.get('/', function(req, res) {
  res.sendFile(path.join(frontendDir, 'index.html'));
});
app.get('/index.html', function(req, res) {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ======== 启动服务器 ========
async function start() {
  try {
    await initializeDatabase();
    console.log('[DB] 数据库初始化完成');

    updateContractStatuses();

    cron.schedule('0 9 * * *', () => {
      console.log('[Cron] ' + new Date().toLocaleString() + ' 运行智能级联提醒引擎...');
      updateContractStatuses();
      try { require('./services/reminderEngine').runReminderEngine(); } catch(e) { console.error(e); }
    });

    app.listen(PORT, '0.0.0.0', function() {
      console.log('\n  🚀 智能业务管理系统 (BOS) 已启动');
      console.log('  📍 http://localhost:' + PORT);
      console.log('  📍 http://127.0.0.1:' + PORT);
      console.log('  ⏰ 定时提醒引擎配置: 每日 09:00\n');
    });
  } catch (err) {
    console.error('[FATAL] 数据库启动失败:', err);
    process.exit(1);
  }
}

start();
