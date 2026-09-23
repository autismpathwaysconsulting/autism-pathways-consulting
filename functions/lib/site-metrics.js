// These are aggregate categories: services includes /parents and /schools; resources includes /blog.
export const PAGES = Object.freeze(["home", "services", "start", "about", "resources", "big_reactions"]);
export const EVENTS = Object.freeze([
  "page_view", "booking_click", "calendar_open", "booking_submitted",
  "form_start", "form_submit", "download_click", "parent_support_click",
  "campaign_correction", "campaign_30_seconds", "campaign_inconsistency",
  "campaign_resource_page", "campaign_meltdown_guide"
]);

const BIG_REACTIONS_ONLY = Object.freeze([
  "form_start", "form_submit", "download_click", "parent_support_click",
  "campaign_correction", "campaign_30_seconds", "campaign_inconsistency",
  "campaign_resource_page", "campaign_meltdown_guide"
]);

export function validMetric(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 2 || !Object.hasOwn(value, "page") || !Object.hasOwn(value, "event") ||
      !PAGES.includes(value.page) || !EVENTS.includes(value.event)) return false;
  if (["calendar_open", "booking_submitted"].includes(value.event) && !["home", "services"].includes(value.page)) return false;
  if (BIG_REACTIONS_ONLY.includes(value.event) && value.page !== "big_reactions") return false;
  return true;
}

export function metricResponse(status, value) {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
