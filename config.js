// ============================================================================
//  CONFIG  —  Fill in the four bits marked "PASTE..." then save this file.
// ----------------------------------------------------------------------------
//  This file is committed to the repo and served to the browser, so its
//  contents are PUBLIC. That is expected and safe here:
//
//    • The Google Maps key is locked to your own website address via
//      "HTTP referrer restrictions" (see README) — so even though anyone can
//      read it, it only works when loaded from your page. Useless to others.
//
//    • The Firebase config below is designed by Google to be public. Your data
//      is protected by Firestore "Security Rules", not by hiding these values.
//
//  See the README "Security & cost" section for the full explanation.
// ============================================================================

// --- 1) Google Maps Platform key ------------------------------------------
//  Google Cloud Console → APIs & Services → Credentials → API key.
//  IMPORTANT: restrict it by HTTP referrer AND set quota caps (see README).
export const GOOGLE_MAPS_API_KEY = "PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE";

// --- 2) Firebase project config -------------------------------------------
//  Firebase Console → Project settings → "Your apps" → SDK setup & config.
//  Paste the values from the firebaseConfig object it shows you.
export const FIREBASE_CONFIG = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// --- 3) Map starting position ---------------------------------------------
//  Where the map opens before a trip has any segments. Default: central London.
export const DEFAULT_CENTER = { lat: 51.5074, lng: -0.1278 };
export const DEFAULT_ZOOM = 13;

// --- 4) Segment colour palette --------------------------------------------
//  Colours are assigned to segments in order as you add them (v1 = colour per
//  segment). Add/replace colours freely.
export const SEGMENT_COLORS = [
  "#e6194B", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#469990", "#9A6324", "#800000",
];
