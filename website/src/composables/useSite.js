/**
 * 站点级配置（品牌 / 联系方式 / 备案 / 导航）
 * 全站共享一个缓存键，SiteNav + SiteFooter + 联系页加起来只发一个请求。
 */
import { useContent } from './useContent.js';
import { site as fallback } from '@/data/fallback/site.js';
import { getSite } from '@/api/content.js';

export function useSite() {
  return useContent('site', fallback, getSite);
}
