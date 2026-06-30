// ============================================================================
//  STORE  —  all reading/writing of trips, plus real-time sync.
// ----------------------------------------------------------------------------
//  This is the ONLY file that talks to Firestore for trip data. The rest of the
//  app calls these functions and subscribes to onChange() for live updates.
//
//  Firestore layout:
//     trips/{tripId}        →  { name, segments:[...], createdAt, updatedAt }
//     app/state             →  { activeTripId }   (which trip is "active")
//
//  We keep "which trip is active" in a single tiny doc (app/state) instead of a
//  flag on every trip — that means switching trips is one write and there is
//  always exactly one active trip.
//
//  Real-time sync: two onSnapshot listeners keep an in-memory copy of all trips
//  and the active-trip pointer. Any change (from this device OR your phone)
//  fires the listeners, we update the cache, and notify the UI. That is what
//  makes computer ↔ phone stay in sync automatically.
// ============================================================================

import { db } from "./firebase.js";
import { makeTrip, makeSegment } from "./model.js";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const tripsCol = collection(db, "trips");
const stateDoc = doc(db, "app", "state");

// ---- In-memory cache, kept fresh by the snapshot listeners ----------------
const cache = {
  trips: [],          // [{ id, name, segments, ... }]  newest first
  activeTripId: null,
};

// ---- UI subscribers -------------------------------------------------------
const listeners = new Set();

// Subscribe to store changes. The callback is called immediately with the
// current state, then again whenever anything changes. Returns an unsubscribe.
export function onChange(cb) {
  listeners.add(cb);
  cb(getState());
  return () => listeners.delete(cb);
}

function notify() {
  const state = getState();
  listeners.forEach((cb) => cb(state));
}

// ---- Read helpers ---------------------------------------------------------
export function getState() {
  return {
    trips: cache.trips,
    activeTripId: cache.activeTripId,
    activeTrip: getActiveTrip(),
  };
}

export function getActiveTrip() {
  return cache.trips.find((t) => t.id === cache.activeTripId) || null;
}

// ---- Start listening (called once at startup) -----------------------------
export function initStore() {
  // Live list of all trips, newest-updated first.
  onSnapshot(tripsCol, (snap) => {
    cache.trips = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    notify();
  });

  // Live pointer to the active trip.
  onSnapshot(stateDoc, (snap) => {
    cache.activeTripId = snap.exists() ? snap.data().activeTripId : null;
    notify();
  });
}

// ---- Mutations: trips -----------------------------------------------------

// Create a trip and immediately make it the active one. Returns its id.
export async function createTrip(name) {
  const ref = await addDoc(tripsCol, {
    ...makeTrip({ name: name?.trim() || "New trip" }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setActiveTrip(ref.id);
  return ref.id;
}

export async function renameTrip(tripId, name) {
  await updateDoc(doc(db, "trips", tripId), {
    name: name.trim() || "Untitled trip",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTrip(tripId) {
  await deleteDoc(doc(db, "trips", tripId));
  // If we deleted the active trip, fall back to the most recent remaining one.
  if (cache.activeTripId === tripId) {
    const next = cache.trips.find((t) => t.id !== tripId);
    await setActiveTrip(next ? next.id : null);
  }
}

export async function setActiveTrip(tripId) {
  await setDoc(stateDoc, { activeTripId: tripId });
}

// ---- Mutations: segments --------------------------------------------------
//  Segments live as an array inside the trip doc. To change one, we read the
//  current array from the cache, modify it, and write the whole array back.
//  (For a single user this is simple and reliable.)

export async function addSegment(tripId, segmentInput) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const segment = makeSegment(segmentInput);
  await writeSegments(tripId, [...trip.segments, segment]);
  return segment.id;
}

export async function updateSegment(tripId, segmentId, patch) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const segments = trip.segments.map((s) =>
    s.id === segmentId ? { ...s, ...patch } : s
  );
  await writeSegments(tripId, segments);
}

export async function removeSegment(tripId, segmentId) {
  const trip = getTripById(tripId);
  if (!trip) return;
  await writeSegments(tripId, trip.segments.filter((s) => s.id !== segmentId));
}

// ---- internals ------------------------------------------------------------
function getTripById(tripId) {
  return cache.trips.find((t) => t.id === tripId) || null;
}

async function writeSegments(tripId, segments) {
  await updateDoc(doc(db, "trips", tripId), {
    segments,
    updatedAt: serverTimestamp(),
  });
}

// Firestore timestamps -> milliseconds (handles the brief moment before the
// server timestamp resolves, when the field may still be null).
function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return 0;
}
