// These are aggregate categories: services includes /parents and /schools; resources includes /blog.
export const PAGES = Object.freeze(["home", "services", "start", "about", "resources", "quick_check"]);
export const EVENTS = Object.freeze(["page_view", "booking_click", "calendar_open", "booking_submitted", "form_open", "form_submitted", "download"]);
export const ATTRIBUTION_SOURCES = Object.freeze(["instagram", "facebook", "google", "email", "whatsapp", "direct", "other"]);
export const ATTRIBUTION_MEDIA = Object.freeze(["social", "paid_social", "organic_social", "email", "referral", "direct", "other"]);
export const ATTRIBUTION_CAMPAIGNS = Object.freeze(["big_reactions", "unspecified"]);

export function validAttribution(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 3 &&
    ATTRIBUTION_SOURCES.includes(value.source) && ATTRIBUTION_MEDIA.includes(value.medium) && ATTRIBUTION_CAMPAIGNS.includes(value.campaign);
}

export function validMetric(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.hasOwn(value, "page") && Object.hasOwn(value, "event") &&
    PAGES.includes(value.page) && EVENTS.includes(value.event) &&
    (!["calendar_open", "booking_submitted"].includes(value.event) || ["home", "services"].includes(value.page)) &&
    (!["form_open", "form_submitted", "download"].includes(value.event) || value.page === "quick_check") &&
    (value.page === "quick_check"
      ? Object.keys(value).length === 3 && validAttribution(value.attribution)
      : Object.keys(value).length === 2 && !Object.hasOwn(value, "attribution"));
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
