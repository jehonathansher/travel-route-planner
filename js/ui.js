// ============================================================================
//  UI  —  connects the buttons/panels in index.html to the store + map.
// ----------------------------------------------------------------------------
//  The store is the single source of truth. We subscribe once (store.onChange)
//  and re-draw whenever anything changes — so a change on your phone redraws
//  here automatically, and vice-versa.
//
//  Adding legs is a "chain": each new leg starts where the last one ended, the
//  sheet stays open, and departure time defaults to the previous leg's arrival.
// ============================================================================

import { SEGMENT_COLORS } from "../config.js";
import { TRAVEL_MODES, PICKER_MODES, DEFAULT_MODE } from "./model.js";
import { createPlaceInput } from "./places.js";
import { renderTrip } from "./map.js";
import { routeOne, computeTransitOptions, toDateTime, isoDate } from "./routing.js";
import * as store from "./store.js";

const $ = (id) => document.getElementById(id);
const el = {
  tripName: $("trip-name"),
  btnTrips: $("btn-trips"),
  btnAdd: $("btn-add"),
  panel: $("segments-panel"),
  segmentsHandle: $("segments-handle"),
  segmentsSummary: $("segments-summary"),
  segmentsList: $("segments-list"),
  drawer: $("trips-drawer"),
  btnCloseTrips: $("btn-close-trips"),
  btnNewTrip: $("btn-new-trip"),
  tripsList: $("trips-list"),
  addSheet: $("add-sheet"),
  addTitle: $("add-title"),
  btnCloseAdd: $("btn-close-add"),
  tripDate: $("trip-date"),
  depTime: $("dep-time"),
  startChip: $("start-chip"),
  startSlot: $("start-input"),
  endSlot: $("end-input"),
  modeChips: $("mode-chips"),
  transitOptions: $("transit-options"),
  btnSave: $("btn-save-segment"),
  scrim: $("scrim"),
};

// What the add-leg form currently holds.
let pending = { start: null, end: null, mode: DEFAULT_MODE, departureTime: "09:00" };

export function initUI() {
  bindEvents();
  store.onChange(render);
}

// ---------------------------------------------------------------------------
//  Rendering
// ---------------------------------------------------------------------------
function render(state) {
  const { trips, activeTrip } = state;
  el.tripName.textContent = activeTrip ? activeTrip.name : "＋ New trip";
  renderTrip(activeTrip);
  renderSegments(activeTrip);
  renderTripsList(trips, state.activeTripId);
}

function renderSegments(trip) {
  const segments = trip ? trip.segments : [];
  el.segmentsSummary.textContent = segments.length
    ? `${segments.length} leg${segments.length > 1 ? "s" : ""}`
    : "No legs yet";

  el.segmentsList.innerHTML = "";
  segments.forEach((seg) => {
    const mode = TRAVEL_MODES[seg.mode] || {};
    const li = document.createElement("li");
    li.className = "segment-row";
    li.innerHTML = `
      <span class="dot" style="background:${seg.style.color}"></span>
      <div class="seg-main">
        <div class="seg-text">${mode.emoji || ""} ${escapeHtml(seg.start.name)} → ${escapeHtml(seg.end.name)}</div>
        <div class="seg-meta">${escapeHtml(segMeta(seg, mode))}</div>
      </div>
      <button class="icon-btn small seg-del" aria-label="Delete leg">🗑</button>
    `;
    li.querySelector(".seg-del").addEventListener("click", async () => {
      if (confirm("Delete this leg?")) await store.removeSegment(trip.id, seg.id);
    });
    el.segmentsList.appendChild(li);
  });
}

// The small grey line under each leg: times + summary/duration.
function segMeta(seg, mode) {
  const parts = [];
  const dep = seg.schedule?.departureTime;
  const arr = seg.schedule?.arrivalTime;
  if (dep && arr) parts.push(`${dep} → ${arr}`);
  else if (dep) parts.push(`dep ${dep}`);

  if (seg.schedule?.summary) parts.push(seg.schedule.summary);
  else if (seg.info?.duration) parts.push(seg.info.duration);
  else if (mode.routable && !mode.chooseOption && seg.routeSource === "straight") parts.push("routing…");
  else if (!mode.routable) parts.push("straight line");

  return parts.join(" · ");
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
        <span class="trip-row-meta">${trip.segments.length} leg${trip.segments.length === 1 ? "" : "s"}${trip.date ? " · " + escapeHtml(trip.date) : ""}</span>
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
  el.btnSave.addEventListener("click", () => handleAdd());

  el.tripDate.addEventListener("change", async () => {
    const trip = store.getActiveTrip();
    if (trip) await store.setTripDate(trip.id, el.tripDate.value);
    clearTransitOptions();
  });
  el.depTime.addEventListener("change", () => {
    pending.departureTime = el.depTime.value || pending.departureTime;
    clearTransitOptions();
  });

  el.segmentsHandle.addEventListener("click", () => el.panel.classList.toggle("collapsed"));
  el.scrim.addEventListener("click", () => closeAll());
}

