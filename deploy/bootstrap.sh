#!/usr/bin/env bash
# =============================================================================
#  ONLYSTYLE 业务系统 · 服务器端一键部署脚本
# -----------------------------------------------------------------------------
#  适用系统：Ubuntu 20.04+ / Debian 11+ / CentOS 7+ / Rocky / Alma   (x86_64 / arm64)
#  用法：    sudo bash bootstrap.sh [选项]
#     --domain  <域名>      填了就额外启用「域名 + 80」站点（需域名已解析到本机）
#     --https               配合 --domain 使用，自动申请 Let's Encrypt 证书
#     --web-port   <端口>   官网访问端口，默认 8080
#     --admin-port <端口>   后台访问端口，默认 8081
#     --admin-user <用户名> 后台访问口令用户名，默认 onlystyle
#     --admin-pass <口令>   后台访问口令，留空则自动生成随机口令
#     --pkg   <路径>        离线安装包路径，默认 /tmp/onlystyle-deploy.tar.gz
#
#  特性：幂等 —— 可反复执行。**绝不覆盖线上已有的数据库**。
# =============================================================================
set -euo pipefail

APP_DIR=/opt/onlystyle
APP_ROOT=$APP_DIR/app
BACKUP_DIR=$APP_DIR/backups
LOG_DIR=$APP_DIR/logs
PKG_PATH=/tmp/onlystyle-deploy.tar.gz
PM2_NAME=onlystyle-api
API_PORT=3100
NODE_MAJOR=22
NPMMIRROR=https://registry.npmmirror.com

WEB_PORT=8080
ADMIN_PORT=8081
DOMAIN=""
USE_HTTPS=0
ADMIN_USER=onlystyle
ADMIN_PASS=""
GENERATED_PASS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)     DOMAIN="${2:-}"; shift 2 ;;
    --https)      USE_HTTPS=1; shift ;;
    --web-port)   WEB_PORT="${2:-}"; shift 2 ;;
    --admin-port) ADMIN_PORT="${2:-}"; shift 2 ;;
    --admin-user) ADMIN_USER="${2:-}"; shift 2 ;;
    --admin-pass) ADMIN_PASS="${2:-}"; shift 2 ;;
    --pkg)        PKG_PATH="${2:-}"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行： sudo bash bootstrap.sh"

# -----------------------------------------------------------------------------
say "1/10  识别系统与包管理器"
# -----------------------------------------------------------------------------
if   command -v apt-get >/dev/null 2>&1; then PKG=apt
elif command -v dnf     >/dev/null 2>&1; then PKG=dnf
elif command -v yum     >/dev/null 2>&1; then PKG=yum
else die "认不出包管理器（既没有 apt-get 也没有 yum/dnf），本脚本只支持 Debian/Ubuntu/CentOS 系"; fi
ok "包管理器：$PKG"

pkg_install() {
  case $PKG in
    apt) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    *)   $PKG install -y -q "$@" ;;
  esac
}

# -----------------------------------------------------------------------------
say "2/10  设置服务器时区为 Asia/Shanghai"
# -----------------------------------------------------------------------------
# 不能省：后端有「每日 09:00 提醒引擎」定时任务，合同到期判断也依赖本地日期。
# 时区错 = 合同状态可能差一天。
timedatectl set-timezone Asia/Shanghai 2>/dev/null \
  || ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
ok "当前时间：$(date '+%F %T %Z')"

# -----------------------------------------------------------------------------
say "3/10  安装基础软件（nginx / curl / tar / xz / openssl）"
# -----------------------------------------------------------------------------
case $PKG in apt) apt-get update -qq >/dev/null 2>&1 || true ;; esac
pkg_install nginx curl tar xz-utils ca-certificates openssl
ok "nginx 已就绪：$(nginx -v 2>&1 | sed 's/.*nginx\///')"

# -----------------------------------------------------------------------------
say "4/10  安装 Node.js ${NODE_MAJOR}（走国内镜像）"
# -----------------------------------------------------------------------------
need_node() {
  command -v node >/dev/null 2>&1 || return 0
  local major
  major=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)
  [ -n "$major" ] && [ "$major" -ge 18 ] 2>/dev/null && return 1
  return 0
}

