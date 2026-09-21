# deploy/nginx —— 代理服务器上的 Nginx 配置

本系统的公网入口**不在应用服务器上**，而在**另一台代理服务器**上。

```
                      公网
                       │
              ┌────────┴─────────┐
   www.onlystyle.com.cn    bos.onlystyle.com.cn
              │                    │
        ┌─────▼─────┐        ┌─────▼─────┐
        │  upstream │        │  upstream │        ← 本目录的配置
        │onlystyle_web      │onlystyle_api
        └─────┬─────┘        └─────┬─────┘
              │ :8085              │ :3100
              └────────┬───────────┘
                       ▼
              应用服务器（pm2 托管两个进程）
                onlystyle-web  ← website/dist 静态站
                onlystyle-api  ← Express（API / 后台 / uploads / media）
```

## 端口与域名映射

| 域名 | upstream | 应用服务器端口 | 内容 |
|---|---|---|---|
| `www.onlystyle.com.cn`（含裸域） | `onlystyle_web` | **8085** | 官网 SPA 页面、`/media` 素材 |
| 同上 · `/api/`、`/uploads/` | `onlystyle_api` | **3100** | 内容接口、品牌图/证书图 |
| `bos.onlystyle.com.cn` | `onlystyle_api` | **3100** | 后台管理台全量（页面+接口） |

## 安装步骤（在代理服务器上，root）

```bash
# 1) 放入配置
cp onlystyle-upstream.conf       /etc/nginx/conf.d/00-onlystyle-upstream.conf
cp onlystyle-proxy.inc           /etc/nginx/onlystyle-proxy.inc
cp www.onlystyle.com.cn.conf     /etc/nginx/conf.d/
cp bos.onlystyle.com.cn.conf     /etc/nginx/conf.d/

# 2) 🔴 把应用服务器地址填进去（内网 IP 最安全）
sed -i 's/__APP_HOST__/10.0.0.12/g' /etc/nginx/conf.d/00-onlystyle-upstream.conf

# 3) 校验并重载
nginx -t && systemctl reload nginx
```

> 用内网 IP（同 VPC）时，应用服务器的 `3100 / 8085` **不需要**对公网开放，
> 云安全组里只保留代理机的内网访问即可 —— 这是最安全的形态。

## 上 HTTPS（强烈建议）

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d www.onlystyle.com.cn -d onlystyle.com.cn -d bos.onlystyle.com.cn --redirect
```

certbot 会自动改写上面的 server 块并处理续期。上完后：

- 微信公众平台的回调地址必须是 **https**：`https://bos.onlystyle.com.cn/api/wechat/callback`
- `system_settings.wechat_redirect_uri` 也要同步成 `https://bos.onlystyle.com.cn/wechat/callback`

## ⚠️ 与旧版区别（重要）

旧版 `bootstrap.sh` 会在**应用服务器本机**装 nginx，把官网挂 8080、后台挂 8081 并加 Basic Auth。
那套拓扑在「前后端分域」的现网已经不成立：

- 现网官网是 pm2 托管的 `website/serve.cjs`（8085：静态 `dist` + `/api` `/uploads` 反代到 3100），
  不是 nginx 静态根目录；因此域名侧即使不写 `/api` 也能出内容（这里写是为了少一跳）；
- 现网后台无 Basic Auth，鉴权靠应用层（`lib/admin-auth.js` + 登录 token）；
- 旧脚本还有一段把 `server.js` 改成只听 `127.0.0.1` 的 `sed`，跨机代理下会让 3100 直接连不通。

所以：**不要再在应用服务器上装 nginx，也不要跑旧版那段 sed。**
本目录是唯一权威的代理配置来源。
