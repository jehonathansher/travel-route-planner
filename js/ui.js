// ============================================================================
//  UI  —  the itinerary (days + places) and the add/edit-place sheet.
// ----------------------------------------------------------------------------
//  The store is the single source of truth; we subscribe once and redraw on any
//  change (so edits on your phone show up here and vice-versa).
// ============================================================================

import { MODES, DAY_COLORS, DEFAULT_MODE } from "./model.js";
import { createPlaceInput } from "./places.js";
import { renderTrip } from "./map.js";
import * as store from "./store.js";

const $ = (id) => document.getElementById(id);
const el = {
  tripName: $("trip-name"),
  btnTrips: $("btn-trips"),
  panel: $("itinerary"),
  panelHandle: $("panel-handle"),
  walkTotal: $("walk-total"),
  days: $("days"),
  btnAddDay: $("btn-add-day"),
  drawer: $("trips-drawer"),
  btnCloseTrips: $("btn-close-trips"),
  btnNewTrip: $("btn-new-trip"),
  tripsList: $("trips-list"),
  addSheet: $("add-sheet"),
  addTitle: $("add-title"),
  editNote: $("edit-note"),
  btnCloseAdd: $("btn-close-add"),
  placeSlot: $("place-input"),
  modeBlock: $("mode-block"),
  modeToggle: $("mode-toggle"),
  btnSavePlace: $("btn-save-place"),
  scrim: $("scrim"),
};

// Context for the add/edit-place sheet.
let addCtx = { dayId: null, editPlaceId: null, isFirst: false, place: null, mode: DEFAULT_MODE };

export function initUI() {
  bindEvents();
  store.onChange(render);
}

// ---------------------------------------------------------------------------
//  Render
// ---------------------------------------------------------------------------
function render(state) {
  const { trips, activeTrip } = state;
  el.tripName.textContent = activeTrip ? activeTrip.name : "＋ New trip";
  renderTrip(activeTrip);
  renderItinerary(activeTrip);
  renderWalkTotal(activeTrip);
  renderTripsList(trips, state.activeTripId);
}

function renderWalkTotal(trip) {
  let km = 0, min = 0, places = 0;
  (trip?.days || []).forEach((day) => {
    if (day.visible === false) return;
    day.places.forEach((p, i) => {
      places++;
      if (i > 0 && p.mode === "walk") {
        km += p.info?.km || 0;
        min += p.info?.minutes || 0;
      }
    });
  });
  el.walkTotal.textContent = places
    ? `🚶 ${km.toFixed(1)} km · ${min} min walking`
    : "No places yet — tap a day to add one";
}

function renderItinerary(trip) {
  el.days.innerHTML = "";
  if (!trip) return;

  trip.days.forEach((day) => {
    const dayEl = document.createElement("div");
    dayEl.className = "day";

    // ---- Day header ----
    const header = document.createElement("div");
    header.className = "day-header";
    const walkKm = day.places.reduce((a, p, i) => a + (i > 0 && p.mode === "walk" ? (p.info?.km || 0) : 0), 0);
    header.innerHTML = `
      <button class="day-color" style="background:${day.color}" aria-label="Change colour"></button>
      <button class="day-name">${escapeHtml(day.name)}</button>
      <span class="day-sub">${day.places.length} place${day.places.length === 1 ? "" : "s"}${walkKm ? ` · 🚶 ${walkKm.toFixed(1)} km` : ""}</span>
      <button class="day-eye icon-btn small" aria-label="Show/hide">${day.visible === false ? "🙈" : "👁"}</button>
      <button class="day-del icon-btn small" aria-label="Delete day">🗑</button>
    `;
    header.querySelector(".day-color").addEventListener("click", (e) => openColorPicker(trip.id, day, e.currentTarget));
    header.querySelector(".day-name").addEventListener("click", async () => {
      const name = prompt("Rename day:", day.name);
      if (name && name.trim()) await store.updateDay(trip.id, day.id, { name: name.trim() });
    });
    header.querySelector(".day-eye").addEventListener("click", () =>
      store.updateDay(trip.id, day.id, { visible: day.visible === false })
    );
    header.querySelector(".day-del").addEventListener("click", async () => {
      if (confirm(`Delete "${day.name}" and its places?`)) await store.removeDay(trip.id, day.id);
    });
    dayEl.appendChild(header);

    // ---- Places ----
    const list = document.createElement("ul");
    list.className = "places";
    if (!day.places.length) {
      const empty = document.createElement("li");
      empty.className = "place-empty";
      empty.textContent = "No places yet.";
      list.appendChild(empty);
    }
    day.places.forEach((place, i) => list.appendChild(placeRow(trip.id, day, place, i)));
    dayEl.appendChild(list);

    // ---- Add place ----
    const add = document.createElement("button");
    add.className = "add-place-btn";
    add.textContent = day.places.length ? "＋ Add next place" : "＋ Add starting place";
    add.addEventListener("click", () => openAddSheet(trip.id, day.id));
    dayEl.appendChild(add);

    el.days.appendChild(dayEl);
  });
}

