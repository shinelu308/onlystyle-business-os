/**
 * 滚动进入动画。
 *
 * ⚠️ 关键约束：预渲染出的静态 HTML 必须是「可见」的。
 *    所以这里不在初始 DOM 上写 opacity:0，而是等 JS 挂载后，
 *    只对「此刻还在视口下方」的元素加 .reveal-ready（隐藏态），
 *    再由 IntersectionObserver 加 .in 显示。
 *    这样：搜索引擎/无 JS/首屏元素 → 一律直接可见；只有真正需要滚下去看的卡片才带动画。
 */
const SELECTOR = '.service-card, .why-card, .case-card, .info-card, .reveal';

let io = null;

export function initReveal() {
  if (typeof window === 'undefined') return;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
  }

  const vh = window.innerHeight;
  document.querySelectorAll(SELECTOR).forEach((el) => {
    if (el.dataset.revealDone) return;
    el.dataset.revealDone = '1';
    // 已经在首屏（或更上）的，不动画，避免首屏闪烁
    if (el.getBoundingClientRect().top < vh * 0.92) return;
    el.classList.add('reveal-ready');
    io.observe(el);
  });
}
