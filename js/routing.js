// ============================================================================
//  ROUTING (Phase 2)  —  turn each segment's straight line into the REAL route.
// ----------------------------------------------------------------------------
//  For every segment whose line is still a straight "as the crow flies" line,
//  we ask Google for the actual route for that travel mode (walking path,
//  driving roads, or the real bus/tube/train route) and save it back into the
//  segment's `path`. Because the result is stored, we only call Google once per
//  segment (cheap + fast on later loads).
//
//  Note: google.maps.DirectionsService is marked "legacy" by Google but still
//  fully works and receives bug fixes. If it's ever discontinued, the drop-in
//  replacement is google.maps.routes.Route.computeRoutes (see migration guide).
// ============================================================================

import { TRAVEL_MODES } from "./model.js";
import * as store from "./store.js";

// Segment ids we've already tried this session, so we never double-request
// (or spin forever on a mode/time that has no route).
const attempted = new Set();

// Start watching the store; whenever trips change, fill in any missing routes.
export function initRouting() {
  store.onChange(ensureRoutes);
}

function ensureRoutes() {
  const trip = store.getActiveTrip();
  if (!trip) return;

  for (const seg of trip.segments) {
    // Only segments that are still a plain straight line need routing.
    // ("directions" = already routed, "manual" = you hand-drew it in Phase 3.)
    if (seg.routeSource !== "straight") continue;

    const mode = TRAVEL_MODES[seg.mode];
    if (!mode || !mode.routable) continue; // e.g. boat: keep the straight line
    if (attempted.has(seg.id)) continue;

    attempted.add(seg.id);
    routeSegment(trip.id, seg); // fire-and-forget; updates the store when done
  }
}

async function routeSegment(tripId, seg) {
  try {
    const result = await computeRoute(seg);
    if (result && result.path.length > 1) {
      await store.updateSegment(tripId, seg.id, {
        path: result.path,
        routeSource: "directions",
        info: result.info,
      });
    }
  } catch (err) {
    // No route (e.g. tube not running at this time, or no transit data here).
    // Leave the straight line in place; we simply won't retry it this session.
    console.warn(`Routing failed for "${seg.start.name} → ${seg.end.name}" (${seg.mode}):`, err?.message || err);
  }
}

// Ask Google for the real route and return { path:[{lat,lng}], info:{...} }.
function computeRoute(seg) {
  const mode = TRAVEL_MODES[seg.mode];
  const service = new google.maps.DirectionsService();

  const request = {
    origin: { lat: seg.start.lat, lng: seg.start.lng },
    destination: { lat: seg.end.lat, lng: seg.end.lng },
    travelMode: mode.google, // "WALKING" | "DRIVING" | "TRANSIT"
  };

  // For bus/tube/train, ask for that specific kind of transit, leaving now.
  // (Phase 4 will let you change the departure time.)
  if (mode.google === "TRANSIT") {
    const transitMode = mode.transit && google.maps.TransitMode[mode.transit];
    request.transitOptions = {
      departureTime: new Date(),
      ...(transitMode ? { modes: [transitMode] } : {}),
    };
  }

  return service.route(request).then((response) => {
    const route = response.routes[0];
    if (!route) return null;

    // overview_path is the full route as a list of points, following the real
    // roads / rails / walking paths (not a straight line).
    const path = route.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() }));

    // Sum distance/time across legs for a quick "how long" estimate.
    const legs = route.legs || [];
    const info = {
      distance: legs[0]?.distance?.text ?? null,
      duration: legs[0]?.duration?.text ?? null,
    };
    return { path, info };
  });
}
