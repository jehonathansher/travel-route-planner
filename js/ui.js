// ============================================================================
//  UI  —  connects the buttons/panels in index.html to the store + map.
// ----------------------------------------------------------------------------
//  Pattern: the store is the single source of truth. We subscribe to it once
//  (store.onChange) and re-draw the whole UI whenever anything changes — so a
//  change made on your phone redraws here automatically, and vice-versa.
// ============================================================================

import { SEGMENT_COLORS } from "../config.js";
import { TRAVEL_MODES, DEFAULT_MODE } from "./model.js";
import { createPlaceInput } from "./places.js";
import { renderTrip } from "./map.js";
import * as store from "./store.js";

// ---- Grab DOM elements once ----------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {
  tripName: $("trip-name"),
  btnTrips: $("btn-trips"),
  btnAdd: $("btn-add"),
  // segments panel
  panel: $("segments-panel"),
  segmentsHandle: $("segments-handle"),
  segmentsSummary: $("segments-summary"),
  segmentsList: $("segments-list"),
  // trips drawer
  drawer: $("trips-drawer"),
  btnCloseTrips: $("btn-close-trips"),
  btnNewTrip: $("btn-new-trip"),
  tripsList: $("trips-list"),
  // add-segment sheet
  addSheet: $("add-sheet"),
  btnCloseAdd: $("btn-close-add"),
  startSlot: $("start-input"),
  endSlot: $("end-input"),
  modeChips: $("mode-chips"),
  btnSaveSegment: $("btn-save-segment"),
  // backdrop
  scrim: $("scrim"),
};

// What the add-segment form currently holds, before saving.
let pending = { start: null, end: null, mode: DEFAULT_MODE };

export function initUI() {
  bindEvents();
  // Re-render every time trips / active trip / segments change.
  store.onChange(render);
}

// ---------------------------------------------------------------------------
//  Rendering (called on every store change)
// ---------------------------------------------------------------------------
function render(state) {
  const { trips, activeTrip } = state;

  // Top bar trip name (or a prompt to create the first trip).
  el.tripName.textContent = activeTrip ? activeTrip.name : "＋ New trip";

  // Draw the active trip on the map.
  renderTrip(activeTrip);

  // Segments panel summary + list.
  renderSegments(activeTrip);

  // Trips drawer list.
  renderTripsList(trips, state.activeTripId);
}

function renderSegments(trip) {
  const segments = trip ? trip.segments : [];
  el.segmentsSummary.textContent = segments.length
    ? `${segments.length} segment${segments.length > 1 ? "s" : ""}`
    : "No segments yet";

  el.segmentsList.innerHTML = "";
  segments.forEach((seg) => {
    const mode = TRAVEL_MODES[seg.mode] || {};
    // Show the travel-time estimate once the real route is fetched; while it's
    // still a straight line for a routable mode, show a subtle "routing…".
    const dur = seg.info?.duration
      ? `<span class="seg-dur">${escapeHtml(seg.info.duration)}</span>`
      : (mode.routable && seg.routeSource === "straight"
          ? `<span class="seg-dur muted">routing…</span>`
          : "");
    const li = document.createElement("li");
    li.className = "segment-row";
    li.innerHTML = `
      <span class="dot" style="background:${seg.style.color}"></span>
      <span class="seg-mode">${mode.emoji || ""}</span>
      <span class="seg-text">${escapeHtml(seg.start.name)} → ${escapeHtml(seg.end.name)}</span>
      ${dur}
      <button class="icon-btn small seg-del" aria-label="Delete segment">🗑</button>
    `;
    li.querySelector(".seg-del").addEventListener("click", async () => {
      if (confirm("Delete this segment?")) {
        await store.removeSegment(trip.id, seg.id);
      }
    });
    el.segmentsList.appendChild(li);
  });
}

