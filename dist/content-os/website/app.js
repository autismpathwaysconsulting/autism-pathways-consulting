const pages = { home: "Home", services: "Parent & school services", start: "Start Here", about: "About", resources: "Resources & blog" };
const events = { page_view: "Page views", booking_click: "Booking clicks", calendar_open: "Calendar opens", booking_submitted: "Submitted bookings (embed)", form_open: "Form opens", form_submitted: "Form submissions", download: "Quick Check downloads" };
const status = document.getElementById("status");
const counts = document.getElementById("counts");
const refresh = document.getElementById("refresh");
const quickCheckCounts = document.getElementById("quick-check-counts");

async function loadCounts() {
  refresh.disabled = true;
  status.textContent = "Loading counters...";
  try {
    const response = await fetch("/api/content-os/site-metrics", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(response.status === 401 ? "Sign in to Content OS to view these counts." : "Counters are unavailable. Try refreshing shortly.");
    const data = await response.json();
    counts.replaceChildren();
    for (const [page, label] of Object.entries(pages)) {
      const card = document.createElement("article"); card.className = "card";
      const heading = document.createElement("h3"); heading.textContent = label; card.append(heading);
      const list = document.createElement("dl");
      for (const [event, title] of Object.entries(events)) {
        if (!["home", "services"].includes(page) && ["calendar_open", "booking_submitted"].includes(event)) continue;
        const term = document.createElement("dt"); term.textContent = title;
        const value = document.createElement("dd"); value.textContent = String(data.rows.find(row => row.page === page && row.event === event)?.count ?? 0);
        list.append(term, value);
      }
      card.append(list); counts.append(card);
    }
    quickCheckCounts.replaceChildren();
    for (const row of data.quickCheck || []) {
      const item = document.createElement("article"); item.className = "card";
      const heading = document.createElement("h3"); heading.textContent = events[row.event] || row.event.replaceAll("_", " ");
      const summary = document.createElement("p"); summary.textContent = `${row.count} · ${row.source} / ${row.medium} / ${row.campaign}`;
      item.append(heading, summary); quickCheckCounts.append(item);
    }
    if (!(data.quickCheck || []).length) quickCheckCounts.textContent = "No Quick Check activity recorded yet.";
    status.textContent = data.rows.length ? `Updated ${new Date(data.measuredAt).toLocaleString()}. Last 30 days, including today (UTC).` : "No activity recorded yet. Counts begin when this release goes live.";
  } catch (error) { counts.replaceChildren(); quickCheckCounts.replaceChildren(); status.textContent = error.message; }
  finally { refresh.disabled = false; }
}
refresh.addEventListener("click", loadCounts);
loadCounts();
