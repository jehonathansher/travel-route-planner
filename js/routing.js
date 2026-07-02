// ============================================================================
//  ROUTING (Phase 2 + scheduling)  —  real routes, times, and transit options.
// ----------------------------------------------------------------------------
//  • routeOne()            → the real route for one leg (walk/drive/transit),
//                            plus arrival time given a departure time.
//  • computeTransitOptions → several "Public transport" alternatives to choose
//                            from, like Google Maps (Tube vs Bus vs …).
//  • initRouting()         → auto-upgrades any leftover straight segments
//                            (e.g. ones created before routing existed).
//
//  Note: google.maps.DirectionsService is "legacy" but still works and gets bug
//  fixes; the eventual replacement is google.maps.routes.Route.computeRoutes.
// ============================================================================

import { TRAVEL_MODES } from "./model.js";
import * as store from "./store.js";

const attempted = new Set(); // straight segments we've already auto-routed

// ---- Auto-upgrade any straight segments left in the active trip ------------
export function initRouting() {
  store.onChange(ensureRoutes);
}

async function ensureRoutes() {
  const trip = store.getActiveTrip();
  if (!trip) return;

  for (const seg of trip.segments) {
    if (seg.routeSource !== "straight") continue;      // already routed / manual
    const mode = TRAVEL_MODES[seg.mode];
    if (!mode || !mode.routable) continue;             // boat: keep straight
    if (mode.chooseOption) continue;                   // public transport: you pick
    if (attempted.has(seg.id)) continue;

    attempted.add(seg.id);
    try {
      const dep = seg.schedule?.departureTime
        ? toDateTime(trip.date, seg.schedule.departureTime) : null;
      const routed = await routeOne(seg.start, seg.end, seg.mode, dep);
      await store.updateSegment(trip.id, seg.id, {
        path: routed.path,
        routeSource: "directions",
        info: routed.info,
        schedule: { ...seg.schedule, arrivalTime: routed.schedule.arrivalTime },
      });
    } catch (err) {
      console.warn(`Routing failed (${seg.mode}):`, err?.message || err);
    }
  }
}

// ---- The real route for a single leg ---------------------------------------
// Returns { path, routeSource, info:{distance,duration}, schedule:{departureTime,arrivalTime} }
export async function routeOne(start, end, modeKey, departureDateTime) {
  const mode = TRAVEL_MODES[modeKey];
  const service = new google.maps.DirectionsService();

  const request = {
    origin: { lat: start.lat, lng: start.lng },
    destination: { lat: end.lat, lng: end.lng },
    travelMode: mode.google, // "WALKING" | "DRIVING" | "TRANSIT"
  };
  if (mode.google === "TRANSIT") {
    const transitMode = mode.transit && google.maps.TransitMode[mode.transit];
    request.transitOptions = {
      departureTime: departureDateTime || new Date(),
      ...(transitMode ? { modes: [transitMode] } : {}),
    };
  }

  const response = await service.route(request);
  const route = response.routes[0];
  const leg = route.legs[0];
  const path = route.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));

  // Arrival = departure + travel time (for transit, use Google's actual times).
  let arrivalTime = null;
  if (leg.arrival_time?.value) {
    arrivalTime = fmtTime(leg.arrival_time.value);
  } else if (departureDateTime && leg.duration?.value != null) {
    arrivalTime = fmtTime(new Date(departureDateTime.getTime() + leg.duration.value * 1000));
  }

  return {
    path,
    routeSource: "directions",
    info: { distance: leg.distance?.text ?? null, duration: leg.duration?.text ?? null },
    schedule: {
      departureTime: departureDateTime ? fmtTime(departureDateTime) : null,
      arrivalTime,
    },
  };
}

// ---- Public transport: several options to choose from ----------------------
export async function computeTransitOptions(start, end, departureDateTime) {
  const service = new google.maps.DirectionsService();
  const response = await service.route({
    origin: { lat: start.lat, lng: start.lng },
    destination: { lat: end.lat, lng: end.lng },
    travelMode: "TRANSIT",
    transitOptions: { departureTime: departureDateTime || new Date() },
    provideRouteAlternatives: true,
  });
  return response.routes.map((route) => optionFromRoute(route, departureDateTime));
}

function optionFromRoute(route, departureDateTime) {
  const leg = route.legs[0];
  const path = route.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));

  // Pull out the transit steps (bus/tube/train segments) for a readable summary.
  const transitSteps = (leg.steps || []).filter((s) => s.travel_mode === "TRANSIT" && s.transit);
  const legs = transitSteps.map((s) => {
    const line = s.transit.line || {};
    return {
      vehicle: line.vehicle?.name || line.vehicle?.type || "Transit",
      icon: vehicleEmoji(line.vehicle?.type, line.vehicle?.name),
      name: line.short_name || line.name || "",
      from: s.transit.departure_stop?.name || "",
      to: s.transit.arrival_stop?.name || "",
      depart: s.transit.departure_time?.text || "",
      arrive: s.transit.arrival_time?.text || "",
    };
  });

  const icons = transitSteps.length
    ? transitSteps.map((s) => vehicleEmoji(s.transit.line?.vehicle?.type, s.transit.line?.vehicle?.name)).join(" ")
    : "🚶";
  const summary = legs.map((l) => l.name || l.vehicle).filter(Boolean).join(" → ") || "Walk only";

  const departDate = leg.departure_time?.value || departureDateTime || new Date();
  const arriveDate = leg.arrival_time?.value || null;

  return {
    path,
    icons,
    summary,
    durationText: leg.duration?.text || "",
    departText: fmtTime(departDate),
    arriveText: arriveDate ? fmtTime(arriveDate) : "",
    // Stored on the segment when this option is chosen:
    schedule: {
      departureTime: fmtTime(departDate),
      arrivalTime: arriveDate ? fmtTime(arriveDate) : null,
      legs,
      summary,
    },
    info: { distance: leg.distance?.text ?? null, duration: leg.duration?.text ?? null },
  };
}

function vehicleEmoji(type = "", name = "") {
  const s = `${type} ${name}`.toLowerCase();
  if (/subway|metro/.test(s)) return "🚇";
  if (/bus/.test(s)) return "🚌";
  if (/tram|light_rail|streetcar/.test(s)) return "🚊";
  if (/ferry|boat/.test(s)) return "⛴️";
  if (/train|rail|heavy/.test(s)) return "🚆";
  return "🚉";
}

// ---- date/time helpers (shared with the UI) --------------------------------
export function toDateTime(dateStr, timeStr) {
  const now = new Date();
  const [y, m, d] = (dateStr || isoDate(now)).split("-").map(Number);
  const [hh, mm] = (timeStr || "09:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}
export function fmtTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
