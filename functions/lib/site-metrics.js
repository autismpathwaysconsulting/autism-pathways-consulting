export const PAGES = Object.freeze(["home", "services", "start", "about", "resources"]);
export const EVENTS = Object.freeze(["page_view", "booking_click", "calendar_open", "booking_submitted"]);

export function validMetric(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 2 && Object.hasOwn(value, "page") && Object.hasOwn(value, "event") &&
    PAGES.includes(value.page) && EVENTS.includes(value.event) &&
    (!["calendar_open", "booking_submitted"].includes(value.event) || ["home", "services"].includes(value.page));
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
