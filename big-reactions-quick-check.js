const METRIC_ENDPOINT = "/api/site-metrics";
const FORM_ORIGIN = "https://b0f4b8a0.sibforms.com";
const allowedSources = new Set(["instagram", "facebook", "google", "email", "whatsapp", "direct", "other"]);
const allowedMedia = new Set(["social", "paid_social", "organic_social", "email", "referral", "direct", "other"]);

function bounded(value, fallback, allowed) {
  const normal = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
  return allowed.has(normal) ? normal : fallback;
}

const query = new URLSearchParams(window.location.search);
const attribution = {
  source: bounded(query.get("utm_source"), document.referrer ? "other" : "direct", allowedSources),
  medium: bounded(query.get("utm_medium"), document.referrer ? "referral" : "direct", allowedMedia),
  campaign: query.get("utm_campaign") === "big_reactions" ? "big_reactions" : "unspecified",
};

const recorded = new Set();
function recordMetric(event) {
  if (window.location.origin !== "https://autismpathwaysconsulting.com" || navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true || recorded.has(event)) return;
  recorded.add(event);
  fetch(METRIC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: "quick_check", event, attribution }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
  }).catch(() => {});
}

function attributedFormUrl(raw) {
  const url = new URL(raw);
  if (url.origin !== FORM_ORIGIN) return raw;
  url.searchParams.set("utm_source", attribution.source);
  url.searchParams.set("utm_medium", attribution.medium);
  url.searchParams.set("utm_campaign", attribution.campaign);
  return url.href;
}

const form = document.querySelector("[data-brevo-form]");
if (form) form.src = attributedFormUrl(form.src);
document.querySelectorAll("a[href^='https://b0f4b8a0.sibforms.com/']").forEach(link => { link.href = attributedFormUrl(link.href); });

recordMetric("page_view");
document.querySelector("[data-form-open]")?.addEventListener("click", () => recordMetric("form_open"));

window.addEventListener("message", event => {
  if (event.origin !== FORM_ORIGIN) return;
  const message = typeof event.data === "string" ? event.data : event.data?.type;
  if (message === "sib-form-submitted" || message === "form:submitted" || message === "success") recordMetric("form_submitted");
});