function placeRow(tripId, day, place, i) {
  const mode = MODES[place.mode] || MODES.walk;
  const li = document.createElement("li");
  li.className = "place-row";

  // Travel line (how you get here) — blank for the first place.
  let travel = "";
  if (i > 0) {
    const time = place.info?.minutes != null ? `${place.info.minutes} min` : "…";
    const dist = place.info?.km != null ? ` · ${place.info.km} km` : "";
    travel = `<button class="place-travel" title="Tap to switch Walk / Transport">${mode.emoji} ${time}${dist}</button>`;
  } else {
    travel = `<span class="place-travel start">start</span>`;
  }

  li.innerHTML = `
    <span class="place-num" style="background:${day.color}">${i + 1}</span>
    <div class="place-main">
      <button class="place-name">${escapeHtml(place.name)}</button>
      ${travel}
    </div>
    <div class="place-actions">
      <button class="mv icon-btn small" data-dir="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>▲</button>
      <button class="mv icon-btn small" data-dir="1" aria-label="Move down" ${i === day.places.length - 1 ? "disabled" : ""}>▼</button>
      <button class="del icon-btn small" aria-label="Delete place">🗑</button>
    </div>
  `;

  li.querySelector(".place-name").addEventListener("click", () => openAddSheet(tripId, day.id, place, i));
  const tBtn = li.querySelector(".place-travel");
  if (i > 0 && tBtn) tBtn.addEventListener("click", () =>
    store.updatePlace(tripId, day.id, place.id, { mode: place.mode === "walk" ? "transport" : "walk", routeKey: null })
  );
  li.querySelectorAll(".mv").forEach((b) =>
    b.addEventListener("click", () => store.movePlace(tripId, day.id, place.id, Number(b.dataset.dir)))
  );
  li.querySelector(".del").addEventListener("click", async () => {
    if (confirm(`Remove "${place.name}"?`)) await store.removePlace(tripId, day.id, place.id);
  });
  return li;
}

