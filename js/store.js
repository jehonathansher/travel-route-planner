// ============================================================================
//  STORE  —  all reading/writing of trips (days + places), plus real-time sync.
// ----------------------------------------------------------------------------
//  Firestore layout:
//     trips/{tripId}   →  { name, days:[ {name,color,visible,places:[...]} ], ... }
//     app/state        →  { activeTripId }
//
//  Old trips (stored as a flat list of "segments") are migrated on read into
//  the days/places shape, so nothing breaks.
// ============================================================================

import { db } from "./firebase.js";
import { makeTrip, makeDay, makePlace, migrateTrip, DAY_COLORS } from "./model.js";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const tripsCol = collection(db, "trips");
const stateDoc = doc(db, "app", "state");

const cache = { trips: [], activeTripId: null };
const listeners = new Set();

export function onChange(cb) {
  listeners.add(cb);
  cb(getState());
  return () => listeners.delete(cb);
}
function notify() {
  const state = getState();
  listeners.forEach((cb) => cb(state));
}

export function getState() {
  return { trips: cache.trips, activeTripId: cache.activeTripId, activeTrip: getActiveTrip() };
}
export function getActiveTrip() {
  return cache.trips.find((t) => t.id === cache.activeTripId) || null;
}

export function initStore() {
  onSnapshot(tripsCol, (snap) => {
    cache.trips = snap.docs
      .map((d) => migrateTrip({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    notify();
  });
  onSnapshot(stateDoc, (snap) => {
    cache.activeTripId = snap.exists() ? snap.data().activeTripId : null;
    notify();
  });
}

// ---- Trips ----------------------------------------------------------------
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
  await updateDoc(doc(db, "trips", tripId), { name: name.trim() || "Untitled trip", updatedAt: serverTimestamp() });
}
export async function deleteTrip(tripId) {
  await deleteDoc(doc(db, "trips", tripId));
  if (cache.activeTripId === tripId) {
    const next = cache.trips.find((t) => t.id !== tripId);
    await setActiveTrip(next ? next.id : null);
  }
}
export async function setActiveTrip(tripId) {
  await setDoc(stateDoc, { activeTripId: tripId });
}

// ---- Days -----------------------------------------------------------------
export async function addDay(tripId) {
  const trip = getTrip(tripId);
  const used = new Set((trip?.days || []).map((d) => d.color));
  const color = DAY_COLORS.find((c) => !used.has(c)) || DAY_COLORS[(trip?.days?.length || 0) % DAY_COLORS.length];
  const day = makeDay({ name: `Day ${(trip?.days?.length || 0) + 1}`, color });
  await mutateDays(tripId, (days) => [...days, day]);
  return day.id;
}
export async function updateDay(tripId, dayId, patch) {
  await mutateDays(tripId, (days) => days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)));
}
export async function removeDay(tripId, dayId) {
  await mutateDays(tripId, (days) => {
    const left = days.filter((d) => d.id !== dayId);
    return left.length ? left : [makeDay({ name: "Day 1", color: DAY_COLORS[0] })]; // never zero days
  });
}

// ---- Places (within a day) ------------------------------------------------
export async function addPlace(tripId, dayId, placeInput) {
  const place = makePlace(placeInput);
  await mutateDays(tripId, (days) => mapDayPlaces(days, dayId, (ps) => [...ps, place]));
  return place.id;
}
export async function updatePlace(tripId, dayId, placeId, patch) {
  await mutateDays(tripId, (days) =>
    mapDayPlaces(days, dayId, (ps) => ps.map((p) => (p.id === placeId ? { ...p, ...patch } : p)))
  );
}
export async function removePlace(tripId, dayId, placeId) {
  await mutateDays(tripId, (days) => mapDayPlaces(days, dayId, (ps) => ps.filter((p) => p.id !== placeId)));
}
// Move a place up (-1) or down (+1) within its day.
export async function movePlace(tripId, dayId, placeId, direction) {
  await mutateDays(tripId, (days) => mapDayPlaces(days, dayId, (ps) => {
    const i = ps.findIndex((p) => p.id === placeId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ps.length) return ps;
    const copy = ps.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  }));
}

// ---- internals ------------------------------------------------------------
function getTrip(tripId) {
  return cache.trips.find((t) => t.id === tripId) || null;
}
function mapDayPlaces(days, dayId, fn) {
  return days.map((d) => (d.id === dayId ? { ...d, places: fn(d.places) } : d));
}

// Read-modify-write the trip's `days` array ATOMICALLY. Because reordering a
// place and auto-computing its route can happen at nearly the same time, a
// plain "read cache → write whole array" can clobber. A transaction reads the
// current server value inside the write, so concurrent edits can't stomp each
// other (Firestore retries on conflict).
async function mutateDays(tripId, fn) {
  const ref = doc(db, "trips", tripId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const days = data.days ? data.days : migrateTrip({ ...data }).days;
    const newDays = fn(days);
    if (!newDays) return;
    tx.update(ref, { days: newDays, updatedAt: serverTimestamp() });
  });
}
function toMillis(ts) {
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}
