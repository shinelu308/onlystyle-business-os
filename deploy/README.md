# deploy —— 一键部署到云服务器

给「不想碰命令行」的人准备的部署工具。整套只做一件事：
**把本机的项目打包、传上服务器、装好环境、起服务。**

---

## 现网真实拓扑（先看懂这张图）

```
   本机(Windows)                     应用服务器(生产)                 代理服务器(Nginx)
   ┌──────────┐   scp 打包上传    ┌────────────────────┐         ┌──────────────────────┐
   │ 构建官网  │ ───────────────▶ │ pm2 onlystyle-api   │         │ upstream            │
   │ 打包上传  │                  │     :3100  Express  │◀────────│  onlystyle_api 3100 │
   └──────────┘                  │ pm2 onlystyle-web   │         │  onlystyle_web 8085 │
                                 │     :8085 静态+API  │         └──────────────────────┘
                                 └────────────────────┘                  ▲    ▲
                                                                          │    │
                                              www.onlystyle.com.cn ───────┘    │
                                              bos.onlystyle.com.cn ────────────┘
```

| 位置 | 端口 | 进程 / 组件 | 作用 |
|---|---|---|---|
| 应用服务器 | **3100** | `pm2 onlystyle-api` | Express：API + 后台管理台 + `/uploads` `/media` |
| 应用服务器 | **8085** | `pm2 onlystyle-web` | 官网服务（`website/serve.cjs`）：`website/dist` 静态 + `/api` `/uploads` 反代到 3100 |
| 代理服务器 | 80 / 443 | Nginx `upstream` | `www.域名 → 8085`、`bos.域名 → 3100` |

🔴 **公网入口不在应用服务器上。** 应用服务器只开 22；`3100 / 8085` 只允许代理机访问
（最好走内网 IP）。代理配置在 [`nginx/`](./nginx/README.md)。

---

## 怎么用（3 步）

### 1. 买两台机器

| 项 | 建议 |
|---|---|
| 厂商 | 腾讯云 / 阿里云「**轻量应用服务器**」 |
| 地域 | 已有域名 + 已备案 → 上海 / 广州；未备案 → 中国香港 |
| 镜像 | **Ubuntu 22.04 LTS** |
| 配置 | 应用服务器 2 核 2G 起；代理服务器 1 核 1G 足够 |
| 网络 | 两台**放同一 VPC / 内网**，代理机用内网 IP 回源最安全 |

### 2. 放行端口（云控制台安全组）

| 机器 | 放行 | 说明 |
|---|---|---|
| 应用服务器 | `22` | 部署要走 SSH |
| 应用服务器 | `3100`、`8085` | **只允许代理机的内网 IP**（别对 `0.0.0.0/0` 开） |
| 代理服务器 | `22`、`80`、`443` | 公网入口在这台 |

> ⚠️ 业务接口目前**零鉴权**（详见下文「已知风险」），3100 一旦对公网开放 = 客户和合同数据公开。

### 3. 本机双击

双击 `deploy.bat`（Mac/Linux 用 `node deploy/deploy.cjs`）→ 第一次会让你**输一次服务器密码**（装免密密钥用），
之后每次都是双击即完事。

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `deploy.bat` | **双击这个**。Windows 启动器（纯 ASCII，不挑代码页） |
| `deploy.cjs` | 真正的部署逻辑：构建 → 打包 → 上传 → 远程执行 |
| `deploy.config.txt` | 你的配置（**不进 git**）。第一次运行自动从模板生成，只改 `SERVER_IP` |
| `deploy.config.example.txt` | 配置模板与注释说明 |
| `bootstrap.sh` | **服务器端**脚本：装 Node/pm2、解包、起两个 pm2 进程、配每日备份 |
| `nginx/` | **代理服务器**上的 Nginx 配置（upstream + www/bos 域名）+ 安装说明 |
| `selfcheck.cjs` | 工具链自检：`node deploy/selfcheck.cjs` |
| `verify-pack.cjs` | 打包边界验证（dry-run，不连服务器） |
| `.ssh/` | 自动生成的部署专用密钥（**不进 git**） |

---

## 它到服务器上具体做了什么

1. 识别系统（apt / yum / dnf）
2. **把时区设成 Asia/Shanghai** —— 后端有「每日 09:00 提醒引擎」，时区错会让合同状态差一天
3. 装 curl / tar / xz / openssl（**刻意不装 nginx** —— 入口在代理机）
4. 装 Node.js 22 + pm2（走 `registry.npmmirror.com`）
5. 解包代码到 `/opt/business-os`
   - 🔴 **线上已有数据库时不会被覆盖**，你本机那份改名存为 `broadband_os.db.incoming`
