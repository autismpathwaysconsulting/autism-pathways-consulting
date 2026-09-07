(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.APC_PORTAL_DATA = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return {
    profile: {
      firstName: "Sam",
      pathway: "Home Support Programme",
      stage: 2,
      nextSession: null,
      bookingEnabled: false,
      privateBookingUrl: "",
      whatsappNumber: "",
      lastSynced: "7 September · 9:40 AM"
    },
    plan: {
      focus: "Make the after-school transition feel more predictable",
      tryNow: "Offer ten quiet minutes, then show the two-step visual: snack → preferred activity.",
      notice: "How long settling takes and whether fewer spoken prompts help.",
      fallback: "If stress rises, pause the demand and return to the agreed low-language reset."
    },
    stages: [
      {
        id: "understand",
        title: "Understand + plan",
        status: "complete",
        summary: "The first working plan and what to notice.",
        items: [
          { id: "report-01", type: "Report", title: "Session 1 summary", date: "20 Aug", state: "ready" },
          { id: "form-01", type: "Form", title: "Parent priorities", date: "18 Aug", state: "complete" },
          { id: "log-01", type: "Log", title: "Starting observations", date: "20–27 Aug", state: "ready" }
        ]
      },
      {
        id: "review",
        title: "Review + adjust",
        status: "current",
        summary: "Try the adjustment and bring back what you notice.",
        items: [
          { id: "report-02", type: "Report", title: "Updated pathway note", date: "5 Sep", state: "new" },
          { id: "form-02", type: "Form", title: "Quick check-in", date: "Before next session", state: "to-do" },
          { id: "history-02", type: "History", title: "Plan updated by CJ", date: "5 Sep", state: "ready" }
        ]
      },
      { id: "strengthen", title: "Strengthen + generalise", status: "upcoming", summary: "Available after your next review.", items: [] },
      { id: "consolidate", title: "Consolidate + next steps", status: "upcoming", summary: "Available when the programme is ready to close.", items: [] }
    ],
    journals: [
      { id: "journal-1", date: "2026-09-06", time: "", title: "After school", entry: "The visual helped us move to snack with fewer reminders." }
    ],
    resources: [
      { id: "visual", type: "Visual support", title: "First–then card", description: "A simple printable for making the next two steps visible.", time: "5 min", assigned: true },
      { id: "observe", type: "Observation", title: "Before–during–after notes", description: "A light-touch prompt for noticing patterns without recording everything.", time: "7 min", assigned: true },
      { id: "regulation", type: "Regulation", title: "Low-language reset", description: "What to reduce, what to keep steady and when to pause.", time: "4 min", assigned: true },
      { id: "school", type: "Collaboration", title: "Sharing one useful strategy", description: "A concise way to explain what is helping across settings.", time: "6 min", assigned: false },
      { id: "choice", type: "Visual support", title: "Two-choice board", description: "Offer meaningful choice without adding verbal load.", time: "5 min", assigned: false },
      { id: "prepare", type: "Transitions", title: "Preparing for a change", description: "A short planning guide for unfamiliar or disrupted routines.", time: "8 min", assigned: false }
    ],
    checkInOptions: {
      response: ["Easier", "About the same", "Harder", "Unclear"],
      sustainability: ["Sustainable", "Difficult", "Not sustainable"],
      next: ["Continue", "Adjust", "Pause", "Ask CJ"]
    }
  };
});
