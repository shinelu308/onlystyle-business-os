<script setup>
/**
 * 产品介绍 —— 主打「楼达人资产管理平台」（SAAS），其余服务作点缀。
 * 结构（2026-09-18 效果图确认）：PageHero → 主打产品大卡（功能矩阵 + 进入平台）
 * → 更多服务点缀小卡 → CTA。
 * 样式 v3：卡片对齐站内深色玻璃卡语言（info-card：white 5% 底 / 白 10% 边 /
 * 16px 圆角 / cyan hover），功能矩阵去里层小卡框改直排。
 */
import PageHero from '@/components/PageHero.vue';
import CtaSection from '@/components/home/CtaSection.vue';

/** 平台入口（SAAS） */
const PLATFORM_URL = 'https://biz.loudaren.com/orgs/#/index?from=system';

/** 主打产品的核心功能矩阵（六格框架参考快鲸资产运营系统介绍，按楼达人实际功能调整） */
const features = [
  { icon: '◈', title: '资产数字化管理', desc: '不动产 / 固定资产台账、资产全景与巡检盘点、全生命周期档案。' },
  { icon: '▤', title: '租赁与合同管理', desc: '房源租控、电子合同、租客管理，出租率与到期情况一目了然。' },
  { icon: '¥', title: '业财一体化', desc: '账单、收银、发票、收支流水，业务与财务数据自动贯通。' },
  { icon: '◎', title: '招商管理', desc: '房源发布、意向客户跟进、渠道与佣金管理，招商更高效。' },
  { icon: '▦', title: '数据可视化大屏', desc: '资产 / 租赁 / 租客多维分析图表与房态图，经营态势实时掌握。' },
  { icon: '⌂', title: '物业与增值运营', desc: '在线报修、工单、缴费与 IoT 设备接入，延伸资管服务边界。' },
];

/** 更多服务（点缀） */
const moreServices = [
  { icon: '◎', title: '数字化咨询规划', desc: '现状评估、转型路线图与顶层设计。' },
  { icon: '▤', title: '一站式平台建设', desc: '官网、业务系统与小程序 / App 交付。' },
  { icon: '◈', title: '行业智能化方案', desc: '智慧园区、数字孪生与数据驾驶舱。' },
  { icon: '✦', title: 'AI 应用与交付', desc: '知识库助手、智能营销等场景落地。' },
];
</script>

