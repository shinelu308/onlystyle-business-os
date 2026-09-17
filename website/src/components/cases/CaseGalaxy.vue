<script setup>
/**
 * 案例星系 —— /cases 页的 3D 星球宇宙
 *
 * 原型：设计稿「ONLYSTYLE 案例星系 v4 — 图片贴图版」（用户提供）
 * 移植目标：**效果一个不少** + **数据全部来自内容中台**
 *
 * ── 与原型的差异（都是有意的）────────────────────────────────
 * ① 全屏 fixed 舞台：原型是「整个页面」，这里是页面里的一块，导航/页脚照常（由路由 meta 决定）
 * ② 星球不再写死 3 颗：由后台案例数据驱动，**新增一条案例 = 多一颗星球**
 * ③ 行业轨道不再写死 3 条：按后台「分类」去重生成，几个分类几条轨道
 * ④ 贴图本地化：原型走 a.lovart.ai 外链，这里走 /media/galaxy/*.webp
 * ⑤ 详情面板内容做 HTML 转义：原型数据是写死的，这里来自后台，不转义就是 XSS
 * ⑥ 没有内置贴图的行业 → 程序化生成一颗行星（保证任何新分类都有星球，不会开天窗）
 *
 * ── 一句话解释渲染管线 ──────────────────────────────────────
 * 四元数相机（qMul/qFromAxis/qRotVec）→ 世界坐标投影（project）→ 按 z 排序 →
 * 依次 drawImage + 径向渐变。零逐像素运算，所以能一直跑 60fps。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  /** 案例列表（来自 useContent('cases')）。组件本身不取数，方便测试与复用 */
  cases: { type: Array, default: () => [] },
})

/* ══════════════════════════════════════════════════════════════
   常量 —— 原型的值原样保留
   ══════════════════════════════════════════════════════════════ */

const FOV = (60 * Math.PI) / 180
const NEAR = 10
const INIT_TILT = (25 * Math.PI) / 180
const AUTO_ROT = 0.002
const CAM_Z0 = 700
const CAM_Z_MIN = 250
const CAM_Z_MAX = 1400
const CLICK_DIST = 6
const CLICK_MS = 400

/** 内置贴图（构建脚本 design/site-audit/build-galaxy-textures.cjs 产出） */
const KNOWN_TEXTURES = {
  estate: '/media/galaxy/tex-estate.webp',
  medical: '/media/galaxy/tex-medical.webp',
  culture: '/media/galaxy/tex-culture.webp',
}
const CORE_LOGO = '/media/galaxy/core-logo.webp'
const SPACE_BG = '/media/galaxy/space-bg.webp'

/**
 * 行业调色板。**前 3 项与原型逐值一致**（#1F5BFF/#3BE0FF/#F59E0B，200/260/320，-38/5/40 度，
 * 初相期 0.25π/1.0π/1.75π），所以后台只有前 3 个分类时画面与原型完全相同。
 *
 * 第 4~6 项不是手调出来的，是 `design/site-audit/solve-galaxy-layout.cjs` 数值求解的结果。
 * 目标 =「相机绕 Y 轴转一整圈的过程中，最近两颗星球在最坏情况下的屏幕间距」最大化，
 * 并附带约束「位于核心徽标后面的星球与徽标本体的净空」。
 * 解出来是 tilt = -15° / 20° / -25°、start = 0.625π / 1.375π / 1.5625π，
 * 整体最坏间距仍为 **21.0 px —— 与只有设计稿那 3 条轨道时完全相同**，即新增轨道没让画面变差。
 *   （21.0 px 是设计稿自身第 2/3 条轨道的固有上限：自转 75° 时它们最近。这是原型就有的性质，
 *     不是我引入的缺陷，所以也不该为了新轨道去牺牲前 3 条的原值。）
 * ⭐ 白捡的好处：这 6 条轨道的倾角全部落在设计稿自己的包络 [-38°, +40°] 内，
 *    没有一条比设计稿本身更陡。
 * ⚠️ 求解器里真正拍板的是「平局裁决」而不是主目标：主目标有天花板（21.0 px），
 *    绝大多数候选会并列打到同一个成绩，不加裁决就会留下任意解。
 *
 * ⚠️ 也**不能**沿用「初相期继续 0.75π 等差」这个直觉做法：
 *    0.25 → 1.0 → 1.75 → 2.5 → 3.25 → 4.0，后三个 mod 2π 之后是 0.5π / 1.25π / 0.0π，
 *    与已用区间（0.25π / 1.0π / 1.75π）几乎重合 —— 新分类的星球会一上来就停在核心恒星背后被挡住。
 *    `start` 必须按「与已有初相期的离散度」重新求解，不能等差顺延。
 */
const PALETTE = [
  { color: '#1F5BFF', rgb: [31, 91, 255], orbit: 200, tilt: -38, start: 0.25 },
  { color: '#3BE0FF', rgb: [59, 224, 255], orbit: 260, tilt: 5, start: 1.0 },
  { color: '#F59E0B', rgb: [245, 158, 11], orbit: 320, tilt: 40, start: 1.75 },
  { color: '#A855F7', rgb: [168, 85, 247], orbit: 380, tilt: -15, start: 0.625 },
  { color: '#34D399', rgb: [52, 211, 153], orbit: 440, tilt: 20, start: 1.375 },
  { color: '#FB7185', rgb: [251, 113, 133], orbit: 500, tilt: -25, start: 1.5625 },
]

/** 行业徽章配色（原型 BADGE_STYLE 的泛化版：按调色板明暗算出来） */
function badgeStyle(rgb) {
  const [r, g, b] = rgb
  return {
    background: `rgba(${r},${g},${b},.14)`,
    color: `rgb(${Math.min(255, r + 90)},${Math.min(255, g + 90)},${Math.min(255, b + 90)})`,
    border: `1px solid rgba(${r},${g},${b},.30)`,
  }
}

/* ══════════════════════════════════════════════════════════════
   工具
   ══════════════════════════════════════════════════════════════ */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

const hexRgb = (h) => {
  const s = String(h || '').replace('#', '')
  if (s.length !== 6) return [31, 91, 255]
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

/* ── 四元数 ── */
const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
]
const qFromAxis = (ax, ay, az, angle) => {
  const s = Math.sin(angle / 2)
  return [Math.cos(angle / 2), ax * s, ay * s, az * s]
}
const qRotVec = (q, v) => {
  const [qw, qx, qy, qz] = q
  const [vx, vy, vz] = v
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ]
}

