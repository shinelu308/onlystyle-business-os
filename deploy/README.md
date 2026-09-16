# deploy —— 一键部署到云服务器

给「不想碰命令行」的人准备的部署工具。整套只做一件事：
**把本机的项目打包、传上服务器、装好环境、起服务。**

---

## 怎么用（3 步）

### 1. 买服务器

| 项 | 建议 |
|---|---|
| 厂商 | 腾讯云 / 阿里云「**轻量应用服务器**」（有图形化防火墙 + 网页终端，最适合新手） |
| 地域 | **中国香港**（有域名没备案 → 免备案、能直接上域名和 HTTPS）<br>或 上海 / 广州（便宜，但没备案只能用 `IP:端口`） |
| 镜像 | **Ubuntu 22.04 LTS** |
| 配置 | 2 核 2 GB / 60 GB SSD / 4 Mbps（最低 1 核 1 GB 也能跑） |
| 价格 | 约 ¥60–80/月；新用户常年有 ¥99–199/年 的活动 |

### 2. 服务器上做两件事

1. **重置 root 密码**：控制台 → 实例 → 更多 → 重置密码 → 关机再开机生效
2. **放行防火墙端口**：控制台 → 防火墙 → 添加规则 → 放行 **8080**（官网）、**8081**（后台）
   - ⚠️ **不要**放行 3100（后端直连端口，无鉴权）

### 3. 本机双击

双击 `deploy.bat` → 第一次会让你**输一次服务器密码**（装免密密钥用），之后每次都是双击即完事。

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `deploy.bat` | **双击这个**。Windows 启动器（纯 ASCII，不挑代码页） |
| `deploy.cjs` | 真正的部署逻辑：构建 → 打包 → 上传 → 远程执行 |
| `deploy.config.txt` | 你的配置（**不进 git**）。第一次运行自动从模板生成，只改 `SERVER_IP` 就够 |
| `deploy.config.example.txt` | 配置模板与注释说明 |
| `bootstrap.sh` | **服务器端**脚本：装 nginx/Node/pm2、配站点、建备份任务、放行端口 |
| `.ssh/` | 自动生成的部署专用密钥（**不进 git**） |

---

## 它到服务器上具体做了什么

1. 识别系统（apt / yum / dnf）
2. **把时区设成 Asia/Shanghai** —— 后端有「每日 09:00 提醒引擎」，时区错会让合同状态差一天
3. 装 nginx / curl / tar / xz / openssl
4. 装 Node.js 22（走 `registry.npmmirror.com`，国内快）
5. 解包代码到 `/opt/onlystyle/app`
   - 🔴 **线上已有数据库时不会被覆盖**，你本机那份改存为 `broadband_os.db.incoming`
6. `npm install` 后端依赖 + 用 **pm2** 守护进程（开机自启）
   - 顺手把 `server.js` 的 `listen('0.0.0.0')` 改成可被 `HOST` 覆盖，让后端只监听 `127.0.0.1`
7. 写 nginx 配置：
   - `8080` → 官网（静态 `website/dist`，`/api`、`/uploads` 反代到 3100）
   - `8081` → 后台（全量反代 + **HTTP Basic Auth** 口令兜底）
   - 配了 `DOMAIN` 时额外生成 `域名` / `www.域名` / `admin.域名`
8. 装每日 03:00 自动备份（数据库 + 上传素材，保留 14 份）
9. 放行本机 ufw / firewalld 端口
10. 可选：`certbot` 申请 Let's Encrypt 证书

---

## 常用运维命令（在服务器上执行）

```bash
pm2 list                                  # 服务活着没
pm2 logs onlystyle-api --lines 50         # 看日志
pm2 restart onlystyle-api                 # 重启后端
onlystyle-backup                          # 手动备份一次
ls -lh /opt/onlystyle/backups             # 看备份
systemctl restart nginx                   # 重启 nginx
```

---

## 参数

```bash
node deploy.cjs --dry-run        # 只打包、只报体积，不连服务器
node deploy.cjs --skip-build     # 跳过官网构建，用现有 dist
node deploy.cjs --web 9000       # 临时覆盖官网端口
```

---

## 出问题先看这里

| 症状 | 原因 | 处置 |
|---|---|---|
| 两个地址都打不开 | **云控制台防火墙没放行端口**（90% 是这个） | 控制台加规则放行 8080 / 8081 |
| 打不开且 `pm2 list` 是 `errored` | 后端启动失败 | `pm2 logs onlystyle-api --lines 50` |
| 官网能开、接口 502 | 后端没起来 | 同上 |
| 官网打开是白屏 | `dist` 没传上去 | 本机重新双击 `deploy.bat` |
| 后台能改、官网不更新 | 浏览器缓存 | `Ctrl + F5` 硬刷新 |
| 80 端口被占 | 系统自带默认站点 | `rm -f /etc/nginx/sites-enabled/default && systemctl restart nginx` |
| 上传图片失败 | `uploads` 目录权限 | `chmod -R a+rX /opt/onlystyle/app` |
| 提示 `Permission denied (publickey,password)` | root 密码没设 / 22 没放行 | 控制台重置密码，放行 22 |
