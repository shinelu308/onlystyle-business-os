<script setup>
/**
 * 联系我们 —— 联系方式来自内容中台，需求方向下拉由「服务目录」生成
 * （后台加了新服务，表单里的选项自动跟着多一项，不用改前端）
 */
import { reactive, ref, computed } from 'vue';
import PageHero from '@/components/PageHero.vue';
import SvcIcon from '@/components/SvcIcon.vue';
import { useSite } from '@/composables/useSite.js';
import { useContent } from '@/composables/useContent.js';
import { services as fbServices } from '@/data/fallback/services.js';
import { getServices, submitLead } from '@/api/content.js';

const { data: site } = useSite();
const { data: services } = useContent('services', fbServices, getServices);

const interests = computed(() => {
  const list = (services.value || [])
    .filter((s) => s.status !== 0)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((s) => s.title);
  return [...list, '其他合作'];
});

const infoItems = computed(() => [
  { icon: 'pin', label: '公司地址', value: site.value.contact.address, href: '' },
  { icon: 'phone', label: '联系电话', value: site.value.contact.tel, href: `tel:${site.value.contact.tel}` },
  { icon: 'mail', label: '电子邮箱', value: site.value.contact.email, href: `mailto:${site.value.contact.email}` },
  { icon: 'clock', label: '工作时间', value: site.value.contact.hours, href: '' },
]);

const form = reactive({ name: '', phone: '', company: '', interest: '', message: '' });
const errors = reactive({ name: '', phone: '' });
const sending = ref(false);
const result = ref(null); // { ok, msg }

const amap = computed(() => site.value.contact.amap || {});
const mapHref = computed(
  () =>
    `https://uri.amap.com/search?keyword=${encodeURIComponent(site.value.contact.address)}&view=map`
);
const hasKey = computed(() => !!amap.value.key);

function validate() {
  errors.name = form.name.trim() ? '' : '请填写您的称呼';
  const p = form.phone.trim();
  errors.phone = !p ? '请填写联系电话' : /^[\d\s+()-]{6,20}$/.test(p) ? '' : '电话格式看起来不对';
  return !errors.name && !errors.phone;
}

async function onSubmit() {
  result.value = null;
  if (!validate()) return;
  if (!form.interest) form.interest = interests.value[0];
  sending.value = true;
  try {
    await submitLead({ ...form, source: 'website-contact', page: location.pathname });
    result.value = { ok: true, msg: '提交成功，我们会在 1 个工作日内与您联系。' };
    Object.assign(form, { name: '', phone: '', company: '', message: '', interest: interests.value[0] });
  } catch (e) {
    // 接口未就绪 / 网络失败：给出可用的兜底联系方式，不把用户堵死
    result.value = {
      ok: false,
      msg: `${e.name === 'AbortError' ? '请求超时' : e.message}。您也可以直接致电 ${site.value.contact.tel} 或发邮件至 ${site.value.contact.email}。`,
    };
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="page">
    <PageHero crumb="联系我们" title="联系我们" sub="期待与您的沟通" />

    <!-- 联系方式四宫格 -->
    <section class="section">
      <div class="container">
        <div class="info-grid info-grid-4">
          <div v-for="it in infoItems" :key="it.label" class="info-card contact-card">
            <div class="service-icon"><SvcIcon :name="it.icon" :size="24" /></div>
            <div class="contact-label">{{ it.label }}</div>
            <a v-if="it.href" class="contact-value link" :href="it.href">{{ it.value }}</a>
            <div v-else class="contact-value">{{ it.value }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 表单 + 地图/二维码 -->
    <section class="section section-alt">
      <div class="container">
        <div class="contact-split">
          <!-- 表单 -->
          <div class="contact-form-wrap">
            <div class="section-header" style="margin-bottom:28px;">
              <div class="eyebrow">Get in Touch</div>
              <h2 class="section-title" style="font-size:28px;">告诉我们您的需求</h2>
              <p class="section-desc">填写下面的信息，我们的顾问会尽快与您联系。</p>
            </div>

            <form class="form-grid" novalidate @submit.prevent="onSubmit">
              <div class="field" :class="{ 'has-error': errors.name }">
                <label for="f-name">您的称呼<span class="req">*</span></label>
                <input id="f-name" v-model="form.name" type="text" placeholder="如：张先生" autocomplete="name" />
                <div class="field-error">{{ errors.name }}</div>
              </div>

              <div class="field" :class="{ 'has-error': errors.phone }">
                <label for="f-phone">联系电话<span class="req">*</span></label>
                <input id="f-phone" v-model="form.phone" type="tel" placeholder="手机或座机" autocomplete="tel" />
                <div class="field-error">{{ errors.phone }}</div>
              </div>

              <div class="field">
                <label for="f-company">公司名称</label>
                <input id="f-company" v-model="form.company" type="text" placeholder="选填" autocomplete="organization" />
                <div class="field-error"></div>
              </div>

              <div class="field">
                <label for="f-interest">需求方向</label>
                <select id="f-interest" v-model="form.interest">
                  <option v-for="i in interests" :key="i" :value="i">{{ i }}</option>
                </select>
                <div class="field-error"></div>
              </div>

              <div class="field full">
                <label for="f-msg">需求描述</label>
                <textarea id="f-msg" v-model="form.message" placeholder="简单描述您的业务场景或想解决的问题（选填）"></textarea>
                <div class="field-error"></div>
              </div>

              <div class="full form-actions">
                <button type="submit" class="btn-primary" :disabled="sending">
                  {{ sending ? '提交中…' : '提交需求' }}
                  <svg v-if="!sending" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5"
                          stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <span class="form-note">我们承诺不外泄您的联系方式</span>
              </div>

              <div v-if="result" class="full form-result" :class="result.ok ? 'ok' : 'err'">
                {{ result.msg }}
              </div>
            </form>
          </div>

          <!-- 地图 + 二维码 -->
          <aside class="contact-aside">
            <div class="aside-block">
              <div class="aside-title">公司位置</div>
              <div class="map-box">
                <template v-if="hasKey">
                  <div id="amap-container" class="map-canvas"></div>
                </template>
                <div v-else class="map-placeholder">
                  <SvcIcon name="pin" :size="30" />
                  <p class="map-addr">{{ site.contact.address }}</p>
                  <a class="btn-outline map-btn" :href="mapHref" target="_blank" rel="noopener">
                    在高德地图中查看
                  </a>
                  <p class="map-hint">地图组件待接入高德 JS API（需在控制台配置域名白名单）</p>
                </div>
              </div>
            </div>

            <div class="aside-block">
              <div class="aside-title">微信咨询</div>
              <div class="qr-box">
                <img :src="site.contact.qrcode" alt="微信咨询二维码" loading="lazy" />
                <p class="qr-hint">扫码添加顾问，获取一对一方案沟通</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  </div>
</template>