/* ══════════════════════════════════════════════════════════════
   程序化行星贴图 —— 没有内置贴图的行业用它，保证「新分类也一定有星球」
   ══════════════════════════════════════════════════════════════ */
function makeProceduralTexture(rgb, seed) {
  const N = 256
  const c = document.createElement('canvas')
  c.width = c.height = N
  const x = c.getContext('2d')
  x.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
  x.fillRect(0, 0, N, N)

  // 线性同余伪随机：**必须确定性**，否则每次重建贴图都不一样（视觉上会「闪」）
  let s = (seed >>> 0) || 1
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296

  // 波浪带状「云层/大陆」：20 条正弦带，明暗交替
  for (let i = 0; i < 24; i++) {
    const y0 = rnd() * N
    const h = 6 + rnd() * 34
    const a = 0.05 + rnd() * 0.15
    const l = rnd() < 0.5 ? 255 : 0
    const amp = 5 + rnd() * 20
    const ph = rnd() * 6.283
    const fr = 1 + rnd() * 3
    x.fillStyle = `rgba(${l},${l},${l},${a.toFixed(3)})`
    x.beginPath()
    for (let px = 0; px <= N; px += 8) x.lineTo(px, y0 + Math.sin((px / N) * fr * 6.283 + ph) * amp)
    for (let px = N; px >= 0; px -= 8) x.lineTo(px, y0 + h + Math.sin((px / N) * fr * 6.283 + ph) * amp)
    x.closePath()
    x.fill()
  }
  // 细碎高光点，避免带状图案过于「塑料」
  for (let i = 0; i < 160; i++) {
    x.fillStyle = `rgba(255,255,255,${(0.03 + rnd() * 0.09).toFixed(3)})`
    x.beginPath()
    x.arc(rnd() * N, rnd() * N, 0.6 + rnd() * 2.2, 0, 6.283)
    x.fill()
  }
  return c
}

/* ══════════════════════════════════════════════════════════════
   状态
   ══════════════════════════════════════════════════════════════ */

const rootEl = ref(null)
const canvasEl = ref(null)

const loading = ref(true)
const activeFilter = ref('all')
const panelOpen = ref(false)
const panel = ref({ key: '', label: '', name: '', title: '', desc: '', results: [], rgb: [31, 91, 255], color: '#1F5BFF' })
const tip = ref({ on: false, x: 0, y: 0, name: '', sub: '' })

/** 行业表：由案例数据去重生成。几号分类就几条轨道 —— 后台加分类，这里自动多一圈 */
const industries = computed(() => {
  const seen = new Map()
  for (const c of props.cases) {
    const key = c.industry || 'cat-other'
    if (!seen.has(key)) {
      const i = seen.size
      const p = PALETTE[i % PALETTE.length]
      seen.set(key, {
        key,
        label: c.industryLabel || c.category || '其他',
        color: p.color,
        rgb: p.rgb,
        orbit: p.orbit,
        tilt: p.tilt,
        start: p.start,
      })
    }
  }
  return [...seen.values()]
})

const filterTabs = computed(() => [{ key: 'all', label: '全部' }, ...industries.value])

/** 列表里是否真有这些案例（空数据时给个提示，别让用户对着一片黑） */
const hasCases = computed(() => props.cases.length > 0)

/* ── 渲染态（非响应式，纯 canvas 内部状态，避免 Vue 代理拖慢每帧） ── */
let ctx = null
let W = 0
let H = 0
let dpr = 1

let camQ = qFromAxis(1, 0, 0, INIT_TILT)
let camZ = CAM_Z0
let autoRot = true
let star = { r: 38, angle: 0 }
let planets = []
let orbits = []
let bgStars = []
let hoveredPlanet = null
let selectedPlanet = null
let flyAnim = null

const IMGS = {}
let ready = false
let rafId = 0
let alive = false
const timers = []
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t }

const project = (x, y, z) => {
  const dz = camZ - z
  if (dz <= NEAR) return null
  const f = W / 2 / Math.tan(FOV / 2)
  return { x: (x * f) / dz + W / 2, y: (-y * f) / dz + H / 2, scale: f / dz, z }
}

/* ══════════════════════════════════════════════════════════════
   贴图加载
   ══════════════════════════════════════════════════════════════ */

/** 一个案例该用哪张贴图：显式地址 > 显式键 > 行业内置贴图 > 空（走程序化） */
function textureUrlFor(c, ind) {
  const t = String(c.textureKey || '').trim()
  if (t && /^(https?:)?\//.test(t)) return t
  if (t && KNOWN_TEXTURES[t]) return KNOWN_TEXTURES[t]
  return KNOWN_TEXTURES[ind && ind.key] || ''
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null) // 单张失败不阻断整页，drawSprite 会跳过
    img.src = url
  })
}

async function loadTextures() {
  const urls = new Set([CORE_LOGO, SPACE_BG])
  for (const c of props.cases) {
    const ind = industries.value.find((i) => i.key === (c.industry || 'cat-other'))
    const u = textureUrlFor(c, ind)
    if (u) urls.add(u)
  }
  await Promise.all(
    [...urls].map(async (u) => {
      const img = await loadImage(u)
      if (img) IMGS[u] = img
    })
  )
  // 没有内置贴图的行业 → 程序化行星
  for (const ind of industries.value) {
    if (!KNOWN_TEXTURES[ind.key]) IMGS['gen:' + ind.key] = makeProceduralTexture(ind.rgb, hashKey(ind.key))
  }
}

