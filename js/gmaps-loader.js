// ============================================================================
//  GOOGLE MAPS LOADER  —  load the Maps JavaScript SDK on demand.
// ----------------------------------------------------------------------------
//  Loads the SDK once, using the key from config.js, and resolves when
//  `google.maps` is ready. We request the libraries we need now (maps, places)
//  and the ones Phase 2/3 will use (geometry, routes) so they are available
//  later without changing this file.
// ============================================================================

import { GOOGLE_MAPS_API_KEY } from "../config.js";

let loadPromise = null;

export function loadGoogleMaps() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google.maps);

    // Google calls this global once the script has finished loading.
    window.__gmapsReady = () => resolve(window.google.maps);

    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      v: "weekly",
      libraries: "maps,places,geometry,routes",
      callback: "__gmapsReady",
      loading: "async",
    });

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () =>
      reject(new Error(
        "Failed to load Google Maps. Check that your API key is correct and " +
        "that the Maps JavaScript API + Places API (New) are enabled."
      ));
    document.head.appendChild(script);
  });

  return loadPromise;
}
