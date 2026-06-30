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
  walk:  { label: "Walk",  emoji: "🚶", google: "WALKING", routable: true },
  car:   { label: "Car",   emoji: "🚗", google: "DRIVING", routable: true },
  taxi:  { label: "Taxi",  emoji: "🚕", google: "DRIVING", routable: true },
  train: { label: "Train", emoji: "🚆", google: "TRANSIT", transit: "TRAIN",  routable: true },
  bus:   { label: "Bus",   emoji: "🚌", google: "TRANSIT", transit: "BUS",    routable: true },
  tube:  { label: "Tube",  emoji: "🚇", google: "TRANSIT", transit: "SUBWAY", routable: true },
  boat:  { label: "Boat",  emoji: "⛴️", google: "TRANSIT", transit: "FERRY",  routable: false },
};

export const DEFAULT_MODE = "walk";

// A "place" picked from Google Places search.
export function makePlace({ placeId = null, name = "", lat, lng }) {
  return { placeId, name, lat, lng };
}

// Create a fresh segment between two places.
//  start / end : objects from makePlace()
//  mode        : a key of TRAVEL_MODES
//  color       : hex string (assigned by the caller from the palette)
export function makeSegment({ start, end, mode = DEFAULT_MODE, color = "#4363d8" }) {
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
    path: [
      { lat: start.lat, lng: start.lng },
      { lat: end.lat, lng: end.lng },
    ],
    // Where "path" came from: "straight" | "directions" | "manual".
    routeSource: "straight",

    // Visual style. Only "color" is used in v1. weight/dash/label are reserved
    // so they can be added later without restructuring stored data.
    style: {
      color,
      weight: null, // future: line thickness
      dash: null,   // future: "solid" | "dashed"
      label: null,  // future: text label on the segment
    },

    // Transit timing, filled in by Phase 4 for bus/tube/train/etc.
    schedule: {
      departureTime: null, // ISO string
      arrivalTime: null,   // ISO string
      legs: [],            // [{ line, departure, arrival, ... }]
    },
  };
}

// Create a fresh, empty trip.
export function makeTrip({ name }) {
  return {
    name,
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