function hashKey(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

/* ══════════════════════════════════════════════════════════════
   场景构建 —— 完全数据驱动
   ══════════════════════════════════════════════════════════════ */

/**
 * 详情面板的「关键成果」。
 * 与后端 routes/content.js 的 resultsOf() **逐字同规则**：优先用显式的 results，
 * 没填就从结构化 metrics 派生（「45% 销售额增长」）。
 * 后端已经派生过一次；这里再派生是为了让「接口没通、用兜底数据」时画面一致。
 */
function resultsOf(c) {
  if (Array.isArray(c.results) && c.results.length) return c.results.map(String)
  return (Array.isArray(c.metrics) ? c.metrics : [])
    .map((m) => [m && m.value, m && m.label].filter(Boolean).join(' '))
    .filter(Boolean)
}

function buildScene() {
  const list = props.cases
  star = { r: 38, angle: 0 }

  planets = []
  const indCnt = {}
  for (const c of list) {
    const indKey = c.industry || 'cat-other'
    const ind = industries.value.find((i) => i.key === indKey) || industries.value[0] || {
      key: indKey, label: c.industryLabel || '其他', color: PALETTE[0].color, rgb: PALETTE[0].rgb,
      orbit: PALETTE[0].orbit, tilt: PALETTE[0].tilt, start: PALETTE[0].start,
    }
    const cnt = indCnt[indKey] || 0
    indCnt[indKey] = cnt + 1
    const total = list.filter((x) => (x.industry || 'cat-other') === indKey).length

    // 同行业的案例均匀铺在这条轨道上：第 1 个从 start 出发，后面的按 2π/total 递进
    const baseA = ind.start * Math.PI + (cnt / Math.max(total, 1)) * Math.PI * 2
    const orbitR = Number(c.orbitRadius) > 0 ? Number(c.orbitRadius) : ind.orbit
    const tilt = (ind.tilt * Math.PI) / 180
    const color = c.color || ind.color

    const url = textureUrlFor(c, ind)
    const texKey = url || 'gen:' + indKey

    planets.push({
      raw: c,
      id: c.id != null ? c.id : c.slug,
      slug: c.slug,
      name: c.client || c.title || '',
      title: c.subtitle || c.product || c.title || '',
      desc: c.summary || '',
      results: resultsOf(c),
      industry: indKey,
      ind,
      color,
      rgb: hexRgb(color),
      texKey,
      wx: 0, wy: 0, wz: 0,
      orbitR,
      tilt,
      baseAngle: baseA,
      orbitAngle: baseA,
      orbitSpeed: 0.00025 + Math.random() * 0.00015,
      selfAngle: Math.random() * Math.PI * 2,
      selfSpeed: 0.0015 + Math.random() * 0.001,
      r: Number(c.size) > 0 ? Number(c.size) : 26,
      pulseT: 0,
      _sx: 0, _sy: 0, _sr: 0,
    })
  }

  orbits = industries.value.map((ind) => ({ k: ind.key, ind, tilt: (ind.tilt * Math.PI) / 180, r: ind.orbit }))

  bgStars = []
  for (let i = 0; i < 80; i++) {
    bgStars.push({
      x: (Math.random() - 0.5) * 2600,
      y: (Math.random() - 0.5) * 2600,
      z: -200 - Math.random() * 900,
      r: 0.4 + Math.random() * 1.6,
      a: 0.15 + Math.random() * 0.65,
      tw: Math.random() * Math.PI * 2,
      tws: 0.015 + Math.random() * 0.03,
    })
  }
}

/* ══════════════════════════════════════════════════════════════
   绘制辅助 —— 全是 drawImage / 渐变，零逐像素运算
   ══════════════════════════════════════════════════════════════ */

function drawSprite(cx, cy, r, imgKey, angle, alpha) {
  const img = IMGS[imgKey]
  if (!img) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.clip()
  const d = r * 2
  ctx.drawImage(img, -r, -r, d, d)
  ctx.restore()
}

function drawAtmosphere(cx, cy, r, rgb, glowMult, alpha) {
  const [rr, rg, rb] = rgb
  const atmR = r * (1.45 + 0.22 * glowMult)
  const litOx = 0.55 * r * 0.18
  const litOy = -0.75 * r * 0.18
  const g = ctx.createRadialGradient(cx + litOx, cy + litOy, r * 0.78, cx, cy, atmR)
  g.addColorStop(0, `rgba(${rr},${rg},${rb},${0.32 * glowMult * alpha})`)
  g.addColorStop(0.5, `rgba(${rr},${rg},${rb},${0.1 * glowMult * alpha})`)
  g.addColorStop(1, `rgba(${rr},${rg},${rb},0)`)
  ctx.beginPath()
  ctx.arc(cx, cy, atmR, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
}

function drawRimLight(cx, cy, r, rgb, alpha) {
  const [rr, rg, rb] = rgb
  const g = ctx.createRadialGradient(cx, cy, r * 0.68, cx, cy, r * 1.06)
  g.addColorStop(0, `rgba(${rr},${rg},${rb},0)`)
  g.addColorStop(0.7, `rgba(${rr},${rg},${rb},${0.05 * alpha})`)
  g.addColorStop(1, `rgba(${rr},${rg},${rb},${0.3 * alpha})`)
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.06, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
}

function drawSpecular(cx, cy, r, alpha) {
  const spX = cx - r * 0.3
  const spY = cy - r * 0.3
  const g = ctx.createRadialGradient(spX, spY, 0, spX, spY, r * 0.46)
  g.addColorStop(0, `rgba(255,255,255,${0.55 * alpha})`)
  g.addColorStop(0.4, `rgba(255,255,255,${0.15 * alpha})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.restore()
}

function drawShadow(cx, cy, r, alpha) {
  const g = ctx.createRadialGradient(cx + r * 0.35, cy + r * 0.2, 0, cx + r * 0.35, cy + r * 0.2, r * 1.1)
  g.addColorStop(0, `rgba(0,0,0,${0.55 * alpha})`)
  g.addColorStop(0.5, `rgba(0,0,0,${0.25 * alpha})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.restore()
}

function drawSelectedRing(cx, cy, r, rgb, color) {
  const [rr, rg, rb] = rgb
  ctx.beginPath()
  ctx.arc(cx, cy, r + 9, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(${rr},${rg},${rb},.75)`
  ctx.lineWidth = 2
  ctx.setLineDash([5, 5])
  ctx.shadowColor = color
  ctx.shadowBlur = 14
  ctx.stroke()
  ctx.setLineDash([])
  ctx.shadowBlur = 0
}

function drawPulse(cx, cy, r, rgb, pulseT) {
  if (pulseT <= 0) return
  const [rr, rg, rb] = rgb
  const pr = r * (1 + (1 - pulseT) * 0.9)
  ctx.beginPath()
  ctx.arc(cx, cy, pr, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(${rr},${rg},${rb},${pulseT * 0.65})`
  ctx.lineWidth = 2.5
  ctx.stroke()
}

/** 星系核心：ONLYSTYLE 徽标 + 光晕 + 3 圈虚线 + 轨道粒子（原型 6 层，逐层保留） */
function drawStar(cx, cy, r, angle) {
  const breathe = 1.0 + 0.06 * Math.sin(angle * 1.8)
  const floatY = Math.sin(angle * 0.9) * r * 0.04
  const lx = cx
  const ly = cy + floatY

  const auraR = r * 4.8
  const auraG = ctx.createRadialGradient(lx, ly, r * 0.5, lx, ly, auraR)
  auraG.addColorStop(0, 'rgba(59,224,255,0.18)')
  auraG.addColorStop(0.2, 'rgba(31,91,255,0.12)')
  auraG.addColorStop(0.55, 'rgba(31,91,255,0.04)')
  auraG.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  ctx.arc(lx, ly, auraR, 0, Math.PI * 2)
  ctx.fillStyle = auraG
  ctx.fill()

  const ringDefs = [
    { rMult: 2.2, speed: 0.55, dir: 1, lw: 1.8, alpha: 0.45, dash: [8, 7] },
    { rMult: 1.68, speed: 0.85, dir: -1, lw: 1.2, alpha: 0.3, dash: [5, 9] },
    { rMult: 1.28, speed: 1.3, dir: 1, lw: 1.0, alpha: 0.22, dash: [3, 11] },
  ]
  ringDefs.forEach((rd) => {
    const rr = r * rd.rMult
    ctx.save()
    ctx.translate(lx, ly)
    ctx.rotate(angle * rd.speed * rd.dir)
    ctx.beginPath()
    ctx.arc(0, 0, rr, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(59,224,255,${rd.alpha})`
    ctx.lineWidth = rd.lw
    ctx.setLineDash(rd.dash)
    ctx.shadowColor = '#3BE0FF'
    ctx.shadowBlur = 6
    ctx.stroke()
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.restore()
  })

  const particleDefs = [
    { rMult: 2.2, count: 8, speed: 0.55, dir: 1, size: 2.8, color: 'rgba(59,224,255,0.90)' },
    { rMult: 1.68, count: 6, speed: 0.85, dir: -1, size: 2.2, color: 'rgba(180,220,255,0.80)' },
    { rMult: 1.28, count: 5, speed: 1.3, dir: 1, size: 1.8, color: 'rgba(59,224,255,0.70)' },
  ]
  particleDefs.forEach((pd) => {
    const pr = r * pd.rMult
    for (let i = 0; i < pd.count; i++) {
      const a = (i / pd.count) * Math.PI * 2 + angle * pd.speed * pd.dir
      ctx.beginPath()
      ctx.arc(lx + Math.cos(a) * pr, ly + Math.sin(a) * pr, pd.size, 0, Math.PI * 2)
      ctx.fillStyle = pd.color
      ctx.shadowColor = '#3BE0FF'
      ctx.shadowBlur = 10
      ctx.fill()
      ctx.shadowBlur = 0
    }
  })

  const innerGlowR = r * breathe * 1.15
  const igG = ctx.createRadialGradient(lx, ly, 0, lx, ly, innerGlowR)
  igG.addColorStop(0, 'rgba(59,224,255,0.22)')
  igG.addColorStop(0.5, 'rgba(31,91,255,0.12)')
  igG.addColorStop(1, 'rgba(31,91,255,0)')
  ctx.beginPath()
  ctx.arc(lx, ly, innerGlowR, 0, Math.PI * 2)
  ctx.fillStyle = igG
  ctx.fill()

  const logoImg = IMGS[CORE_LOGO]
  if (logoImg) {
    const logoR = r * breathe
    ctx.drawImage(logoImg, lx - logoR, ly - logoR, logoR * 2, logoR * 2)
  }

  const edgeG = ctx.createRadialGradient(lx, ly, r * breathe * 0.75, lx, ly, r * breathe * 1.1)
  edgeG.addColorStop(0, 'rgba(59,224,255,0)')
  edgeG.addColorStop(0.6, 'rgba(59,224,255,0.08)')
  edgeG.addColorStop(1, 'rgba(59,224,255,0.22)')
  ctx.beginPath()
  ctx.arc(lx, ly, r * breathe * 1.1, 0, Math.PI * 2)
  ctx.fillStyle = edgeG
  ctx.fill()
}

function drawOrbitRing(orbitR, tilt, rgb, alpha) {
  const segs = 72
  ctx.beginPath()
  let started = false
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const wx = Math.cos(a) * orbitR
    const wy = Math.sin(a) * orbitR * Math.cos(tilt)
    const wz = Math.sin(a) * orbitR * Math.sin(tilt)
    const p = project(...qRotVec(camQ, [wx, wy, wz]))
    if (!p) continue
    if (!started) { ctx.moveTo(p.x, p.y); started = true } else ctx.lineTo(p.x, p.y)
  }
  ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
  ctx.lineWidth = 0.8
  ctx.stroke()
}

/* ══════════════════════════════════════════════════════════════
   主循环
   ══════════════════════════════════════════════════════════════ */

function draw() {
  if (!alive) return
  ctx.clearRect(0, 0, W, H)

  if (autoRot) camQ = qMul(qFromAxis(0, 1, 0, AUTO_ROT), camQ)

  for (const p of planets) {
    p.orbitAngle += p.orbitSpeed
    p.selfAngle += p.selfSpeed
    p.wx = Math.cos(p.orbitAngle) * p.orbitR
    p.wy = Math.sin(p.orbitAngle) * p.orbitR * Math.cos(p.tilt)
    p.wz = Math.sin(p.orbitAngle) * p.orbitR * Math.sin(p.tilt)
    if (p.pulseT > 0) p.pulseT = Math.max(0, p.pulseT - 0.035)
  }
  star.angle += 0.004
  for (const s of bgStars) s.tw += s.tws

  for (const s of bgStars) {
    const p = project(...qRotVec(camQ, [s.x, s.y, s.z]))
    if (!p) continue
    const ta = s.a * (0.7 + 0.3 * Math.sin(s.tw))
    ctx.beginPath()
    ctx.arc(p.x, p.y, s.r * Math.min(1, p.scale * 200), 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${ta})`
    ctx.fill()
  }

  for (const o of orbits) {
    const active = activeFilter.value === 'all' || activeFilter.value === o.k
    drawOrbitRing(o.r, o.tilt, o.ind.rgb, active ? 0.16 : 0.04)
  }

  // 收集 + 按 z 排序 —— 远的先画，近的盖住远的
  const list = []
  // 标签先攒起来，等所有星球体画完再统一画。
  // 原型是「每颗星球画完顺手写自己的标签」，于是靠后的星球会把靠前星球的标签压掉 ——
  // 星球一多就出现「名字被别人的球盖住一半」。攒到最后画，标签永远在最上层。
  const labels = []
  const sp = project(...qRotVec(camQ, [0, 0, 0]))
  if (sp) list.push({ type: 'star', p: sp })
  for (const pl of planets) {
    const p = project(...qRotVec(camQ, [pl.wx, pl.wy, pl.wz]))
    if (!p) continue
    list.push({ type: 'planet', p, pl })
  }
  list.sort((a, b) => a.p.z - b.p.z)

  for (const obj of list) {
    if (obj.type === 'star') {
      const sr = star.r * obj.p.scale * 200
      drawStar(obj.p.x, obj.p.y, Math.max(18, Math.min(55, sr)), star.angle)
      continue
    }
    const pl = obj.pl
    const active = activeFilter.value === 'all' || activeFilter.value === pl.industry
    const isHov = hoveredPlanet && hoveredPlanet.id === pl.id
    const isSel = selectedPlanet && selectedPlanet.id === pl.id
    const displayR = Math.max(8, Math.min(44, pl.r * obj.p.scale * 200))
    const scaledR = displayR * (isHov || isSel ? 1.14 : 1)
    const alpha = active ? 1 : 0.15
    const glow = isHov || isSel ? 2.2 : 1

    if (sp && active) {
      const [rr, rg, rb] = pl.rgb
      ctx.beginPath()
      ctx.moveTo(sp.x, sp.y)
      ctx.lineTo(obj.p.x, obj.p.y)
      ctx.strokeStyle = `rgba(${rr},${rg},${rb},${isHov || isSel ? 0.28 : 0.07})`
      ctx.lineWidth = isHov || isSel ? 1.5 : 0.5
      ctx.stroke()
    }

    drawAtmosphere(obj.p.x, obj.p.y, scaledR, pl.rgb, glow, alpha)
    drawSprite(obj.p.x, obj.p.y, scaledR, pl.texKey, pl.selfAngle, alpha)
    drawShadow(obj.p.x, obj.p.y, scaledR, alpha)
    drawRimLight(obj.p.x, obj.p.y, scaledR, pl.rgb, alpha)
    drawSpecular(obj.p.x, obj.p.y, scaledR, alpha)
    if (isSel) drawSelectedRing(obj.p.x, obj.p.y, scaledR, pl.rgb, pl.color)
    if (pl.pulseT > 0) drawPulse(obj.p.x, obj.p.y, scaledR, pl.rgb, pl.pulseT)

    if (active && displayR > 10) {
      labels.push({
        x: obj.p.x,
        y: obj.p.y + scaledR + 16,
        px: Math.max(10, Math.min(13, displayR * 0.55)),
        name: pl.name,
        color: pl.color,
        strong: !!(isHov || isSel),
      })
    }

    pl._sx = obj.p.x
    pl._sy = obj.p.y
    pl._sr = scaledR
  }

  // ── 最后统一画标签（永远压在星球体之上） ──
  for (const L of labels) {
    ctx.font = `500 ${L.px}px "Inter","PingFang SC",sans-serif`
    ctx.fillStyle = `rgba(255,255,255,${L.strong ? 0.95 : 0.6})`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = L.color
    ctx.shadowBlur = L.strong ? 8 : 0
    ctx.fillText(L.name, L.x, L.y)
    ctx.shadowBlur = 0
  }

  if (flyAnim) {
    flyAnim.t += 1 / 60
    if (flyAnim.t >= 1) {
      camZ = flyAnim.toZ
      flyAnim = null
    } else {
      const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
      camZ = flyAnim.fromZ + (flyAnim.toZ - flyAnim.fromZ) * e(flyAnim.t)
    }
  }

  rafId = requestAnimationFrame(draw)
}

/* ══════════════════════════════════════════════════════════════
   命中测试 / 提示 / 面板
   ══════════════════════════════════════════════════════════════ */

function hitTest(mx, my) {
  let best = null
  let bestD = Infinity
  for (const pl of planets) {
    if (!pl._sr) continue
    const dx = mx - pl._sx
    const dy = my - pl._sy
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < pl._sr * 1.4 && d < bestD) { bestD = d; best = pl }
  }
  return best
}

function showTip(pl, mx, my) {
  const t = tip.value
  t.name = pl.name
  t.sub = `${pl.ind.label} · ${pl.title}`
  t.on = true
  // 先让 DOM 量到尺寸再摆位（面板宽 180 上限，这里用估算避免强制同步布局抖动）
  const tw = 200
  const th = 60
  let tx = mx + 16
  let ty = my - th / 2
  if (tx + tw > W - 20) tx = mx - tw - 16
  if (ty < 10) ty = 10
  if (ty + th > H - 10) ty = H - th - 10
  t.x = tx
  t.y = ty
}
const hideTip = () => { tip.value.on = false }

function openPanel(pl) {
  selectedPlanet = pl
  pl.pulseT = 1
  panel.value = {
    key: pl.id,
    label: pl.ind.label,
    name: pl.name,
    title: pl.title,
    desc: pl.desc,
    results: pl.results,
    rgb: pl.rgb,
    color: pl.color,
  }
  panelOpen.value = true
  flyAnim = { fromZ: camZ, toZ: Math.max(320, camZ * 0.68), t: 0 }
  autoRot = false
}

function closePanel() {
  panelOpen.value = false
  selectedPlanet = null
  flyAnim = { fromZ: camZ, toZ: CAM_Z0, t: 0 }
  later(() => { autoRot = true }, 900)
}

const togglePlanet = (pl) => {
  if (selectedPlanet && selectedPlanet.id === pl.id) closePanel()
  else openPanel(pl)
}

/* ══════════════════════════════════════════════════════════════
   鼠标 / 触摸
   ══════════════════════════════════════════════════════════════ */

let isDrag = false
let mdX = 0, mdY = 0, mdT = 0, dragX = 0, dragY = 0

function onMouseDown(e) {
  mdX = dragX = e.clientX
  mdY = dragY = e.clientY
  mdT = Date.now()
  isDrag = false
  autoRot = false
}

function onMouseMove(e) {
  const dx = e.clientX - mdX
  const dy = e.clientY - mdY
  if (e.buttons === 1) {
    if (Math.sqrt(dx * dx + dy * dy) > CLICK_DIST) {
      isDrag = true
      if (canvasEl.value) canvasEl.value.classList.add('drag')
    }
    if (isDrag) {
      const ddx = e.clientX - dragX
      const ddy = e.clientY - dragY
      dragX = e.clientX
      dragY = e.clientY
      camQ = qMul(qMul(qFromAxis(0, 1, 0, ddx * 0.007), qFromAxis(1, 0, 0, ddy * 0.007)), camQ)
      hideTip()
      return
    }
  }
  const pl = hitTest(e.clientX, e.clientY)
  if (pl) {
    hoveredPlanet = pl
    if (canvasEl.value) canvasEl.value.style.cursor = 'pointer'
    showTip(pl, e.clientX, e.clientY)
  } else {
    hoveredPlanet = null
    if (canvasEl.value) canvasEl.value.style.cursor = 'grab'
    hideTip()
  }
}

function onMouseUp(e) {
  if (canvasEl.value) {
    canvasEl.value.classList.remove('drag')
    canvasEl.value.style.cursor = 'grab'
  }
  const moved = Math.sqrt((e.clientX - mdX) ** 2 + (e.clientY - mdY) ** 2)
  const elapsed = Date.now() - mdT
  if (moved < CLICK_DIST && elapsed < CLICK_MS) {
    const pl = hitTest(e.clientX, e.clientY)
    if (pl) togglePlanet(pl)
    else closePanel()
  } else {
    later(() => { if (!selectedPlanet) autoRot = true }, 1500)
  }
  isDrag = false
}

function onMouseLeave() {
  isDrag = false
  if (canvasEl.value) canvasEl.value.classList.remove('drag')
  hoveredPlanet = null
  hideTip()
  if (!selectedPlanet) later(() => { autoRot = true }, 2000)
}

function onWheel(e) {
  e.preventDefault()
  camZ = Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, camZ * (e.deltaY < 0 ? 0.88 : 1.14)))
}

let tdX = 0, tdY = 0, tdT = 0, pinchD0 = 0, camZ0 = CAM_Z0

function onTouchStart(e) {
  e.preventDefault()
  if (e.touches.length === 1) {
    const t = e.touches[0]
    tdX = dragX = t.clientX
    tdY = dragY = t.clientY
    tdT = Date.now()
    isDrag = false
    autoRot = false
  } else if (e.touches.length === 2) {
    isDrag = false
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    pinchD0 = Math.sqrt(dx * dx + dy * dy)
    camZ0 = camZ
  }
}

function onTouchMove(e) {
  e.preventDefault()
  if (e.touches.length === 1) {
    const t = e.touches[0]
    if (Math.sqrt((t.clientX - tdX) ** 2 + (t.clientY - tdY) ** 2) > CLICK_DIST) isDrag = true
    if (isDrag) {
      const ddx = t.clientX - dragX
      const ddy = t.clientY - dragY
      dragX = t.clientX
      dragY = t.clientY
      camQ = qMul(qMul(qFromAxis(0, 1, 0, ddx * 0.007), qFromAxis(1, 0, 0, ddy * 0.007)), camQ)
    }
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    camZ = Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, camZ0 * (pinchD0 / Math.sqrt(dx * dx + dy * dy))))
  }
}

function onTouchEnd(e) {
  e.preventDefault()
  if (e.changedTouches.length === 1) {
    const t = e.changedTouches[0]
    const moved = Math.sqrt((t.clientX - tdX) ** 2 + (t.clientY - tdY) ** 2)
    if (moved < CLICK_DIST && Date.now() - tdT < CLICK_MS) {
      const pl = hitTest(t.clientX, t.clientY)
      if (pl) togglePlanet(pl)
      else closePanel()
    }
  }
  isDrag = false
  if (e.touches.length === 0 && !selectedPlanet) later(() => { autoRot = true }, 1200)
}

/* ── 控件 ── */
const zoomIn = () => { camZ = Math.max(CAM_Z_MIN, camZ * 0.82) }
const zoomOut = () => { camZ = Math.min(CAM_Z_MAX, camZ * 1.22) }
function resetView() {
  camQ = qFromAxis(1, 0, 0, INIT_TILT)
  camZ = CAM_Z0
  flyAnim = null
  closePanel()
  autoRot = true
}
function pickFilter(k) {
  activeFilter.value = k
  if (selectedPlanet) {
    const still = k === 'all' || selectedPlanet.industry === k
    if (!still) closePanel()
  }
}

/* ══════════════════════════════════════════════════════════════
   尺寸 / 生命周期
   ══════════════════════════════════════════════════════════════ */

function resize() {
  const el = rootEl.value
  const cv = canvasEl.value
  if (!el || !cv) return
  dpr = window.devicePixelRatio || 1
  W = el.clientWidth || window.innerWidth
  H = el.clientHeight || window.innerHeight
  cv.width = Math.round(W * dpr)
  cv.height = Math.round(H * dpr)
  cv.style.width = W + 'px'
  cv.style.height = H + 'px'
  ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

async function boot() {
  ready = false
  loading.value = true
  resize()
  await nextTick()
  resize()
  await loadTextures()
  buildScene()
  loading.value = false
  ready = true
  if (!alive) {
    alive = true
    rafId = requestAnimationFrame(draw)
  }
}

onMounted(async () => {
  // 尊重系统「减少动态效果」：默认不自转，但按钮/拖拽照常可用
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) autoRot = false
  } catch { /* 老浏览器没有 matchMedia，忽略 */ }

  const cv = canvasEl.value
  cv.addEventListener('mousedown', onMouseDown)
  cv.addEventListener('mousemove', onMouseMove)
  cv.addEventListener('mouseup', onMouseUp)
  cv.addEventListener('mouseleave', onMouseLeave)
  cv.addEventListener('wheel', onWheel, { passive: false })
  cv.addEventListener('touchstart', onTouchStart, { passive: false })
  cv.addEventListener('touchmove', onTouchMove, { passive: false })
  cv.addEventListener('touchend', onTouchEnd, { passive: false })
  window.addEventListener('resize', resize)

  /**
   * 验收用的**只读**探针。
   *
   * 为什么要有它：canvas 对 DOM 是黑盒 —— 星球数量、相机姿态、筛选生效与否
   * 全在闭包里，从外面一个都看不到。没有探针，「效果有没有丢」就只剩肉眼看，
   * 而这个项目反复栽在「凭眼看下结论」上（见 .workbuddy/memory/MEMORY.md：
   * 「能量化的 UI 判断一律写成断言」）。
   *
   * 它只暴露读操作，只在组件挂载期间存在，卸载即删除；生产环境同样是只读快照。
   */
  window.__caseGalaxy = {
    snapshot: () => ({
      camZ,
      camQ: camQ.slice(),
      autoRot,
      activeFilter: activeFilter.value,
      panelOpen: panelOpen.value,
      selected: selectedPlanet ? selectedPlanet.id : null,
      W, H, dpr,
      ready,
      industries: industries.value.map((i) => ({
        key: i.key, label: i.label, color: i.color, orbit: i.orbit, tilt: i.tilt,
      })),
      planets: planets.map((p) => ({
        id: p.id, name: p.name, title: p.title, industry: p.industry,
        color: p.color, texKey: p.texKey, results: p.results,
        sx: p._sx, sy: p._sy, sr: p._sr,
        alpha: activeFilter.value === 'all' || activeFilter.value === p.industry ? 1 : 0.15,
      })),
    }),
    /** 命中测试（只读）：验收脚本据此确认「点下去到底会选中哪颗」 */
    hitTest: (x, y) => {
      const p = hitTest(x, y)
      return p ? { id: p.id, name: p.name, sr: p._sr } : null
    },
  }

  await boot()
})

