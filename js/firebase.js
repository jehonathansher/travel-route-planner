// ============================================================================
//  FIREBASE  —  initialise the app + Firestore database.
// ----------------------------------------------------------------------------
//  We load the Firebase SDK straight from Google's CDN as ES modules, so there
//  is no build step and nothing to install. `db` is the Firestore handle the
//  rest of the app uses.
// ============================================================================

import { FIREBASE_CONFIG } from "../config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);
