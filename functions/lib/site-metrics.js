// These are aggregate categories: services includes /parents and /schools; resources includes /blog.
export const PAGES = Object.freeze(["home", "services", "start", "about", "resources"]);
export const EVENTS = Object.freeze(["page_view", "booking_click", "calendar_open", "booking_submitted", "school_enquiry_prepared", "school_whatsapp_click"]);

export function validMetric(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 2 && Object.hasOwn(value, "page") && Object.hasOwn(value, "event") &&
    PAGES.includes(value.page) && EVENTS.includes(value.event) &&
    (!value.event.startsWith("school_") || value.page === "services") &&
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