onBeforeUnmount(() => {
  alive = false
  cancelAnimationFrame(rafId)
  timers.forEach(clearTimeout)
  timers.length = 0
  try { delete window.__caseGalaxy } catch { window.__caseGalaxy = undefined }
  const cv = canvasEl.value
  if (cv) {
    cv.removeEventListener('mousedown', onMouseDown)
    cv.removeEventListener('mousemove', onMouseMove)
    cv.removeEventListener('mouseup', onMouseUp)
    cv.removeEventListener('mouseleave', onMouseLeave)
    cv.removeEventListener('wheel', onWheel)
    cv.removeEventListener('touchstart', onTouchStart)
    cv.removeEventListener('touchmove', onTouchMove)
    cv.removeEventListener('touchend', onTouchEnd)
  }
  window.removeEventListener('resize', resize)
})

/**
 * 数据变化 → 重建场景。
 * 这一条就是「后台加一个案例，前台多一颗星球」的落点：
 * useContent 拿到新的 cases → props 变 → 重新算行业表 + 重建星球列表。
 */
watch(() => props.cases, async () => {
  if (!ready) return
  await loadTextures()
  buildScene()
})

/** 面板徽章样式 */
const badge = computed(() => badgeStyle(panel.value.rgb || [31, 91, 255]))
</script>

