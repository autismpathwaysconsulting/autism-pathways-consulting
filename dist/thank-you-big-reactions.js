(() => {
  const link = document.getElementById("quick-check-download");
  const params = new URLSearchParams(location.search);
  const allowSource = new Set(["instagram", "facebook", "google", "email", "whatsapp", "direct", "other"]);
  const allowMedium = new Set(["social", "paid_social", "organic_social", "email", "referral", "direct", "other"]);
  const clean = (value, allowed, fallback) => {
    const normal = String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
    return allowed.has(normal) ? normal : fallback;
  };
  let saved = {};
  try {
    saved = JSON.parse(sessionStorage.getItem("apc.quick_check_attribution") || "{}");
  } catch {
    // Invalid or unavailable session storage falls back to bounded defaults.
  }
  const attribution = {
    source: clean(params.get("utm_source") || saved.source, allowSource, "direct"),
    medium: clean(params.get("utm_medium") || saved.medium, allowMedium, "direct"),
    campaign: (params.get("utm_campaign") || saved.campaign) === "big_reactions" ? "big_reactions" : "unspecified",
  };
  const recorded = new Set();
  const record = event => {
    if (recorded.has(event) || location.origin !== "https://autismpathwaysconsulting.com" || navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;
    recorded.add(event);
    fetch("/api/site-metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: "quick_check", event, attribution }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    }).catch(() => {});
  };
  record("form_submitted");
  link.addEventListener("click", () => record("download"), { once: true });
  window.setTimeout(() => {
    record("download");
    link.click();
  }, 500);
})();
