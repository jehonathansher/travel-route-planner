// ============================================================================
//  DATA MODEL  —  a Trip is made of Days; a Day is an ordered list of Places.
// ----------------------------------------------------------------------------
//  Trip
//    └─ days[]
//         └─ Day { name, color, visible, places[] }
//              └─ Place { name, lat, lng, mode, path, info }
//
//  "mode" on a place is how you travel to it FROM THE PREVIOUS PLACE:
//     "walk"      → the real walking route (solid line)
//     "transport" → the shortest road route (translucent line)
//  The first place in a day has no route (nothing before it).
// ============================================================================

// The only two ways to travel between places.
export const MODES = {
  walk:      { label: "Walk",      emoji: "🚶", google: "WALKING" },
  transport: { label: "Transport", emoji: "🚌", google: "DRIVING", translucent: true },
};
export const DEFAULT_MODE = "walk";

// Colours a day's routes are drawn in. New days pick the next unused one.
export const DAY_COLORS = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#d97706", // amber
  "#7c3aed", // purple
  "#0891b2", // teal
  "#db2777", // pink
  "#4b5563", // grey
];

// A place you visit. `mode` = how you got here from the previous place.
export function makePlace({ name = "", placeId = null, lat, lng, mode = DEFAULT_MODE }) {
  return {
    id: crypto.randomUUID(),
    name,
    placeId,
    lat,
    lng,
    mode,
    // The route from the previous place to here (filled in by routing.js).
    path: [],
    // Rough estimate for that route.
    info: { km: null, minutes: null },
    // Lets routing know when the route is stale (start/end/mode changed).
    routeKey: null,
  };
}

// A day: an ordered list of places, with its own colour + show/hide.
export function makeDay({ name, color }) {
  return {
    id: crypto.randomUUID(),
    name: name || "Day 1",
    color: color || DAY_COLORS[0],
    visible: true,
    places: [],
  };
}

// A fresh trip always starts with one empty day.
export function makeTrip({ name }) {
  return {
    name,
    days: [makeDay({ name: "Day 1", color: DAY_COLORS[0] })],
    // createdAt / updatedAt are added by the store using Firestore timestamps.
  };
}

// ---------------------------------------------------------------------------
//  Migration: turn an OLD trip (flat list of segments) into the days/places
//  shape, so trips created before this redesign keep working.
// ---------------------------------------------------------------------------
export function migrateTrip(data) {
  if (data.days) return data; // already new shape
  const segments = data.segments || [];

  const places = [];
  if (segments.length) {
    // First place = the very first segment's start (no route to it).
    const s0 = segments[0].start;
    places.push(makePlace({ name: s0.name, placeId: s0.placeId, lat: s0.lat, lng: s0.lng }));
    // Each segment's end becomes the next place, keeping its route + mode.
    for (const seg of segments) {
      const p = makePlace({
        name: seg.end.name, placeId: seg.end.placeId, lat: seg.end.lat, lng: seg.end.lng,
        mode: seg.mode === "walk" ? "walk" : "transport",
      });
      if (Array.isArray(seg.path) && seg.path.length > 1) p.path = seg.path;
      places.push(p);
    }
  }

  const day = makeDay({ name: "Day 1", color: DAY_COLORS[0] });
  day.places = places;
  return { ...data, days: [day] };
}