<template>
  <div ref="rootEl" class="galaxy" :style="{ '--space-bg': `url(${SPACE_BG})` }">
    <div class="galaxy-bg" aria-hidden="true"></div>
    <canvas ref="canvasEl" class="galaxy-canvas"></canvas>

    <div class="galaxy-ui">
      <a class="gk-back" href="/" title="返回首页">← 返回</a>

      <header class="gk-hdr">
        <h1><em>ONLYSTYLE</em> 案例星系</h1>
        <p>每一个星球，都是一次数字化跃迁</p>
      </header>

      <nav class="gk-filters" aria-label="案例分类">
        <button
          v-for="t in filterTabs"
          :key="t.key"
          class="ftab"
          :class="{ active: activeFilter === t.key }"
          type="button"
          @click="pickFilter(t.key)"
        >
          {{ t.label }}
        </button>
      </nav>

      <div
        v-show="tip.on"
        class="gk-tip"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
        aria-hidden="true"
      >
        <div class="tn">{{ tip.name }}</div>
        <div class="ti">{{ tip.sub }}</div>
      </div>

      <aside class="gk-panel" :class="{ open: panelOpen }" aria-label="案例详情">
        <div class="gk-ph">
          <button class="gk-pc" type="button" aria-label="关闭详情" @click="closePanel">✕</button>
          <div class="gk-badge" :style="badge">{{ panel.label }}</div>
          <div class="gk-name">{{ panel.name }}</div>
          <div class="gk-title">{{ panel.title }}</div>
        </div>
        <div class="gk-pb">
          <template v-if="panel.desc">
            <div class="pst">案例描述</div>
            <div class="pdesc">{{ panel.desc }}</div>
          </template>
          <template v-if="panel.results && panel.results.length">
            <div class="pst">关键成果</div>
            <div class="pres">
              <div v-for="(r, i) in panel.results" :key="i" class="pres-item">
                <span class="pres-dot" :style="{ background: panel.color, boxShadow: `0 0 6px ${panel.color}` }"></span>
                <span>{{ r }}</span>
              </div>
            </div>
          </template>
        </div>
      </aside>

      <p v-if="!hasCases" class="gk-empty">内容中台里还没有已发布的案例。</p>

      <div class="gk-hint">拖拽旋转 · 滚轮缩放 · 点击星球查看案例</div>

      <div class="gk-zoom">
        <button class="zbtn" type="button" aria-label="放大" @click="zoomIn">+</button>
        <button class="zbtn" type="button" aria-label="缩小" @click="zoomOut">−</button>
      </div>
      <div class="gk-rvbtn">
        <button type="button" @click="resetView">重置视角</button>
      </div>
    </div>

    <!-- 画布对屏幕阅读器（以及 SEO 抓取）都是不可见的，这里补一份等价的可读清单 -->
    <ul class="gk-sr">
      <li v-for="c in cases" :key="c.id != null ? c.id : c.slug">
        <strong>{{ c.client || c.title }}</strong>
        <span>（{{ c.industryLabel || c.category }}）</span>
        <span>{{ c.summary }}</span>
      </li>
    </ul>

    <div class="gk-loading" :class="{ hide: !loading }">
      <div class="ld-ring"></div>
      <div class="ld-txt">正在加载星系...</div>
    </div>
  </div>
