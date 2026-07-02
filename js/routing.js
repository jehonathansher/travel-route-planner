// ============================================================================
//  ROUTING  —  draw the real route to each place and estimate km + minutes.
// ----------------------------------------------------------------------------
//  Walk      → the real walking route (WALKING).
//  Transport → the shortest road route (DRIVING), drawn translucent.
//
//  We watch the trip and (re)compute a place's route whenever its start, end,
//  or mode changes — so editing a place or reordering places just works. Each
//  place remembers a "routeKey" describing what its route was computed for; if
//  that no longer matches, we recompute it.
// ============================================================================

import { MODES } from "./model.js";
import * as store from "./store.js";

const inFlight = new Set(); // place ids currently being routed

export function initRouting() {
  store.onChange(ensureRoutes);
}

function ensureRoutes() {
  const trip = store.getActiveTrip();
  if (!trip) return;

  for (const day of trip.days) {
    day.places.forEach((place, i) => {
      if (inFlight.has(place.id)) return;

      // First place in a day has no route — make sure it's cleared.
      if (i === 0) {
        if (place.routeKey !== "FIRST" || (place.path && place.path.length)) {
          inFlight.add(place.id);
          store.updatePlace(trip.id, day.id, place.id, {
            path: [], info: { km: null, minutes: null }, routeKey: "FIRST",
          }).finally(() => inFlight.delete(place.id));
        }
        return;
      }

      const prev = day.places[i - 1];
      const key = routeKey(prev, place, place.mode);
      const upToDate = place.routeKey === key && place.path && place.path.length > 1;
      if (upToDate) return;

      inFlight.add(place.id);
      computeLeg(prev, place, place.mode)
        .then((result) =>
          store.updatePlace(trip.id, day.id, place.id, {
            path: result.path, info: result.info, routeKey: key,
          })
        )
        .catch((err) => console.warn("Routing failed:", err?.message || err))
        .finally(() => inFlight.delete(place.id));
    });
  }
}

// Ask Google for the route between two places and its distance/time.
async function computeLeg(prev, cur, modeKey) {
  const mode = MODES[modeKey] || MODES.walk;
  const service = new google.maps.DirectionsService();
  const response = await service.route({
    origin: { lat: prev.lat, lng: prev.lng },
    destination: { lat: cur.lat, lng: cur.lng },
    travelMode: mode.google, // "WALKING" | "DRIVING"
  });
  const route = response.routes[0];
  const leg = route.legs[0];
  return {
    path: route.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
    info: {
      km: leg.distance ? Number((leg.distance.value / 1000).toFixed(1)) : null,
      minutes: leg.duration ? Math.round(leg.duration.value / 60) : null,
    },
  };
}

// A short fingerprint of "what this route was computed for".
function routeKey(prev, cur, mode) {
  const r = (n) => Number(n).toFixed(5);
  return `${r(prev.lat)},${r(prev.lng)}>${r(cur.lat)},${r(cur.lng)}:${mode}`;
}