function renderTripsList(trips, activeTripId) {
  el.tripsList.innerHTML = "";
  if (!trips.length) {
    const li = document.createElement("li");
    li.className = "trips-empty";
    li.textContent = "No trips yet. Create your first one above.";
    el.tripsList.appendChild(li);
    return;
  }
  trips.forEach((trip) => {
    const placeCount = (trip.days || []).reduce((a, d) => a + d.places.length, 0);
    const li = document.createElement("li");
    li.className = "trip-row" + (trip.id === activeTripId ? " active" : "");
    li.innerHTML = `
      <button class="trip-pick">
        <span class="trip-row-name">${escapeHtml(trip.name)}</span>
        <span class="trip-row-meta">${trip.days.length} day${trip.days.length === 1 ? "" : "s"} · ${placeCount} place${placeCount === 1 ? "" : "s"}</span>
      </button>
      <button class="icon-btn small trip-del" aria-label="Delete trip">🗑</button>
    `;
    li.querySelector(".trip-pick").addEventListener("click", async () => {
      await store.setActiveTrip(trip.id);
      closeAll();
    });
    li.querySelector(".trip-del").addEventListener("click", async () => {
      if (confirm(`Delete trip "${trip.name}"? This cannot be undone.`)) await store.deleteTrip(trip.id);
    });
    el.tripsList.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
//  Events
// ---------------------------------------------------------------------------
function bindEvents() {
  el.tripName.addEventListener("click", async () => {
    const active = store.getActiveTrip();
    if (!active) return newTripFlow();
    const name = prompt("Rename trip:", active.name);
    if (name && name.trim()) await store.renameTrip(active.id, name);
  });
  el.btnTrips.addEventListener("click", () => { showScrim(); el.drawer.classList.add("open"); });
  el.btnCloseTrips.addEventListener("click", () => closeAll());
  el.btnNewTrip.addEventListener("click", () => newTripFlow());
  el.btnAddDay.addEventListener("click", async () => {
    const trip = store.getActiveTrip();
    if (trip) { await store.addDay(trip.id); el.panel.classList.remove("collapsed"); }
  });
  el.btnCloseAdd.addEventListener("click", () => closeAll());
  el.btnSavePlace.addEventListener("click", () => savePlace());
  el.panelHandle.addEventListener("click", () => el.panel.classList.toggle("collapsed"));
  el.scrim.addEventListener("click", () => closeAll());
}

async function newTripFlow() {
  const name = prompt("Name your trip:", "My trip");
  if (name === null) return;
  await store.createTrip(name);
  closeAll();
  el.panel.classList.remove("collapsed");
}

// ---------------------------------------------------------------------------
//  Add / edit a place
// ---------------------------------------------------------------------------
async function openAddSheet(tripId, dayId, editPlace = null, index = null) {
  const trip = store.getActiveTrip();
  const day = trip?.days.find((d) => d.id === dayId);
  const isFirst = editPlace ? index === 0 : (day && day.places.length === 0);

  addCtx = {
    dayId,
    editPlaceId: editPlace?.id || null,
    isFirst,
    place: null, // a NEW place picked from search (null = keep existing when editing)
    mode: editPlace?.mode || DEFAULT_MODE,
  };

  el.addTitle.textContent = editPlace ? "Change place" : (isFirst ? "Starting place" : "Add place");
  el.editNote.hidden = !editPlace;
  if (editPlace) el.editNote.textContent = `Now: ${editPlace.name} — search to move it, or just switch how you get there.`;

  // The first place in a day has no "how do you get here".
  el.modeBlock.hidden = isFirst;
  if (!isFirst) buildModeToggle();

  el.placeSlot.innerHTML = "";
  await createPlaceInput(el.placeSlot, {
    placeholder: editPlace ? editPlace.name : "Search a place",
    onPick: (p) => { addCtx.place = p; updateSaveState(); },
  });

  updateSaveState();
  showScrim();
  el.addSheet.classList.add("open");
}

function buildModeToggle() {
  el.modeToggle.innerHTML = "";
  ["walk", "transport"].forEach((key) => {
    const mode = MODES[key];
    const btn = document.createElement("button");
    btn.className = "chip" + (key === addCtx.mode ? " selected" : "");
    btn.innerHTML = `${mode.emoji} ${mode.label}`;
    btn.addEventListener("click", () => {
      addCtx.mode = key;
      [...el.modeToggle.children].forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
    });
    el.modeToggle.appendChild(btn);
  });
}

function updateSaveState() {
  // New place: need a search result. Editing: OK even without one (change mode only).
  el.btnSavePlace.disabled = !(addCtx.place || addCtx.editPlaceId);
  el.btnSavePlace.textContent = addCtx.editPlaceId ? "Save" : "Add place";
}

async function savePlace() {
  const trip = store.getActiveTrip();
  if (!trip) return;

  if (addCtx.editPlaceId) {
    const patch = { mode: addCtx.isFirst ? undefined : addCtx.mode };
    if (addCtx.place) Object.assign(patch, {
      name: addCtx.place.name, placeId: addCtx.place.placeId,
      lat: addCtx.place.lat, lng: addCtx.place.lng,
    });
    // Recompute the route for this place (its start/end/mode may have changed).
    patch.routeKey = null;
    // Drop undefined keys (Firestore rejects them).
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    await store.updatePlace(trip.id, addCtx.dayId, addCtx.editPlaceId, patch);
    closeAll();
    return;
  }

  if (!addCtx.place) return;
  await store.addPlace(trip.id, addCtx.dayId, {
    name: addCtx.place.name, placeId: addCtx.place.placeId,
    lat: addCtx.place.lat, lng: addCtx.place.lng,
    mode: addCtx.isFirst ? DEFAULT_MODE : addCtx.mode,
  });

  // Chain: keep the sheet open, ready for the next place in this day.
  addCtx.place = null;
  addCtx.isFirst = false;
  el.modeBlock.hidden = false;
  buildModeToggle();
  el.addTitle.textContent = "Add place";
  el.editNote.hidden = true;
  el.placeSlot.innerHTML = "";
  await createPlaceInput(el.placeSlot, {
    placeholder: "Search the next place",
    onPick: (p) => { addCtx.place = p; updateSaveState(); },
  });
  updateSaveState();
  el.panel.classList.remove("collapsed");
  flashTitle("Added ✓");
}

// ---------------------------------------------------------------------------
//  Day colour picker (small popover)
// ---------------------------------------------------------------------------
function openColorPicker(tripId, day, anchor) {
  document.querySelectorAll(".color-pop").forEach((n) => n.remove());
  const pop = document.createElement("div");
  pop.className = "color-pop";
  DAY_COLORS.forEach((color) => {
    const b = document.createElement("button");
    b.className = "color-dot" + (color === day.color ? " on" : "");
    b.style.background = color;
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      await store.updateDay(tripId, day.id, { color });
      pop.remove();
    });
    pop.appendChild(b);
  });
  anchor.parentElement.appendChild(pop);
  setTimeout(() => document.addEventListener("click", function h() {
    pop.remove(); document.removeEventListener("click", h);
  }), 0);
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
let titleTimer;
function flashTitle(msg) {
  el.addTitle.textContent = msg;
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => { el.addTitle.textContent = "Add place"; }, 1400);
}
function showScrim() { el.scrim.classList.add("show"); }
function closeAll() {
  el.drawer.classList.remove("open");
  el.addSheet.classList.remove("open");
  el.scrim.classList.remove("show");
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