if need_node; then
  case "$(uname -m)" in
    x86_64|amd64)  NARCH=x64 ;;
    aarch64|arm64) NARCH=arm64 ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
  BASE="$NPMMIRROR/-/binary/node/latest-v${NODE_MAJOR}.x"
  TGZ=$(curl -fsSL "$BASE/" 2>/dev/null | tr ',' '\n' \
        | grep -o "node-v${NODE_MAJOR}\.[0-9.]*-linux-${NARCH}\.tar\.xz" | head -1 || true)
  [ -n "$TGZ" ] || die "取不到 Node 下载地址 —— 服务器可能连不上外网（检查云防火墙出网规则）"
  ok "下载 $TGZ"
  curl -fsSL -o "/tmp/$TGZ" "$BASE/$TGZ"
  mkdir -p /usr/local/lib/nodejs
  tar -xJf "/tmp/$TGZ" -C /usr/local/lib/nodejs
  NODEDIR="/usr/local/lib/nodejs/${TGZ%.tar.xz}"
  ln -sf "$NODEDIR/bin/node" /usr/local/bin/node
  ln -sf "$NODEDIR/bin/npm"  /usr/local/bin/npm
  ln -sf "$NODEDIR/bin/npx"  /usr/local/bin/npx
  rm -f "/tmp/$TGZ"
  ok "Node $(node -v) 安装完成"
else
  ok "已装 Node $(node -v)，跳过"
fi
npm config set registry "$NPMMIRROR" --global >/dev/null 2>&1 || true
ok "npm 镜像已指向 $NPMMIRROR"

# -----------------------------------------------------------------------------
say "5/10  解包项目代码到 $APP_ROOT"
# -----------------------------------------------------------------------------
[ -f "$PKG_PATH" ] || die "找不到安装包 $PKG_PATH —— 请先在本机运行 deploy.bat 上传"
mkdir -p "$APP_DIR" "$BACKUP_DIR" "$LOG_DIR"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$PKG_PATH" -C "$STAGE"
[ -d "$STAGE/app" ] || die "安装包结构不对（里面没有 app/ 目录）"

# 🔴 数据库保护：线上已有的 DB 绝不能被本机快照覆盖
SERVER_DB="$APP_ROOT/biz-os/backend/broadband_os.db"
HAD_DB=0
if [ -f "$SERVER_DB" ]; then
  HAD_DB=1
  KEEP="$BACKUP_DIR/db.before-upgrade.$(date +%Y%m%d-%H%M%S)"
  cp -f "$SERVER_DB" "$KEEP"
  ok "检测到线上已有数据库，已先另存一份"
fi

mkdir -p "$APP_ROOT"
cp -a "$STAGE/app/." "$APP_ROOT/"

if [ "$HAD_DB" = 1 ]; then
  mv -f "$SERVER_DB" "$SERVER_DB.incoming"
  cp -f "$KEEP" "$SERVER_DB"
  warn "已保留【线上】数据库；你本机那份存为 broadband_os.db.incoming"
else
  ok "首次部署：采用安装包里的数据库"
fi

mkdir -p "$APP_ROOT/biz-os/backend/uploads"
chmod -R a+rX "$APP_ROOT"
ok "代码已就位（共 $(du -sh "$APP_ROOT" | cut -f1)）"

# -----------------------------------------------------------------------------
say "6/10  安装后端依赖 + pm2 进程守护"
# -----------------------------------------------------------------------------
cd "$APP_ROOT/biz-os/backend"

# 🔴 server.js 里写死了 app.listen(PORT, '0.0.0.0')，会让下面的 HOST 环境变量失效。
#    这里在服务器侧改成可被 HOST 覆盖，让后端只听 127.0.0.1（外网必须过 nginx）。
#    幂等：已经改过就不匹配，无事发生。
if grep -q "app.listen(PORT, '0.0.0.0'" server.js 2>/dev/null; then
  sed -i "s|app.listen(PORT, '0.0.0.0'|app.listen(PORT, process.env.HOST \|\| '0.0.0.0'|" server.js
  ok "已让后端支持 HOST 环境变量（仅监听 127.0.0.1，更安全）"
