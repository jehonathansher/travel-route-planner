// ============================================================================
//  MAP  —  create the Google Map and draw the trip's visible days.
// ----------------------------------------------------------------------------
//  For each visible day we draw:
//    • a numbered marker at every place (in the day's colour)
//    • the route to each place — a solid line for Walk, a thicker translucent
//      line for Transport (the shortest road route).
//  Hidden days are skipped.
// ============================================================================

import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../config.js";
import { MODES } from "./model.js";

let map = null;
let overlays = [];

export function initMap(element) {
  map = new google.maps.Map(element, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: "greedy",
    clickableIcons: false,
  });
  return map;
}

export function getMap() {
  return map;
}

function clearOverlays() {
  overlays.forEach((o) => o.setMap(null));
  overlays = [];
}

export function renderTrip(trip) {
  clearOverlays();
  if (!trip) return;

  const bounds = new google.maps.LatLngBounds();
  let hasPoints = false;

  for (const day of trip.days) {
    if (day.visible === false) continue;

    day.places.forEach((place, i) => {
      // Route line to this place (skip the first place — nothing before it).
      if (i > 0 && place.path && place.path.length > 1) {
        const mode = MODES[place.mode] || MODES.walk;
        overlays.push(new google.maps.Polyline({
          path: place.path,
          strokeColor: day.color,
          strokeOpacity: mode.translucent ? 0.35 : 1,
          strokeWeight: mode.translucent ? 8 : 4,
          map,
        }));
      }

      // Numbered marker for the place.
      overlays.push(new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map,
        title: place.name,
        label: { text: String(i + 1), color: "#fff", fontSize: "12px", fontWeight: "700" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: day.color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      }));

      bounds.extend({ lat: place.lat, lng: place.lng });
      hasPoints = true;
    });
  }

  if (hasPoints) map.fitBounds(bounds, 70);
}