// ---------------------------------------------------------------------------
//  Trip flows
// ---------------------------------------------------------------------------
async function newTripFlow() {
  const name = prompt("Name your trip:", "My trip");
  if (name === null) return;
  await store.createTrip(name);
  closeAll();
}

async function ensureActiveTrip() {
  if (store.getActiveTrip()) return true;
  const name = prompt("First, name your trip:", "My trip");
  if (name === null) return false;
  await store.createTrip(name);
  return true;
}

// ---------------------------------------------------------------------------
//  Add-leg flow
// ---------------------------------------------------------------------------
async function openAddSheet() {
  if (!(await ensureActiveTrip())) return;
  const trip = store.getActiveTrip();
  const last = trip.segments[trip.segments.length - 1];

  // Journey date (persist a default of today if unset).
  el.tripDate.value = trip.date || isoDate(new Date());
  if (!trip.date) await store.setTripDate(trip.id, el.tripDate.value);

  pending = {
    start: last ? last.end : null,
    end: null,
    mode: DEFAULT_MODE,
    departureTime: last?.schedule?.arrivalTime || last?.schedule?.departureTime || "09:00",
  };
  el.depTime.value = pending.departureTime;

  buildModeChips();
  clearTransitOptions();
  await setupStartField(!!last);
  await rebuildEndInput();
  updateSaveState();

  showScrim();
  el.addSheet.classList.add("open");
}

// "From" is a fixed chip when chaining (tap to change), else a place search.
async function setupStartField(chaining) {
  el.startSlot.innerHTML = "";
  if (chaining && pending.start) {
    el.startChip.hidden = false;
    el.startSlot.hidden = true;
    el.startChip.innerHTML =
      `<span class="from-chip-text">From: <strong>${escapeHtml(pending.start.name)}</strong></span>` +
      `<button class="link-btn" id="change-start">change</button>`;
    el.startChip.querySelector("#change-start").addEventListener("click", async () => {
      pending.start = null;
      updateSaveState();
      el.startChip.hidden = true;
      el.startSlot.hidden = false;
      el.startSlot.innerHTML = "";
      await createPlaceInput(el.startSlot, {
        placeholder: "Start point",
        onPick: (p) => { pending.start = p; updateSaveState(); },
      });
    });
  } else {
    el.startChip.hidden = true;
    el.startSlot.hidden = false;
    await createPlaceInput(el.startSlot, {
      placeholder: "Start point",
      onPick: (p) => { pending.start = p; updateSaveState(); },
    });
  }
}

async function rebuildEndInput() {
  el.endSlot.innerHTML = "";
  await createPlaceInput(el.endSlot, {
    placeholder: "End point",
    onPick: (p) => { pending.end = p; updateSaveState(); },
  });
}

function buildModeChips() {
  el.modeChips.innerHTML = "";
  PICKER_MODES.forEach((key) => {
    const mode = TRAVEL_MODES[key];
    const chip = document.createElement("button");
    chip.className = "chip" + (key === pending.mode ? " selected" : "");
    chip.innerHTML = `${mode.emoji} ${mode.label}`;
    chip.addEventListener("click", () => {
      pending.mode = key;
      [...el.modeChips.children].forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      clearTransitOptions();
      updateSaveState();
    });
    el.modeChips.appendChild(chip);
  });
}

function updateSaveState() {
  const mode = TRAVEL_MODES[pending.mode];
  el.btnSave.disabled = !(pending.start && pending.end);
  el.btnSave.textContent = mode?.chooseOption ? "Find routes" : "Add leg";
}

// The main action: public transport → show options; everything else → add now.
async function handleAdd() {
  const trip = store.getActiveTrip();
  if (!trip || !pending.start || !pending.end) return;
  pending.departureTime = el.depTime.value || pending.departureTime;

  if (TRAVEL_MODES[pending.mode].chooseOption) await showTransitOptions();
  else await addRoutedLeg();
}