fi

npm install --omit=dev --no-audit --no-fund --registry="$NPMMIRROR" >/dev/null 2>&1
ok "后端依赖安装完成"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --no-audit --no-fund --registry="$NPMMIRROR" >/dev/null 2>&1
fi
ok "pm2 已就绪"

cat > "$APP_ROOT/ecosystem.config.js" <<PM2CONF
// pm2 进程守护配置 —— 后端只监听 127.0.0.1，外网必须经由 nginx 访问
module.exports = {
  apps: [{
    name: '${PM2_NAME}',
    script: 'server.js',
    cwd: '${APP_ROOT}/biz-os/backend',
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '${API_PORT}' },
    instances: 1,
    autorestart: true,
    max_memory_restart: '400M',
    out_file: '${LOG_DIR}/api.out.log',
    error_file: '${LOG_DIR}/api.err.log',
    merge_logs: true,
    time: true,
  }],
};
PM2CONF

pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
pm2 start "$APP_ROOT/ecosystem.config.js" >/dev/null
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 \
  || warn "开机自启注册失败（不影响本次运行；可手动执行 pm2 startup 后再 pm2 save）"
ok "后端已由 pm2 托管（进程名 ${PM2_NAME}）"

sleep 2
if curl -fsS --max-time 5 "http://127.0.0.1:${API_PORT}/" >/dev/null 2>&1; then
  ok "后端自检通过：http://127.0.0.1:${API_PORT} 有响应"
else
  warn "后端暂时没响应，稍后用 pm2 logs ${PM2_NAME} 查看原因"
fi

# -----------------------------------------------------------------------------
say "7/10  生成 nginx 配置（官网 + 后台）"
# -----------------------------------------------------------------------------
cat > /etc/nginx/onlystyle-proxy.inc <<'PROXYEOF'
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
    proxy_read_timeout 300s;
    proxy_buffering off;
PROXYEOF

