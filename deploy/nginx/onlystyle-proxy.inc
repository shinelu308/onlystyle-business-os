# =============================================================================
#  ONLYSTYLE · 公共反向代理头（被 www / bos 两个 server 块 include）
# -----------------------------------------------------------------------------
#  放置位置：/etc/nginx/onlystyle-proxy.inc
#  用法：    location / { proxy_pass http://onlystyle_api; include /etc/nginx/onlystyle-proxy.inc; }
#
#  ⚠️ 与旧版（单机 nginx）的区别：
#     旧版把 Connection 设成 "upgrade" 是为了给 WebSocket 留口子；
#     本系统没有任何 WS/SSE 端点，而 "upgrade" 会让上面的 upstream keepalive 失效。
#     所以这里固定 Connection ""，长连接池才能真正复用。
# =============================================================================

proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Connection        "";

proxy_connect_timeout 10s;
proxy_send_timeout    300s;
proxy_read_timeout    300s;
proxy_buffering       off;