<template>
  <div class="page">
    <PageHero
      crumb="产品介绍"
      title="产品介绍"
      sub="以自研「楼达人资产管理平台」为核心，为园区与楼宇资方提供资产管理数字化的一站式解决方案，辅以定制化的数字化建设与智能化服务。"
    />

    <!-- 主打产品 -->
    <section class="section">
      <div class="container">
        <div class="section-header">
          <div class="eyebrow">Flagship Product</div>
          <h2 class="section-title">主打产品</h2>
        </div>

        <div class="flag-card">
          <div class="flag-top">
            <div class="flag-ico">◉</div>
            <div class="flag-info">
              <div class="flag-badges">
                <span class="badge main">主打产品</span>
                <span class="badge">SAAS 模式 · 开箱即用</span>
                <span class="badge">多业态资产运营</span>
              </div>
              <h3 class="flag-title">楼达人资产管理平台</h3>
              <p class="flag-desc">
                面向写字楼、园区、商业、公寓等多业态资产，提供覆盖「资产数字化台账 — 招商租赁 —
                业财一体 — 运营增值」全流程的一站式资管运营系统，让每一平米资产可视、可控、可增值。
              </p>
            </div>
            <div class="flag-cta">
              <a class="flag-btn" :href="PLATFORM_URL" target="_blank" rel="noopener">进入平台 ↗</a>
              <span class="flag-url">biz.loudaren.com</span>
            </div>
          </div>
          <div class="flag-body">
            <div class="flag-cap">核心功能矩阵</div>
            <div class="flag-grid">
              <div v-for="f in features" :key="f.title" class="flag-cell">
                <div class="fh"><i>{{ f.icon }}</i><b>{{ f.title }}</b></div>
                <p>{{ f.desc }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 更多服务（点缀） -->
        <div class="section-header" style="margin-top: 56px">
          <div class="eyebrow">More Services</div>
          <h2 class="section-title section-title-sm">更多服务</h2>
          <p class="section-desc">围绕平台提供配套的咨询、建设与智能化服务，可单独交付，也可与平台组合成一体化方案。</p>
        </div>
        <div class="more-grid">
          <div v-for="s in moreServices" :key="s.title" class="more-card">
            <div class="more-head"><i>{{ s.icon }}</i><b>{{ s.title }}</b></div>
            <p>{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <CtaSection />
  </div>
</template>

<style scoped>
/* ===== 主打产品大卡（站内玻璃卡语言：white .05 底 / .10 边 / 16 圆角） ===== */
.flag-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.flag-top {
  position: relative;
  padding: 36px 38px 32px;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.flag-top::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 140% at 85% 0%, rgba(31, 91, 255, 0.2) 0%, transparent 60%);
  pointer-events: none;
}
.flag-ico {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1f5bff, #3be0ff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(31, 91, 255, 0.35);
}
.flag-info { position: relative; flex: 1; min-width: 0; }
.flag-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.badge {
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  padding: 3px 12px;
  background: rgba(59, 224, 255, 0.1);
  color: #3be0ff;
  border: 1px solid rgba(59, 224, 255, 0.3);
}
.badge.main { background: rgba(31, 91, 255, 0.25); color: #fff; border-color: rgba(59, 224, 255, 0.45); }
.flag-title { font-size: 22px; font-weight: 800; margin: 0 0 8px; color: var(--text-primary); }
.flag-desc { font-size: 13.5px; color: var(--text-body); line-height: 1.9; margin: 0; }
.flag-cta { position: relative; text-align: center; flex-shrink: 0; }
.flag-btn {
  display: inline-block;
  background: linear-gradient(135deg, #1f5bff, #3be0ff);
  color: #fff;
  border-radius: 999px;
  padding: 12px 28px;
  font-size: 13.5px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.flag-url { display: block; font-size: 11px; color: var(--text-muted); margin-top: 8px; }

/* 功能矩阵：去里层小卡框，「青色图标 + 标题 + 描述」直排 */
.flag-body { padding: 32px 38px 38px; }
.flag-cap { font-size: 12px; color: var(--text-muted); margin-bottom: 22px; }
.flag-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px 32px; }
.flag-cell .fh { display: flex; align-items: center; gap: 12px; margin-bottom: 9px; }
.flag-cell .fh i {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(59, 224, 255, 0.1);
  border: 1px solid rgba(59, 224, 255, 0.22);
  color: #3be0ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-style: normal;
  font-size: 16px;
  flex-shrink: 0;
}
.flag-cell .fh b { font-size: 15px; color: var(--text-primary); font-weight: 600; }
.flag-cell p { font-size: 12.5px; color: var(--text-muted); line-height: 1.8; margin: 0; padding-left: 50px; }

/* ===== 更多服务（点缀）：info-card 同款玻璃卡 + hover ===== */
.section-title-sm { font-size: 20px; }
.more-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-top: 24px; }
.more-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-card);
  padding: 26px 24px;
  transition: border-color 0.25s, transform 0.25s, background 0.25s;
}
.more-card:hover {
  border-color: rgba(59, 224, 255, 0.24);
  background: rgba(255, 255, 255, 0.07);
  transform: translateY(-3px);
}
.more-head { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
.more-head i {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(59, 224, 255, 0.1);
  border: 1px solid rgba(59, 224, 255, 0.22);
  color: #3be0ff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-style: normal;
  font-size: 14px;
  flex-shrink: 0;
}
.more-head b { font-size: 14px; color: var(--text-primary); font-weight: 600; }
.more-card p { font-size: 12px; color: var(--text-muted); line-height: 1.75; margin: 0; }

/* ===== 响应式 ===== */
@media (max-width: 900px) {
  .flag-top { flex-direction: column; }
  .flag-cta { text-align: left; }
  .flag-grid { grid-template-columns: 1fr 1fr; }
  .more-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .flag-grid { grid-template-columns: 1fr; }
  .more-grid { grid-template-columns: 1fr; }
}
</style>
