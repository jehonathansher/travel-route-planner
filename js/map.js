// ============================================================================
//  MAP  —  create the Google Map and draw the active trip on it.
// ----------------------------------------------------------------------------
//  Phase 1 draws each segment as a coloured polyline along its stored `path`
//  (a straight 2-point line for now) plus a small marker at each end. Phase 2
//  will fill `path` with real routes and Phase 3 will make walking lines
//  editable — but because everything draws from `segment.path`, this renderer
//  barely changes.
// ============================================================================

import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../config.js";

let map = null;
let overlays = []; // every polyline/marker we've drawn, so we can clear them

// Create the map inside the given element.
export function initMap(element) {
  map = new google.maps.Map(element, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    disableDefaultUI: true, // we provide our own touch-friendly controls
    zoomControl: true,
    gestureHandling: "greedy", // one finger pans the map (no two-finger gesture)
    clickableIcons: false,
    mapId: undefined,
  });
  return map;
}

export function getMap() {
  return map;
}

// Remove everything we've drawn.
function clearOverlays() {
  overlays.forEach((o) => o.setMap(null));
  overlays = [];
}

// Draw a whole trip: all its segments.
export function renderTrip(trip) {
  clearOverlays();
  if (!trip || !trip.segments.length) return;

  const bounds = new google.maps.LatLngBounds();

  trip.segments.forEach((seg) => {
    // The coloured line.
    const line = new google.maps.Polyline({
      path: seg.path,
      strokeColor: seg.style.color,
      strokeOpacity: 1,
      strokeWeight: seg.style.weight || 4, // weight is reserved; default 4 for v1
      map,
    });
    overlays.push(line);

    // Small markers at the two ends so endpoints are easy to see.
    [seg.start, seg.end].forEach((p) => {
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        // Classic Marker is deprecated but works everywhere and needs no Map ID.
        // Swap for AdvancedMarkerElement later if desired.
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: seg.style.color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      overlays.push(marker);
    });

    seg.path.forEach((pt) => bounds.extend(pt));
  });

  // Frame the whole trip nicely.
  if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
}
