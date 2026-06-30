// ============================================================================
//  PLACES  —  Google "Place Autocomplete" search boxes.
// ----------------------------------------------------------------------------
//  Creates the modern <gmp-place-autocomplete> element (Places API New). When
//  the user picks a place, `onPick` is called with a tidy object:
//      { placeId, name, lat, lng }
//
//  Requires the "Places API (New)" to be enabled on your Google Cloud project
//  (see README). The autocomplete widget manages its own billing session.
// ============================================================================

// Create a place-search box and append it into `container`.
// Returns the created element (so callers can clear/remove it).
export async function createPlaceInput(container, { placeholder, onPick }) {
  const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");

  const el = new PlaceAutocompleteElement();
  // Best-effort placeholder text (supported on recent versions).
  if (placeholder) {
    try { el.placeholder = placeholder; } catch (_) { /* older versions ignore */ }
  }
  container.appendChild(el);

  el.addEventListener("gmp-select", async ({ placePrediction }) => {
    const place = placePrediction.toPlace();
    await place.fetchFields({ fields: ["displayName", "location", "id"] });

    // `location` may be a LatLng (lat()/lng() methods) or a plain object,
    // depending on SDK version — handle both.
    const loc = place.location;
    const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
    const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;

    onPick({
      placeId: place.id,
      name: place.displayName || "Selected place",
      lat,
      lng,
    });
  });

  return el;
}
