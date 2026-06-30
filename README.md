# Route Planner

A personal travel-route planner. Build a **trip** out of **segments** (point A → point B),
each with a travel mode and a coloured line on a Google Map. Your trips sync automatically
between your computer and phone, and you can use *and edit* it from either.

Built as a plain static web app — **no build step, no server to run** — so it's easy to host
free on GitHub Pages and easy to edit (even from your phone).

> **Status:** Phase 1. You can create/name trips, add segments via Google Places search, draw
> straight coloured lines, and everything syncs in real time. Real per-mode routing, finger-drag
> walking paths, and transit scheduling come in later phases (see [Roadmap](#roadmap)).

---

## 1. What you need (one-time setup)

You'll set up two free services and paste four values into `config.js`.

### A) Google Maps Platform key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. **Enable billing** (a credit card is required even for the free tier — see
   [Security & cost](#security--cost) for how to make sure you never get charged).
3. **APIs & Services → Library** → enable:
   - **Maps JavaScript API**
   - **Places API (New)**  ← needed for the search boxes
   - **Directions API** (for Phase 2 routing; fine to enable now)
4. **APIs & Services → Credentials → Create credentials → API key.** Copy it.
5. **Lock the key down** (important — it's visible in the page):
   - Edit the key → **Application restrictions → Websites (HTTP referrers)** and add:
     - `http://localhost:8000/*` (for local development)
     - `https://jehonathansher.github.io/*` (your deployed site)
   - **API restrictions → Restrict key** → select the three APIs above.
6. **Set a quota cap so a bug can't ever run up a bill:**
   APIs & Services → each API → **Quotas** → set a low daily request limit
   (e.g. 1,000/day is way more than personal use). Also set a
   [budget alert](https://console.cloud.google.com/billing/budgets) for peace of mind.

### B) Firebase (the free database that syncs your trips)

1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Add project**
   (you can reuse the Google Cloud project from step A).
2. **Build → Firestore Database → Create database** → start in **production mode** → pick a region.
3. **Rules** tab → paste the rules below → **Publish**. (This personal app has no login, so the
   database is open. Your trip data isn't sensitive and the free-tier caps limit any abuse — see
   [Security & cost](#security--cost). You can add a login later without changing any data.)

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
4. **Project settings (gear icon) → General → Your apps → Web app (`</>`)** → register an app →
   copy the `firebaseConfig` values it shows.

### C) Fill in `config.js`

Open `config.js` and paste your Maps key and the Firebase values over the `PASTE...`
placeholders. Save. That's it — no other configuration.

---

## 2. Run it locally

ES modules need to be served over `http://` (opening the file directly won't work). Any static
server works:

```bash
# from inside the project folder:
python3 -m http.server 8000
#   …or:  npx serve -l 8000
```

Then open **http://localhost:8000** in your browser. (If you change the port, update the
`http://localhost:PORT/*` entry in your API key's referrer restrictions.)

---

## 3. Deploy (free, on GitHub Pages)

1. Push this repo to GitHub (see the commands the setup printed, or `git push`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch** →
   branch `main`, folder `/ (root)` → **Save**.
3. After a minute your app is live at
   `https://jehonathansher.github.io/travel-route-planner/`.
4. Make sure that URL is in your API key's **HTTP referrer** list (step A5).

Every `git push` to `main` redeploys automatically.

---

## 4. Use it on your phone

**Use & edit trips (the main thing):**
1. Open your GitHub Pages URL in your phone's browser.
2. **Add to Home Screen** → it opens full-screen like an app.
3. Anything you change on your phone shows up on your computer within about a second, and
   vice-versa — that's the Firestore sync.

**Edit the *code* from your phone (optional):**
- Open the repo on GitHub and tap the **`.`** key, or change the URL from `github.com` to
  **`github.dev`** — this opens a full VS Code editor in the browser. Edit, commit, and your push
  auto-deploys. (This works precisely because there's no build step.)

---

## Security & cost

This is a single-user, no-login app, so security is deliberately simple. Here's the honest picture:

- **The Google Maps key is public but useless to others.** It's visible in the page source (true
  of *every* Google Maps website), but the **HTTP referrer restriction** means it only works when
  loaded from your own site + localhost. Keep that restriction on.
- **You won't get billed if you set the quota caps** in step A6. Google's free tier (since March
  2025) gives roughly **10,000 free map loads per month** plus free allotments for Places/Directions
  — far more than one person needs. The app also **caches routes** (Phase 2+) to minimise calls.
- **The Firebase config is public by design** — Google intends it to ship in client code. With the
  open rules above, anyone who found your project could read/write your trips. Trip routes aren't
  sensitive, and the free tier caps abuse, so this is the standard trade-off for a personal app.
- **Want it locked down later?** Adding a single Google Sign-In and tightening the Firestore rules
  to your account is about an hour's work and needs **no change to how data is stored**.

---

## Data model

One Firestore document per trip. The shape lives in [`js/model.js`](js/model.js). Fields we
aren't using yet (line thickness/dash/label, transit schedule) already exist with `null`
defaults, so they can be added later **without restructuring** stored data.

```js
Trip    { name, segments: [Segment], createdAt, updatedAt }
Segment {
  id, mode,                          // "walk" | "car" | "taxi" | "train" | "bus" | "tube" | "boat"
  start, end,                        // { placeId, name, lat, lng } from Places search
  path: [{lat,lng}, …],              // the drawn line (straight now; real route / hand-drawn later)
  routeSource,                       // "straight" | "directions" | "manual"
  style:    { color, weight, dash, label },   // only `color` used in v1
  schedule: { departureTime, arrivalTime, legs }  // filled by transit scheduling later
}
```

Which trip is "active" is stored in a tiny `app/state` doc (`{ activeTripId }`), so there's always
exactly one active trip and switching is a single write.

---

## Project structure

```
index.html        Page structure (map, top bar, panels)
styles.css        Mobile-first, touch-friendly styles
config.js         ← your keys + app defaults (the only file you edit to set up)
js/
  app.js          Startup: load Maps, start sync, wire UI
  model.js        The Trip/Segment data model + travel modes (extend here)
  firebase.js     Firebase/Firestore initialisation
  store.js        All trip reads/writes + real-time sync (the data layer)
  gmaps-loader.js Loads the Google Maps SDK from your key
  map.js          Draws trips (polylines + markers) on the map
  places.js       Google Places search boxes
  ui.js           Connects buttons/panels to the store + map
```

---

## Roadmap

- **Phase 1 (done):** map · create/name trips · add segments via Places · straight coloured
  lines · real-time sync · trip switcher.
- **Phase 2:** real route per mode (driving/walking/transit) via the Directions service, cached
  into each segment.
- **Phase 3:** drag walking paths to customise them (polished on desktop with a mouse; usable on
  touch).
- **Phase 4:** transit scheduling — set a start time, see real arrival times, check whether the
  tube/bus is still running.

See [`PLAN.md`](#) notes or the project plan for details and known limitations (e.g. transit
coverage depends on the city; ferries are patchy).
