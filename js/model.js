// ============================================================================
//  DATA MODEL  —  the shape of a Trip and a Segment, in one place.
// ----------------------------------------------------------------------------
//  Everything that defines "what a trip/segment is" lives here so the schema is
//  easy to find and extend. The factory functions below set sensible defaults,
//  including fields we are NOT using yet (line thickness, dash style, labels,
//  transit schedule) so they can be filled in later WITHOUT changing how data
//  is stored.  See README "Data model".
// ============================================================================

// All supported travel modes and their metadata.
//   • google   : the travelMode passed to the Google Directions service (Phase 2)
//   • transit  : for TRANSIT modes, the specific vehicle type (Phase 2/4)
//   • routable : false = there is no road/transit route, so we draw a straight
//                line (e.g. boat/ferry where Google has no data)
export const TRAVEL_MODES = {
  walk:    { label: "Walk",             emoji: "🚶", google: "WALKING", routable: true },
  // "Public transport" = let Google pick the best mix of bus/tube/train/etc.
  // and offer alternatives to choose from (chooseOption = show a picker).
  transit: { label: "Public transport", emoji: "🚆", google: "TRANSIT", routable: true, chooseOption: true },
  car:     { label: "Car",              emoji: "🚗", google: "DRIVING", routable: true },
  taxi:    { label: "Taxi",             emoji: "🚕", google: "DRIVING", routable: true },
  boat:    { label: "Boat",             emoji: "⛴️", google: "TRANSIT", transit: "FERRY", routable: false },
  // Kept so older segments (created before "Public transport") still render:
  train:   { label: "Train", emoji: "🚆", google: "TRANSIT", transit: "TRAIN",  routable: true },
  bus:     { label: "Bus",   emoji: "🚌", google: "TRANSIT", transit: "BUS",    routable: true },
  tube:    { label: "Tube",  emoji: "🚇", google: "TRANSIT", transit: "SUBWAY", routable: true },
};

// The modes shown as choices when adding a leg (a curated subset of the above).
export const PICKER_MODES = ["walk", "transit", "car", "taxi", "boat"];

export const DEFAULT_MODE = "walk";

// A "place" picked from Google Places search.
export function makePlace({ placeId = null, name = "", lat, lng }) {
  return { placeId, name, lat, lng };
}

// Create a fresh segment between two places.
//  start / end : objects from makePlace()
//  mode        : a key of TRAVEL_MODES
//  color       : hex string (assigned by the caller from the palette)
export function makeSegment({
  start, end, mode = DEFAULT_MODE, color = "#4363d8",
  // Optional overrides — used when we already have a real route (e.g. a chosen
  // public-transport option) so we don't start from a straight line.
  path = null, routeSource = "straight",
  departureTime = null, arrivalTime = null, legs = [], summary = null,
  info = null,
}) {
  return {
    id: crypto.randomUUID(),
    mode,
    start,
    end,

    // The drawn line as an explicit list of {lat,lng} points.
    //   • 2 points       = straight line (v1 default)
    //   • many points    = a real route from Google (Phase 2)
    //   • hand-edited     = your custom dragged path (Phase 3)
    // Storing every kind of line as the same "path" array means the renderer
    // and the storage never need to change as we add routing/dragging.
    path: path && path.length > 1 ? path : straightPath(start, end),
    // Where "path" came from: "straight" | "directions" | "manual".
    routeSource,

    // Visual style. Only "color" is used in v1. weight/dash/label are reserved
    // so they can be added later without restructuring stored data.
    style: {
      color,
      weight: null, // future: line thickness
      dash: null,   // future: "solid" | "dashed"
      label: null,  // future: text label on the segment
    },

    // Distance/time estimate from the routing engine (Phase 2). Populated once
    // the real route is fetched; used to show "12 mins" etc. in the UI.
    info: info || {
      distance: null, // e.g. "3.9 km"
      duration: null, // e.g. "56 mins"
    },

    // When this leg departs/arrives (Phase 4 scheduling). Times are "HH:MM"
    // strings, interpreted on the trip's date.
    schedule: {
      departureTime,       // "HH:MM" you want to leave
      arrivalTime,         // "HH:MM" you'll arrive (computed)
      legs,                // transit legs: [{ vehicle, line, from, to, depart, arrive }]
      summary,             // e.g. "Victoria line → Bakerloo line"
    },
  };
}

// Create a fresh, empty trip. `date` is the day of the journey ("YYYY-MM-DD").
export function makeTrip({ name, date = null }) {
  return {
    name,
    date,
    segments: [],
    // createdAt / updatedAt are added by the store using Firestore timestamps.
  };
}

// Convenience: the straight 2-point path between two places.
export function straightPath(start, end) {
  return [
    { lat: start.lat, lng: start.lng },
    { lat: end.lat, lng: end.lng },
  ];
}