function renderTripsList(trips, activeTripId) {
  el.tripsList.innerHTML = "";
  if (!trips.length) {
    const empty = document.createElement("li");
    empty.className = "trips-empty";
    empty.textContent = "No trips yet. Create your first one above.";
    el.tripsList.appendChild(empty);
    return;
  }
  trips.forEach((trip) => {
    const li = document.createElement("li");
    li.className = "trip-row" + (trip.id === activeTripId ? " active" : "");
    li.innerHTML = `
      <button class="trip-pick">
        <span class="trip-row-name">${escapeHtml(trip.name)}</span>
        <span class="trip-row-meta">${trip.segments.length} segment${trip.segments.length === 1 ? "" : "s"}</span>
      </button>
      <button class="icon-btn small trip-del" aria-label="Delete trip">🗑</button>
    `;
    li.querySelector(".trip-pick").addEventListener("click", async () => {
      await store.setActiveTrip(trip.id);
      closeAll();
    });
    li.querySelector(".trip-del").addEventListener("click", async () => {
      if (confirm(`Delete trip "${trip.name}"? This cannot be undone.`)) {
        await store.deleteTrip(trip.id);
      }
    });
    el.tripsList.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
//  Event wiring
// ---------------------------------------------------------------------------
function bindEvents() {
  // Trip name: rename if a trip exists, otherwise create the first trip.
  el.tripName.addEventListener("click", async () => {
    const active = store.getActiveTrip();
    if (!active) return newTripFlow();
    const name = prompt("Rename trip:", active.name);
    if (name && name.trim()) await store.renameTrip(active.id, name);
  });

  el.btnTrips.addEventListener("click", () => openDrawer());
  el.btnCloseTrips.addEventListener("click", () => closeAll());
  el.btnNewTrip.addEventListener("click", () => newTripFlow());

  el.btnAdd.addEventListener("click", () => openAddSheet());
  el.btnCloseAdd.addEventListener("click", () => closeAll());
  el.btnSaveSegment.addEventListener("click", () => saveSegment());

  el.segmentsHandle.addEventListener("click", () =>
    el.panel.classList.toggle("collapsed")
  );

  el.scrim.addEventListener("click", () => closeAll());
}

// ---------------------------------------------------------------------------
//  Flows
// ---------------------------------------------------------------------------
async function newTripFlow() {
  const name = prompt("Name your trip:", "My trip");
  if (name === null) return; // cancelled
  await store.createTrip(name);
  closeAll();
}

// Make sure there's a trip to add segments to; create one if needed.
async function ensureActiveTrip() {
  if (store.getActiveTrip()) return true;
  const name = prompt("First, name your trip:", "My trip");
  if (name === null) return false;
  await store.createTrip(name);
  return true;
}

async function openAddSheet() {
  if (!(await ensureActiveTrip())) return;

  pending = { start: null, end: null, mode: DEFAULT_MODE };
  buildModeChips();
  updateSaveEnabled();

  // Build fresh place-search boxes each time the sheet opens.
  el.startSlot.innerHTML = "";
  el.endSlot.innerHTML = "";
  await createPlaceInput(el.startSlot, {
    placeholder: "Start point",
    onPick: (place) => { pending.start = place; updateSaveEnabled(); },
  });
  await createPlaceInput(el.endSlot, {
    placeholder: "End point",
    onPick: (place) => { pending.end = place; updateSaveEnabled(); },
  });

  showScrim();
  el.addSheet.classList.add("open");
}

function buildModeChips() {
  el.modeChips.innerHTML = "";
  Object.entries(TRAVEL_MODES).forEach(([key, mode]) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (key === pending.mode ? " selected" : "");
    chip.innerHTML = `${mode.emoji} ${mode.label}`;
    chip.addEventListener("click", () => {
      pending.mode = key;
      [...el.modeChips.children].forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
    el.modeChips.appendChild(chip);
  });
}

function updateSaveEnabled() {
  el.btnSaveSegment.disabled = !(pending.start && pending.end);
}

async function saveSegment() {
  const trip = store.getActiveTrip();
  if (!trip || !pending.start || !pending.end) return;

  // v1: assign the next colour from the palette by segment index.
  const color = SEGMENT_COLORS[trip.segments.length % SEGMENT_COLORS.length];
  await store.addSegment(trip.id, {
    start: pending.start,
    end: pending.end,
    mode: pending.mode,
    color,
  });
  closeAll();
  el.panel.classList.remove("collapsed"); // reveal the new segment
}

// ---------------------------------------------------------------------------
//  Open / close panels
// ---------------------------------------------------------------------------
function openDrawer() {
  showScrim();
  el.drawer.classList.add("open");
}

function showScrim() {
  el.scrim.classList.add("show");
}

function closeAll() {
  el.drawer.classList.remove("open");
  el.addSheet.classList.remove("open");
  el.scrim.classList.remove("show");
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
