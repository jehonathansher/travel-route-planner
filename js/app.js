// ============================================================================
//  APP  —  startup. Ties everything together.
// ----------------------------------------------------------------------------
//  1. If config.js still has placeholder values, show the "setup needed" card.
//  2. Otherwise: load Google Maps, create the map, start Firestore sync, and
//     wire up the UI.
// ============================================================================

import { GOOGLE_MAPS_API_KEY, FIREBASE_CONFIG } from "../config.js";
import { loadGoogleMaps } from "./gmaps-loader.js";
import { initMap } from "./map.js";
import { initStore } from "./store.js";
import { initUI } from "./ui.js";

async function main() {
  if (isUnconfigured()) {
    document.getElementById("setup-overlay").hidden = false;
    return;
  }

  try {
    await loadGoogleMaps();
    initMap(document.getElementById("map"));
    initStore();   // begins real-time Firestore listeners
    initUI();      // binds buttons + subscribes to the store
  } catch (err) {
    console.error(err);
    alert(err.message || "Something went wrong starting the app. See console.");
  }
}

// True while config.js still contains the "PASTE..." placeholders.
function isUnconfigured() {
  return (
    GOOGLE_MAPS_API_KEY.includes("PASTE") ||
    String(FIREBASE_CONFIG.apiKey).includes("PASTE") ||
    String(FIREBASE_CONFIG.projectId).includes("PASTE")
  );
}

main();
