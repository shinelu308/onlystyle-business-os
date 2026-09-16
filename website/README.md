# ONLYSTYLE 官网（website）

上海唯风信息技术有限公司官网。Vue 3 + Vite，视觉基线是 Lovart 设计稿
（`design/ref-design/index.html`），内容来自 BOS 内容中台（失败自动回落本地兜底）。

> 官网不是独立营销站，而是**多业务线系统「内容运营域」的一个分发端点**。
> 口径见 `design/多业务线系统架构设计方案.md` 第九节；
> 前后端唯一接口依据是 `design/内容中台-API契约.md`。

## 快速开始

```bash
cd website
npm install

npm run dev        # 开发，http://127.0.0.1:3200
npm run build      # 生产构建 -> dist/
npm run preview    # 预览构建产物，http://127.0.0.1:3201
```

开发期 `/api` 与 `/uploads` 由 Vite 代理到 BOS 后端（`biz-os/backend`，3100）
—— **`server` 和 `preview` 两处都配了代理**，别只配一处，否则验证接口模式时后端起着也连不上。
生产由 nginx 同域反代，前端代码里始终写相对路径。

## 和内容中台联调

内容真相源在 BOS。只起前端不会报错，但页面会用兜底数据 ——
**看起来"正常"其实后台改了不会变**。要确认走的是真接口，必须同时起后端：

```bash
# 1. 后端（3100）—— 首次启动会把后台令牌打印一次
cd biz-os/backend && node server.js

# 2. 前端
cd website && npm run build && npm run preview   # 3201
```

后台写接口要 `X-Admin-Token` 头，令牌存在 `content_settings` 表的 `admin.content_token`：

```bash
curl -s -H "X-Admin-Token: <token>" http://127.0.0.1:3100/api/content/admin/home-blocks
```

内容接口带 `Cache-Control: public, max-age=60, stale-while-revalidate=300`
—— 后台改完最坏 60 秒才可见，这是设计如此。**用浏览器验证时记得 Ctrl+F5 或禁缓存**，
否则会误判成"改了没生效"。

## 端到端验证

```bash
# 后台接口（路由顺序 / 鉴权 / CRUD / 调序 / 版本号）
node design/site-audit/e2e-admin-api.cjs <token>

# 决定性验证：改后台 -> 刷前台 -> 断言前台真的跟着变（跑完自动还原）
NODE_PATH="C:/Users/Shine Lu/.workbuddy/binaries/node/workspace/node_modules" \
  node design/site-audit/e2e-content-live.cjs <token>
```

第 2 个脚本是**唯一能证明"内容来自中台而不是兜底"的检查**：它把 hero 标题改成
一个前端 bundle 里根本不存在的哨兵文案，刷新后断言 DOM 里出现了它。

## 目录

```
src/
  api/content.js        内容中台读接口封装（+ 线索提交）
  composables/
    useContent.js       有接口走接口、失败静默回落兜底；带形状哨兵
    useSite.js          全站共享的 site 配置（只发一次请求）
    useReveal.js        滚动进场动画（只作用于视口下方的元素）
  blocks/registry.js    type -> 首页区块组件，后台只给 type
  components/           SiteNav / SiteFooter / PageHero / SectionHeader / BrandLogo / SvcIcon
  components/home/      首页 6 个区块（Hero / Services / WhyUs / Cases / Partners / Cta）
  data/fallback/        接口不可用时的兜底内容（字段名与契约严格一致）
  pages/                6 个页面 + NotFound
  router/index.js       路由 + 每页 title/description
  styles/
    design-system.css   ⚠️ 从设计稿自动抽取，勿手改
    site.css            自有补充样式写这里
scripts/
  extract-css.js        从 design/ref-design/index.html 重新抽取设计系统
  fetch-site-assets.js  从线上站点下载图片素材
  shots.cjs             逐页截图自检
public/media/           视频 / 字体 / 线上迁移来的图片
```

## 首页是配置驱动的