</template>

<style scoped>
/* 舞台：整页铺满。父路由把它挂成 fixed，这样导航/页脚不参与布局也不遮挡 */
.galaxy {
  position: fixed;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  background: #040914;
  color: #fff;
  font-family: 'Inter', -apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  touch-action: none;
}
.galaxy-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--space-bg) center / cover no-repeat, #040914;
}
.galaxy-bg::after { content: ''; position: absolute; inset: 0; background: rgba(4, 9, 20, 0.55); }
.galaxy-canvas { position: absolute; inset: 0; z-index: 1; cursor: grab; display: block; }
.galaxy-canvas.drag { cursor: grabbing; }
.galaxy-ui { position: absolute; inset: 0; z-index: 10; pointer-events: none; }

/* ── 返回（沉浸式页面唯一的出口） ── */
.gk-back {
  position: absolute; top: 20px; left: 26px; pointer-events: auto;
  font-size: 12px; color: rgba(255, 255, 255, 0.6); text-decoration: none;
  background: rgba(4, 9, 20, 0.6); border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px; padding: 5px 14px; backdrop-filter: blur(8px);
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.gk-back:hover { color: #fff; border-color: rgba(59, 224, 255, 0.4); background: rgba(31, 91, 255, 0.22); }

.gk-hdr { position: absolute; top: 58px; left: 26px; pointer-events: auto; }
.gk-hdr h1 { font-size: 17px; font-weight: 700; letter-spacing: 0.04em; margin: 0 0 4px; }
.gk-hdr h1 em {
  font-style: normal;
  background: linear-gradient(135deg, #1f5bff, #3be0ff);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.gk-hdr p { font-size: 12px; color: rgba(255, 255, 255, 0.45); margin: 0; }

.gk-filters { position: absolute; top: 22px; right: 26px; display: flex; gap: 6px; pointer-events: auto; flex-wrap: wrap; justify-content: flex-end; max-width: 60vw; }
.ftab {
  font-size: 12px; font-weight: 500; color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px; padding: 6px 16px; cursor: pointer;
  transition: all 0.2s; font-family: inherit;
}
.ftab:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
.ftab.active {
  color: #fff;
  background: linear-gradient(135deg, rgba(31, 91, 255, 0.35), rgba(59, 224, 255, 0.25));
  border-color: rgba(59, 224, 255, 0.4);
}

.gk-tip {
  position: absolute; pointer-events: none;
  background: rgba(4, 9, 20, 0.9);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(59, 224, 255, 0.22); border-radius: 10px;
  padding: 10px 14px; max-width: 180px; z-index: 20;
}
.gk-tip .tn { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 3px; }
.gk-tip .ti { font-size: 11px; color: rgba(255, 255, 255, 0.55); }

.gk-panel {
  position: absolute; top: 0; right: 0; width: 340px; height: 100%;
  background: rgba(4, 9, 20, 0.88);
  backdrop-filter: blur(28px) saturate(180%); -webkit-backdrop-filter: blur(28px) saturate(180%);
  border-left: 1px solid rgba(255, 255, 255, 0.07);
  transform: translateX(100%); transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto; display: flex; flex-direction: column; z-index: 30;
}
.gk-panel.open { transform: translateX(0); }
.gk-ph { padding: 28px 22px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); flex-shrink: 0; position: relative; }
.gk-pc {
  position: absolute; top: 18px; right: 18px; width: 30px; height: 30px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.55); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-family: inherit;
  transition: background 0.2s, color 0.2s;
}
.gk-pc:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
.gk-badge {
  display: inline-flex; align-items: center; font-size: 10px; font-weight: 500;
  letter-spacing: 0.1em; text-transform: uppercase; border-radius: 999px;
  padding: 3px 10px; margin-bottom: 10px;
}
.gk-name { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 4px; padding-right: 36px; }
.gk-title { font-size: 13px; color: rgba(255, 255, 255, 0.5); }
.gk-pb {
  flex: 1; overflow-y: auto; padding: 18px 22px 24px;
  scrollbar-width: thin; scrollbar-color: rgba(59, 224, 255, 0.2) transparent;
}
.gk-pb::-webkit-scrollbar { width: 3px; }
.gk-pb::-webkit-scrollbar-thumb { background: rgba(59, 224, 255, 0.2); border-radius: 2px; }
.pst {
  font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3); margin-bottom: 10px; margin-top: 18px;
}
.pst:first-child { margin-top: 0; }
.pdesc { font-size: 14px; color: rgba(255, 255, 255, 0.72); line-height: 1.7; }
.pres { display: flex; flex-direction: column; gap: 8px; }
.pres-item {
  display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255, 255, 255, 0.65);
  padding: 8px 12px; background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px;
}
.pres-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