6. `npm install` 后端依赖，用包内 `ecosystem.config.js` 起**两个** pm2 进程（3100 / 8085）
   - ⚠️ 语义变了：旧版的「把 listen 改成 127.0.0.1」**已彻底删除**，跨机代理必须听 `0.0.0.0`
7. 装每日 03:00 自动备份（数据库 + 上传素材，保留 14 份）
8. 本机防火墙只放行 22，并提示去云安全组收紧 3100/8085

**代理服务器**上的 Nginx 配置需要单独装一次：见 [`nginx/README.md`](./nginx/README.md)。

---

## 常用运维命令（在应用服务器上）

```bash
pm2 list                              # 两个进程活着没
pm2 logs onlystyle-api --lines 50     # 看后端日志
pm2 logs onlystyle-web --lines 50     # 看官网日志
pm2 restart onlystyle-api             # 重启后端
onlystyle-backup                      # 手动备份一次
ls -lh /opt/business-os/backups       # 看备份
node scripts/content-sync.cjs         # 同步内容域（见下节）
```

---

## 内容同步（重要）

`broadband_os.db` 里同时躺着**两类数据**：

- **内容域**：`content_*` 表 + `content_settings`（官网/后台的内容、导航、logo、案例…）
- **业务域**：客户、合同、线路、节点、员工、线索

所以 **绝不能用「整库覆盖」的方式同步内容** —— 你本机那份 DB 往往只有测试客户，
一覆盖线上真实业务数据就没了。正确做法：

```bash
node scripts/content-sync.cjs --from <一份包含最新内容的 DB>   # 只换内容域，业务表原样不动
node scripts/content-sync.cjs --from <db> --dry-run            # 先看差异
```

> 🔴 另注：仓库**曾把 `broadband_os.db` 纳入 git** 用于「git pull 同步」（提交 `3d273da`）。
> 这条路是危险的：线上每次写库都会让工作区变脏，一 pull 就可能覆盖线上新数据。
> **请一律改用 `content-sync.cjs`，不要对线上执行 `git pull` / 强制 checkout DB。**

---

## 参数

```bash
node deploy/deploy.cjs --dry-run        # 只打包、只报体积，不连服务器
node deploy/deploy.cjs --skip-build     # 跳过官网构建，用现有 dist
node deploy/deploy.cjs --domain a.com   # 临时覆盖域名
node deploy/selfcheck.cjs               # 工具链自检
node deploy/verify-pack.cjs             # 打包边界验证
```

---

## 出问题先看这里

| 症状 | 原因 | 处置 |
|---|---|---|
| `pm2 list` 两个进程都 online，但域名 502 | 代理机 upstream 的 `__APP_HOST__` 没替换 / 指错 | 改 `deploy/nginx/onlystyle-upstream.conf` 后 `nginx -t && systemctl reload nginx` |
| 官网能开、接口 502 | 后端没起来 | `pm2 logs onlystyle-api --lines 50` |
| 官网「壳出来了但内容全空」 | 8085 的 `/api` 反代没生效（或 `/api` 被指到了只做静态的端口） | 服务器上 `curl -s http://127.0.0.1:8085/api/content/site`，应返回 JSON；返回 HTML 就是反代没生效 |
| 后台打不开 | 3100 没被代理机连上 | 安全组是否允许代理机访问 3100；`curl` 代理机上测 `http://<APP_HOST>:3100/` |
| 官网打开是白屏 | `website/dist` 没传上去 | 本机重新双击 `deploy.bat` |
| 后台能改、官网不更新 | 浏览器缓存 | `Ctrl + F5` 硬刷新 |
| 上传证书/图片失败 413 | 代理机 `client_max_body_size` 太小 | 已是 `25m`，若改过请恢复 |
| 提示 `Permission denied (publickey,password)` | root 密码没设 / 22 没放行 | 控制台重置密码，放行 22 |

---

## ⚠️ 已知风险（部署工具解决不了，需另行处理）

1. **业务接口零鉴权**：`/api/customers`、`/api/contracts`、`/api/staff`、`/api/settings` 等
   匿名可读可写，且 `cors()` 全开。**唯一防线是「3100 不暴露到公网」**。
2. **口令明文**：`staff.password` 是明文存储 + 明文比对，建议改哈希。
3. **密钥在 git 里**：`broadband_os.db` 曾被提交入库，内含真实 `wechat_appsecret` 等，
   仓库一旦转公开或加协作者即泄露，建议轮换。
