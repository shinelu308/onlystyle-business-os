#!/usr/bin/env bash
# =============================================================================
#  ONLYSTYLE · 应用服务器端一键部署脚本（对齐现网真实架构）
# -----------------------------------------------------------------------------
#  适用：Ubuntu 20.04+ / Debian 11+ / CentOS 7+ / Rocky / Alma  (x86_64 / arm64)
#
#  🔴 现网拓扑（务必先理解，否则会装错）：
#     · 本脚本只装「应用服务器」：两个 pm2 进程
#         onlystyle-api → 0.0.0.0:3100   Express（API + 后台 + /uploads /media）
#         onlystyle-web → 0.0.0.0:8085   官网静态站（website/dist，SPA）
#     · 公网入口在**另一台代理服务器**上，用 nginx upstream 反代到 3100 / 8085。
#       本脚本【不装 nginx】。代理机配置见 deploy/nginx/（www→8085，bos→3100）。
#
#  ⚠️ 为什么后端听 0.0.0.0 而不是 127.0.0.1：
#     代理机是**另一台机器**，必须能跨机访问 3100。所以绝不能把 server.js
#     改成只听 127.0.0.1（旧版脚本那段 sed 是历史遗留，已删除）。
#     安全边界由「云安全组 + 内网」保证：3100/8085 不对公网开放。
#
#  用法：
#    sudo bash bootstrap.sh [选项]
#      --domain   <域名>         只用于打印访问地址，默认 onlystyle.com.cn
#      --app-dir  <目录>         安装根目录，默认 /opt/business-os
#      --pkg      <路径>         离线安装包，默认 /tmp/onlystyle-deploy.tar.gz
#      --no-backup               跳过安装每日备份（cron 已存在时用）
#
#  特性：幂等 —— 可反复执行。**绝不覆盖线上已有的数据库**。
# =============================================================================
set -euo pipefail

APP_DIR=/opt/business-os
PKG_PATH=/tmp/onlystyle-deploy.tar.gz
DOMAIN=onlystyle.com.cn
INSTALL_BACKUP=1
NODE_MAJOR=22
NPMMIRROR=https://registry.npmmirror.com

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)    DOMAIN="${2:-}"; shift 2 ;;
    --app-dir)   APP_DIR="${2:-}"; shift 2 ;;
    --pkg)       PKG_PATH="${2:-}"; shift 2 ;;
    --no-backup) INSTALL_BACKUP=0; shift ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

LOG_DIR=$APP_DIR/logs
BACKUP_DIR=$APP_DIR/backups
API_PORT=3100
WEB_PORT=8085

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行： sudo bash bootstrap.sh"
# pm2 要挂在「真正跑服务的人」名下（root 直接部署就是 root；sudo 则用 SUDO_USER）
RUN_USER="${SUDO_USER:-root}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6 || echo /root)"

# -----------------------------------------------------------------------------
say "1/8  识别系统与包管理器"
# -----------------------------------------------------------------------------
if   command -v apt-get >/dev/null 2>&1; then PKG=apt
elif command -v dnf     >/dev/null 2>&1; then PKG=dnf
elif command -v yum     >/dev/null 2>&1; then PKG=yum
else die "认不出包管理器（既没有 apt-get 也没有 yum/dnf）"; fi
ok "包管理器：$PKG"

pkg_install() {
  case $PKG in
    apt) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    *)   $PKG install -y -q "$@" ;;
  esac
}

# -----------------------------------------------------------------------------
say "2/8  设置服务器时区为 Asia/Shanghai"
# -----------------------------------------------------------------------------
# 不能省：后端有「每日 09:00 提醒引擎」，合同到期判断也依赖本地日期。
timedatectl set-timezone Asia/Shanghai 2>/dev/null \
  || ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
ok "当前时间：$(date '+%F %T %Z')"

# -----------------------------------------------------------------------------
say "3/8  安装基础软件（curl / tar / xz / openssl）"
# -----------------------------------------------------------------------------
# ⚠️ 故意不装 nginx：公网入口在另一台代理机（见 deploy/nginx/）。
case $PKG in apt) apt-get update -qq >/dev/null 2>&1 || true ;; esac
pkg_install curl tar xz-utils ca-certificates openssl
ok "基础软件就绪"

# -----------------------------------------------------------------------------
say "4/8  安装 Node.js ${NODE_MAJOR} + pm2（走国内镜像）"
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
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --no-audit --no-fund --registry="$NPMMIRROR" >/dev/null 2>&1
fi
ok "pm2 已就绪：$(pm2 -v)"