.gk-empty {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  font-size: 13px; color: rgba(255, 255, 255, 0.4); pointer-events: none;
}
.gk-hint {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
  font-size: 11px; color: rgba(255, 255, 255, 0.55); letter-spacing: 0.06em; white-space: nowrap;
  background: rgba(4, 9, 20, 0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 999px; padding: 6px 18px; pointer-events: none;
}
.gk-zoom { position: absolute; bottom: 56px; left: 22px; display: flex; flex-direction: column; gap: 4px; pointer-events: auto; }
.zbtn {
  width: 34px; height: 34px; border-radius: 8px; background: rgba(4, 9, 20, 0.7);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.65);
  font-size: 17px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-family: inherit; transition: background 0.2s, color 0.2s;
}
.zbtn:hover { background: rgba(31, 91, 255, 0.25); color: #fff; border-color: rgba(59, 224, 255, 0.3); }
.gk-rvbtn { position: absolute; bottom: 56px; left: 64px; pointer-events: auto; }
.gk-rvbtn button {
  height: 34px; border-radius: 8px; background: rgba(4, 9, 20, 0.7);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.55);
  font-size: 11px; cursor: pointer; padding: 0 12px; font-family: inherit;
  transition: background 0.2s, color 0.2s;
}
.gk-rvbtn button:hover { background: rgba(31, 91, 255, 0.25); color: #fff; border-color: rgba(59, 224, 255, 0.3); }

/* 视觉上隐藏，但屏幕阅读器/爬虫可读 */
.gk-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}

.gk-loading {
  position: absolute; inset: 0; z-index: 100; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
  background: rgba(4, 9, 20, 0.92); transition: opacity 0.5s;
}
.gk-loading.hide { opacity: 0; pointer-events: none; }
.ld-ring {
  width: 48px; height: 48px; border-radius: 50%;
  border: 3px solid rgba(59, 224, 255, 0.15); border-top-color: #3be0ff;
  animation: gk-spin 0.9s linear infinite;
}
@keyframes gk-spin { to { transform: rotate(360deg) } }
.ld-txt { font-size: 13px; color: rgba(255, 255, 255, 0.5); letter-spacing: 0.08em; }

@media (max-width: 768px) {
  .gk-panel {
    width: 100%; border-left: none; border-top: 1px solid rgba(255, 255, 255, 0.07);
    top: auto; bottom: 0; height: 60%; transform: translateY(100%);
  }
  .gk-panel.open { transform: translateY(0); }
  .gk-filters { gap: 4px; max-width: 72vw; }
  .ftab { padding: 5px 10px; font-size: 11px; }
  .gk-hdr { top: 54px; }
  .gk-hint { font-size: 10px; padding: 5px 12px; }
}
</style>