# ---- 官网：静态文件 = website/dist，/api 与 /uploads 反代到后端 ----
cat > /etc/nginx/conf.d/onlystyle-web.conf <<WEBEOF
server {
    listen ${WEB_PORT} default_server;
    server_name _;
    root ${APP_ROOT}/website/dist;
    index index.html;
    client_max_body_size 20m;

    # 接口与上传素材都在后端，必须反代 —— 否则官网拿不到内容
    location /api/     { proxy_pass http://127.0.0.1:${API_PORT}; include /etc/nginx/onlystyle-proxy.inc; }
    location /uploads/ { proxy_pass http://127.0.0.1:${API_PORT}; include /etc/nginx/onlystyle-proxy.inc; }

    # 带 hash 的构建产物长缓存；HTML 绝不缓存，否则改完看不到
    location ~* ^/static/.*\.(js|css|woff2?|ttf|otf)\$ { expires 30d; add_header Cache-Control "public, immutable"; }
    location ~* \.(png|jpe?g|gif|svg|webp|avif|ico|mp4|webm)\$      { expires 7d;  add_header Cache-Control "public"; }
    location = /index.html { add_header Cache-Control "no-store, must-revalidate"; }
    location / { try_files \$uri \$uri/ /index.html; }
}
WEBEOF

# ---- 后台：全量反代到后端 + Basic Auth 兜底 ----
# 宽带业务线的接口目前是零鉴权（/api/* 匿名可调），直接暴露公网风险很高，先加一道门。
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-14)
  GENERATED_PASS=1
fi
printf '%s:%s\n' "$ADMIN_USER" "$(openssl passwd -apr1 "$ADMIN_PASS")" > /etc/nginx/onlystyle.htpasswd
chmod 640 /etc/nginx/onlystyle.htpasswd

cat > /etc/nginx/conf.d/onlystyle-admin.conf <<ADMEOF
server {
    listen ${ADMIN_PORT};
    server_name _;
    client_max_body_size 20m;

    auth_basic           "ONLYSTYLE Admin";
    auth_basic_user_file /etc/nginx/onlystyle.htpasswd;

    location / { proxy_pass http://127.0.0.1:${API_PORT}; include /etc/nginx/onlystyle-proxy.inc; }
}
ADMEOF

# ---- 域名模式（可选，需域名已解析到本机；大陆节点还需 ICP 备案）----
if [ -n "$DOMAIN" ]; then
  APEX=$(printf '%s' "$DOMAIN" | sed 's/^www\.//')
  cat > /etc/nginx/conf.d/onlystyle-domain.conf <<DOMEOF
server {
    listen 80;
    server_name ${APEX} www.${APEX};
    root ${APP_ROOT}/website/dist;
    index index.html;
    client_max_body_size 20m;
    location /api/     { proxy_pass http://127.0.0.1:${API_PORT}; include /etc/nginx/onlystyle-proxy.inc; }
    location /uploads/ { proxy_pass http://127.0.0.1:${API_PORT}; include /etc/nginx/onlystyle-proxy.inc; }
    location / { try_files \$uri \$uri/ /index.html; }
}
server {
    listen 80;
    server_name admin.${APEX};
    client_max_body_size 20m;
    auth_basic           "ONLYSTYLE Admin";
    auth_basic_user_file /etc/nginx/onlystyle.htpasswd;
    location / { proxy_pass http://127.0.0.1:${API_PORT}; include /etc/nginx/onlystyle-proxy.inc; }
}
DOMEOF
  ok "已生成域名站点：${APEX} / www.${APEX} / admin.${APEX}"
  # Ubuntu 自带的默认站点会占掉 80 端口的 default_server，删掉避免抢请求
  rm -f /etc/nginx/sites-enabled/default
fi

if ! nginx -t >/dev/null 2>&1; then nginx -t; die "nginx 配置有语法错误（见上面输出）"; fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl restart nginx
else
  nginx -s reload
fi
ok "nginx 已启动：官网 ${WEB_PORT} / 后台 ${ADMIN_PORT}"

# -----------------------------------------------------------------------------
say "8/10  安装每日自动备份（03:00，保留最近 14 份）"
# -----------------------------------------------------------------------------
cat > /usr/local/bin/onlystyle-backup <<'BKEOF'
#!/usr/bin/env bash
# ONLYSTYLE 每日备份：数据库 + 上传素材
set -uo pipefail
BASE=/opt/onlystyle
SRC=$BASE/app/biz-os/backend
OUT=$BASE/backups
mkdir -p "$OUT" "$BASE/logs"
TS=$(date +%Y%m%d-%H%M%S)
ITEMS=""
[ -f "$SRC/broadband_os.db" ] && ITEMS="$ITEMS broadband_os.db"
[ -d "$SRC/uploads" ]         && ITEMS="$ITEMS uploads"
if [ -z "$ITEMS" ]; then
  echo "[$(date '+%F %T')] 没有可备份的数据" >> "$BASE/logs/backup.log"; exit 0
fi
tar -czf "$OUT/onlystyle-$TS.tar.gz" -C "$SRC" $ITEMS
echo "[$(date '+%F %T')] 备份完成 onlystyle-$TS.tar.gz $(du -h "$OUT/onlystyle-$TS.tar.gz" | cut -f1)" >> "$BASE/logs/backup.log"
ls -1t "$OUT"/onlystyle-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
BKEOF
chmod +x /usr/local/bin/onlystyle-backup
/usr/local/bin/onlystyle-backup >/dev/null 2>&1 && ok "备份脚本已装好，并已完成第一次备份"

( crontab -l 2>/dev/null | grep -v onlystyle-backup || true; echo '0 3 * * * /usr/local/bin/onlystyle-backup' ) | crontab -
ok "定时任务已写入：每天 03:00"

# -----------------------------------------------------------------------------
say "9/10  放行本机防火墙端口"
# -----------------------------------------------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 22/tcp            >/dev/null 2>&1 || true
  ufw allow "$WEB_PORT"/tcp   >/dev/null 2>&1 || true
  ufw allow "$ADMIN_PORT"/tcp >/dev/null 2>&1 || true
  ok "ufw 已放行 22 / ${WEB_PORT} / ${ADMIN_PORT}"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$WEB_PORT"/tcp   >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port="$ADMIN_PORT"/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  ok "firewalld 已放行 ${WEB_PORT} / ${ADMIN_PORT}"
else
  warn "本机未启用防火墙 —— 请务必到云控制台的『防火墙 / 安全组』放行 ${WEB_PORT} 与 ${ADMIN_PORT}"
fi
warn "⚠️  ${API_PORT} 端口【不要】对公网放行（后端直连无鉴权）"

# -----------------------------------------------------------------------------
say "10/10  申请 HTTPS 证书（可选）"
# -----------------------------------------------------------------------------
if [ "$USE_HTTPS" = 1 ] && [ -n "$DOMAIN" ]; then
  APEX=$(printf '%s' "$DOMAIN" | sed 's/^www\.//')
  if pkg_install certbot python3-certbot-nginx 2>/dev/null || pkg_install certbot 2>/dev/null; then
    if certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email \
         -d "$APEX" -d "www.$APEX" -d "admin.$APEX" --redirect >/dev/null 2>&1; then
      ok "HTTPS 证书已签发（certbot 会自动续期）"
    else
      warn "证书申请失败 —— 通常是域名没解析到本机，或大陆节点尚未备案。不影响 HTTP 访问。"
    fi
  else
    warn "certbot 安装失败，已跳过 HTTPS"
  fi
elif [ "$USE_HTTPS" = 1 ]; then
  warn "用了 --https 但没给 --domain，已跳过"
else
  ok "未启用 HTTPS（要启用：再加 --domain 你的域名 --https）"
fi

# -----------------------------------------------------------------------------
PUBLIC_IP=$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || echo "你的服务器公网IP")
printf '\n\033[1;32m'
printf '╔══════════════════════════════════════════════════════════╗\n'
printf '║               ✅   部署完成！                            ║\n'
printf '╚══════════════════════════════════════════════════════════╝\n'
printf '\033[0m\n'
printf '  官网首页     \033[1;36mhttp://%s:%s\033[0m\n' "$PUBLIC_IP" "$WEB_PORT"
printf '  后台管理     \033[1;36mhttp://%s:%s\033[0m\n' "$PUBLIC_IP" "$ADMIN_PORT"
if [ -n "$DOMAIN" ]; then printf '  域名入口     \033[1;36mhttp://%s\033[0m\n' "$DOMAIN"; fi
printf '\n  后台访问口令\n'
printf '    用户名     \033[1;33m%s\033[0m\n' "$ADMIN_USER"
if [ "$GENERATED_PASS" = 1 ]; then
  printf '    密码       \033[1;33m%s\033[0m   ← 自动生成，请立刻抄下来\n' "$ADMIN_PASS"
else
  printf '    密码       （你设置的那个）\n'
fi
printf '\n  打不开的话，按顺序排查：\n'
printf '    1) 云控制台『防火墙』是否放行了 %s 与 %s（最常见）\n' "$WEB_PORT" "$ADMIN_PORT"
printf '    2) pm2 list —— 看 onlystyle-api 是不是 online\n'
printf '    3) pm2 logs onlystyle-api --lines 50\n'
printf '    4) 若 80 端口被占：rm -f /etc/nginx/sites-enabled/default && systemctl restart nginx\n'
printf '\n  常用命令\n'
printf '    看服务     \033[36mpm2 list\033[0m\n'
printf '    看日志     \033[36mpm2 logs %s --lines 50\033[0m\n' "$PM2_NAME"
printf '    重启后端   \033[36mpm2 restart %s\033[0m\n' "$PM2_NAME"
printf '    手动备份   \033[36monlystyle-backup\033[0m\n'
printf '    备份目录   \033[36m%s\033[0m\n' "$BACKUP_DIR"
printf '\n'