`Home.vue` 只做三件事：取 `home_blocks` → 过滤 `enabled` 并按 `sort` 排序 → 按 `type` 找组件。
后台调顺序、下线某个区块、改 Hero 文案，**前台立刻跟着变，不用动任何 `.vue` 文件**。
新增一种区块 = `registry.js` 加一行映射 + 写一个组件。

## 三条容易踩的约定

**1. `src/styles/design-system.css` 不要手改。**
它是 `npm run` 外部脚本从设计稿 `<style>` 块抽出来的（`node scripts/extract-css.js`），
下次抽取会覆盖。所有自定义样式写到 `site.css`，它在这之后加载，同优先级下后者生效。

**2. 组件用设计稿原有的 class 名。**
`.hero` `.service-card` `.case-card` `.partner-item` `.btn-primary`……这些都在
`design-system.css` 里有完整定义。新写组件时沿用同名 class，样式自动生效，
不要另起一套命名。设计稿没有的才在 `site.css` 里补。

**3. 预渲染产物必须是「可见」的。**
`useReveal.js` 不在初始 DOM 上写 `opacity:0`，而是等 JS 挂载后只对「此刻在视口下方」
的元素加隐藏态。这样搜索引擎、无 JS 环境、首屏元素都直接可见。
**新增带动画的区块时不要破坏这个前提。**

## 已修的坑（别改回去）

- **移动端菜单必须不透明。** 设计系统给的是 `rgba(7,18,41,0.97)` + `backdrop-filter`，
  实测叠在 `<video>` 背景上时 `backdrop-filter` 表现不可靠，Hero 大字会明显透上来。
  已在 `site.css` 覆盖为实色 + `max-height` 可滚动。
- **合作伙伴 logo 要套白色 chip。** 源图统一是 238×54 的**白底画布**，
  直接铺在深色底上会变成一块块亮方块。`site.css` 里把 `.partner-item` 改成白色圆角 chip。
- **`/api/content/home` 的 `data` 是 `{ blocks: [...] }`，不是裸数组。**
  它是唯一一个"列表却包在对象里"的接口。少拆一层 `.blocks` 的后果极其隐蔽：
  首屏用兜底数组正常渲染 → `onMounted` 拿到真数据 → **重渲染时抛 `TypeError`** →
  DOM 就冻结在首屏那一版，症状是「后台改了内容前台死活不动」。
  现在 `getHomeBlocks()` 会拆包、`pickBlocks()` 两种形状都吃、`useContent` 还会在
  形状不符时 `console.warn` 报警。**新增内容接口时请让 `data` 保持裸数组。**

## 待办 / 已知缺口

- [ ] **Hero 视频 7.8 MB**，需转码（webm/av1）+ 上 CDN
- [ ] **Inter 字体**仍走 Google Fonts CDN，需自托管（阿里普惠体已本地化）
- [ ] **高德 JS API 未接**，需 key 并在控制台配域名白名单（现为占位 + 跳转链接）
- [ ] 预渲染脚本未写（`scripts/prerender.js` 在 package.json 里被引用但还没实现）
- [ ] 设计稿的案例文案/数据部分是 AI 占位，需业务确认后替换
- [ ] `getBootstrap()` / `prefetch()` 已实现但未使用；契约文档写的 `/bootstrap` 返回
      `{ site, nav, homeBlocks }`，实际后端返回 `{ site, homeBlocks }`（`nav` 在 `site` 内）——
      要么用起来时对齐，要么删掉

## 线上现状的一个关键事实

原站 `onlystyle.com.cn` 的**子路由直连全部 404**（nginx 没配 `try_files`），
只有前端内部跳转才能渲染 —— 搜索引擎目前只收录了首页。
nginx 加一行 `try_files $uri $uri/ /index.html` 即可，这是本次改版优先级最高的止血点。

## 线上现状的一个关键事实

原站 `onlystyle.com.cn` 的**子路由直连全部 404**（nginx 没配 `try_files`），
只有前端内部跳转才能渲染 —— 搜索引擎目前只收录了首页。
nginx 加一行 `try_files $uri $uri/ /index.html` 即可，这是本次改版优先级最高的止血点。