async function showTransitOptions() {
  const trip = store.getActiveTrip();
  const depAt = toDateTime(el.tripDate.value, pending.departureTime);
  setBusy("Finding routes…");
  try {
    const options = await computeTransitOptions(pending.start, pending.end, depAt);
    renderTransitOptions(options);
  } catch (err) {
    el.transitOptions.hidden = false;
    el.transitOptions.innerHTML =
      `<div class="opt-empty">No public-transport route found for that time (${escapeHtml(err?.message || "error")}).</div>`;
  } finally {
    setBusy(null);
  }
}

function renderTransitOptions(options) {
  el.transitOptions.hidden = false;
  if (!options.length) {
    el.transitOptions.innerHTML = `<div class="opt-empty">No public-transport route found for that time.</div>`;
    return;
  }
  el.transitOptions.innerHTML = `<div class="opt-title">Choose a route</div>`;
  options.forEach((opt) => {
    const card = document.createElement("button");
    card.className = "opt-card";
    card.innerHTML = `
      <div class="opt-row1">
        <span class="opt-icons">${opt.icons}</span>
        <span class="opt-dur">${escapeHtml(opt.durationText)}</span>
      </div>
      <div class="opt-row2">${escapeHtml(opt.departText)} → ${escapeHtml(opt.arriveText)} · ${escapeHtml(opt.summary)}</div>`;
    card.addEventListener("click", () => addChosenOption(opt));
    el.transitOptions.appendChild(card);
  });
}

async function addRoutedLeg() {
  const trip = store.getActiveTrip();
  const color = nextColor(trip);
  const mode = TRAVEL_MODES[pending.mode];
  const depAt = toDateTime(el.tripDate.value, pending.departureTime);
  setBusy("Adding leg…");
  try {
    let extra = { departureTime: pending.departureTime };
    if (mode.routable) {
      const routed = await routeOne(pending.start, pending.end, pending.mode, depAt);
      extra = {
        path: routed.path, routeSource: "directions", info: routed.info,
        departureTime: routed.schedule.departureTime, arrivalTime: routed.schedule.arrivalTime,
      };
    }
    await store.addSegment(trip.id, { start: pending.start, end: pending.end, mode: pending.mode, color, ...extra });
    await chainNext(pending.end, extra.arrivalTime || null);
  } catch (err) {
    console.warn("Leg routing failed, adding straight line:", err?.message || err);
    await store.addSegment(trip.id, {
      start: pending.start, end: pending.end, mode: pending.mode, color, departureTime: pending.departureTime,
    });
    await chainNext(pending.end, null);
  } finally {
    setBusy(null);
  }
}

async function addChosenOption(opt) {
  const trip = store.getActiveTrip();
  const color = nextColor(trip);
  await store.addSegment(trip.id, {
    start: pending.start, end: pending.end, mode: "transit", color,
    path: opt.path, routeSource: "directions", info: opt.info,
    departureTime: opt.schedule.departureTime, arrivalTime: opt.schedule.arrivalTime,
    legs: opt.schedule.legs, summary: opt.schedule.summary,
  });
  await chainNext(pending.end, opt.schedule.arrivalTime);
}

// Prepare the sheet for the next leg: start = previous end, time = its arrival.
async function chainNext(newStart, arrival) {
  pending.start = newStart;
  pending.end = null;
  pending.departureTime = arrival || pending.departureTime;
  el.depTime.value = pending.departureTime;
  clearTransitOptions();
  await setupStartField(true);
  await rebuildEndInput();
  updateSaveState();
  el.panel.classList.remove("collapsed"); // reveal the growing list
  flashTitle("Leg added ✓");
}

function nextColor(trip) {
  return SEGMENT_COLORS[trip.segments.length % SEGMENT_COLORS.length];
}

// ---------------------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------------------
function setBusy(text) {
  if (text) {
    el.btnSave.disabled = true;
    el.btnSave.textContent = text;
  } else {
    updateSaveState();
  }
}

function clearTransitOptions() {
  el.transitOptions.hidden = true;
  el.transitOptions.innerHTML = "";
}

let titleTimer;
function flashTitle(msg) {
  el.addTitle.textContent = msg;
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => { el.addTitle.textContent = "Add leg"; }, 1600);
}

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
  clearTransitOptions();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