# -----------------------------------------------------------------------------
say "5/8  解包项目代码到 $APP_DIR"
# -----------------------------------------------------------------------------
[ -f "$PKG_PATH" ] || die "找不到安装包 $PKG_PATH —— 请先在本机运行 deploy.bat 上传"
mkdir -p "$APP_DIR" "$BACKUP_DIR" "$LOG_DIR"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$PKG_PATH" -C "$STAGE"
[ -d "$STAGE/app" ] || die "安装包结构不对（里面没有 app/ 目录）"

# 🔴 数据库保护：线上已有的 DB 绝不能被本机快照覆盖
SERVER_DB="$APP_DIR/biz-os/backend/broadband_os.db"
HAD_DB=0
if [ -f "$SERVER_DB" ]; then
  HAD_DB=1
  KEEP="$BACKUP_DIR/db.before-upgrade.$(date +%Y%m%d-%H%M%S)"
  cp -f "$SERVER_DB" "$KEEP"
  ok "检测到线上已有数据库，已先另存一份：$KEEP"
fi

mkdir -p "$APP_DIR"
cp -a "$STAGE/app/." "$APP_DIR/"

if [ "$HAD_DB" = 1 ]; then
  if [ -f "$SERVER_DB.incoming" ]; then
    mv -f "$SERVER_DB.incoming" "$SERVER_DB.incoming.$(date +%Y%m%d-%H%M%S)"
  fi
  # 安装包里带来的 DB（= 你本机那份）改名留档；线上 DB 还原回原位
  if [ -f "$APP_DIR/biz-os/backend/broadband_os.db" ]; then
    mv -f "$APP_DIR/biz-os/backend/broadband_os.db" "$SERVER_DB.incoming" 2>/dev/null || true
  fi
  cp -f "$KEEP" "$SERVER_DB"
  warn "已保留【线上】数据库；安装包里那份存为 broadband_os.db.incoming"
  warn "内容域要同步请用 node scripts/content-sync.cjs（切勿整库覆盖）"
else
  ok "首次部署：采用安装包里的数据库"
fi

mkdir -p "$APP_DIR/biz-os/backend/uploads"
chmod -R a+rX "$APP_DIR"
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR" 2>/dev/null || true
ok "代码已就位（共 $(du -sh "$APP_DIR" | cut -f1)）"

# 🔴 跨机代理的前提：后端必须监听 0.0.0.0。这里只做「检测 + 告警」，绝不静默改写。
if ! grep -q "app.listen(PORT, '0.0.0.0'" "$APP_DIR/biz-os/backend/server.js" 2>/dev/null; then
  warn "server.js 的 listen 不是 '0.0.0.0' —— 跨机代理可能连不上 3100，请人工确认"
fi

# -----------------------------------------------------------------------------
say "6/8  安装后端依赖 + pm2 托管两个进程"
# -----------------------------------------------------------------------------
cd "$APP_DIR/biz-os/backend"
npm install --omit=dev --no-audit --no-fund --registry="$NPMMIRROR" >/dev/null 2>&1
ok "后端依赖安装完成"

# 单一真相源：pm2 定义随包发布（app/ecosystem.config.js），这里只做校验 + 落位
ECO="$APP_DIR/ecosystem.config.js"
if [ ! -f "$ECO" ] || ! grep -q 'onlystyle-web' "$ECO" 2>/dev/null; then
  die "安装包里缺少可用的 ecosystem.config.js（应含 onlystyle-api + onlystyle-web）—— 请重新打包"
fi
grep -q "PORT: '3100'" "$ECO" || warn "ecosystem.config.js 里 API 端口不是 3100，请确认与代理机 upstream 一致"
grep -q "PM2_SERVE_PORT: '8085'" "$ECO" || warn "ecosystem.config.js 里官网端口不是 8085，请确认与代理机 upstream 一致"
ok "pm2 定义已就位（$ECO）"

sudo -u "$RUN_USER" pm2 delete all >/dev/null 2>&1 || true
sudo -u "$RUN_USER" pm2 start "$ECO" >/dev/null
sudo -u "$RUN_USER" pm2 save >/dev/null
sudo -u "$RUN_USER" pm2 startup systemd -u "$RUN_USER" --hp "$RUN_HOME" >/dev/null 2>&1 \
  || warn "开机自启注册失败（不影响本次运行；可手动执行 pm2 startup 后再 pm2 save）"
ok "两个进程已由 pm2 托管：onlystyle-api(3100) / onlystyle-web(8085)"

sleep 2
if curl -fsS --max-time 5 "http://127.0.0.1:${API_PORT}/" >/dev/null 2>&1; then
  ok "后端自检通过：http://127.0.0.1:${API_PORT} 有响应"
else
  warn "后端暂时没响应，稍后用 pm2 logs onlystyle-api 查看原因"
fi
if curl -fsS --max-time 5 "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
  ok "官网自检通过：http://127.0.0.1:${WEB_PORT} 有响应"
