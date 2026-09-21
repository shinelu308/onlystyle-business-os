/**
 * ONLYSTYLE 业务系统 · pm2 进程定义
 *
 * 两个进程：
 *   onlystyle-api  —— Express 后端（API + 后台管理台 + /uploads /media）
 *   onlystyle-web  —— 官网服务（website/dist 静态 + /api、/uploads 反代到 3100）
 *
 * ⚠️ instances 必须为 1：
 *    后端用 sql.js 读写单文件 broadband_os.db，每次写操作都会 export 整个库再落盘。
 *    cluster 多进程会互相覆盖写入，务必保持 fork + 单实例。
 *
 * ⚠️ 后端监听 0.0.0.0:3100：
 *    公网入口是另一台「Nginx 代理服务器」，它需要跨机访问本端口。
 *    不要在服务器上执行把监听改成 127.0.0.1 的操作（历史遗留脚本那段 sed 已删除）。
 *
 * ✅ onlystyle-web 为什么不是 pm2 内置的纯静态 `serve`：
 *    官网是 SPA，内容全靠运行时请求 /api/content/*。纯静态服务收到 /api/... 会走
 *    SPA 兜底返回 index.html（HTML 而非 JSON）→ 前端解析失败 → 退回设计稿兜底，
 *    表现为「外壳对、内容旧」。所以改用 website/serve.cjs，把 /api 与 /uploads
 *    直接反代进 8085，使 8085 自足 —— 无论走域名还是直连/端口转发，看到的内容一致
 *    （实测响应体逐字节相同，且 mp4 的 HTTP Range 206 正常）。
 *
 * 用法：
 *   pm2 start /opt/business-os/ecosystem.config.js
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'onlystyle-api',
      cwd: '/opt/business-os/biz-os/backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      time: true,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '3100',
        TZ: 'Asia/Shanghai',
      },
      out_file: '/opt/business-os/logs/api.out.log',
      error_file: '/opt/business-os/logs/api.err.log',
      merge_logs: true,
    },
    {
      name: 'onlystyle-web',
      // 官网服务入口：静态 dist + /api、/uploads → 3100（见 website/serve.cjs）
      cwd: '/opt/business-os/website',
      script: 'serve.cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      time: true,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8085',
        WEB_ROOT: '/opt/business-os/website/dist',
        API_ORIGIN: 'http://127.0.0.1:3100',
        TZ: 'Asia/Shanghai',
      },
      out_file: '/opt/business-os/logs/web.out.log',
      error_file: '/opt/business-os/logs/web.err.log',
      merge_logs: true,
    },
  ],
};