else
  warn "官网暂时没响应，稍后用 pm2 logs onlystyle-web 查看原因"
fi

# -----------------------------------------------------------------------------
say "7/8  安装每日自动备份（03:00，保留最近 14 份）"
# -----------------------------------------------------------------------------
if [ "$INSTALL_BACKUP" = 1 ]; then
  cat > /usr/local/bin/onlystyle-backup <<BKEOF
#!/usr/bin/env bash
# ONLYSTYLE 每日备份：数据库 + 上传素材
set -uo pipefail
SRC=$APP_DIR/biz-os/backend
OUT=$BACKUP_DIR
mkdir -p "\$OUT" "$LOG_DIR"
TS=\$(date +%Y%m%d-%H%M%S)
ITEMS=""
[ -f "\$SRC/broadband_os.db" ] && ITEMS="\$ITEMS broadband_os.db"
[ -d "\$SRC/uploads" ]         && ITEMS="\$ITEMS uploads"
if [ -z "\$ITEMS" ]; then
  echo "[\$(date '+%F %T')] 没有可备份的数据" >> "$LOG_DIR/backup.log"; exit 0
fi
tar -czf "\$OUT/onlystyle-\$TS.tar.gz" -C "\$SRC" \$ITEMS
echo "[\$(date '+%F %T')] 备份完成 onlystyle-\$TS.tar.gz \$(du -h "\$OUT/onlystyle-\$TS.tar.gz" | cut -f1)" >> "$LOG_DIR/backup.log"
ls -1t "\$OUT"/onlystyle-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
BKEOF
  chmod +x /usr/local/bin/onlystyle-backup
  /usr/local/bin/onlystyle-backup >/dev/null 2>&1 && ok "备份脚本已装好，并已完成第一次备份"
  ( crontab -l 2>/dev/null | grep -v onlystyle-backup || true; echo '0 3 * * * /usr/local/bin/onlystyle-backup' ) | crontab -
  ok "定时任务已写入：每天 03:00"
else
  ok "按参数要求跳过备份安装"
fi

# -----------------------------------------------------------------------------
say "8/8  防火墙与代理配置提示"
# -----------------------------------------------------------------------------
# 🔴 应用服务器【不需要】对公网开 3100 / 8085；只留 SSH。
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ok "ufw：仅放行 22（3100/8085 保持关闭）"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=22/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  ok "firewalld：仅放行 22"
else
  warn "本机未启用防火墙 —— 请到云控制台安全组确认：3100/8085 只允许代理机访问"
fi
warn "⚠️  不要把 3100 / 8085 对公网放行；业务接口目前零鉴权，暴露即等于数据公开"

# -----------------------------------------------------------------------------
PUBLIC_IP=$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || echo "本机IP")
printf '\n\033[1;32m'
printf '╔══════════════════════════════════════════════════════════╗\n'
printf '║       ✅   应用服务器部署完成（pm2 双进程已运行）        ║\n'
printf '╚══════════════════════════════════════════════════════════╝\n'
printf '\033[0m\n'
printf '  本机自测\n'
printf '    后端 API   \033[1;36mhttp://127.0.0.1:%s\033[0m\n' "$API_PORT"
printf '    官网静态   \033[1;36mhttp://127.0.0.1:%s\033[0m\n' "$WEB_PORT"
printf '\n  接下来在【代理服务器】上（详见 deploy/nginx/README.md）\n'
printf '    1) 把这些文件拷过去：onlystyle-upstream.conf / onlystyle-proxy.inc /\n'
printf '       www.%s.conf / bos.%s.conf\n' "$DOMAIN" "$DOMAIN"
printf '    2) 把 upstream 里的 __APP_HOST__ 换成本机地址（内网 IP 最安全）：\n'
printf '       \033[1;33m%s\033[0m\n' "$PUBLIC_IP"
printf '    3) nginx -t && systemctl reload nginx\n'
printf '\n  访问地址（代理配好之后）\n'
printf '    官网   \033[1;36mhttps://www.%s\033[0m\n' "$DOMAIN"
printf '    后台   \033[1;36mhttps://bos.%s\033[0m\n' "$DOMAIN"
printf '\n  常用命令\n'
printf '    看服务     \033[36mpm2 list\033[0m\n'
printf '    看日志     \033[36mpm2 logs onlystyle-api --lines 50\033[0m\n'
printf '    重启后端   \033[36mpm2 restart onlystyle-api\033[0m\n'
printf '    重启官网   \033[36mpm2 restart onlystyle-web\033[0m\n'
printf '    内容同步   \033[36mnode scripts/content-sync.cjs\033[0m\n'
printf '    备份目录   \033[36m%s\033[0m\n' "$BACKUP_DIR"
printf '\n'
