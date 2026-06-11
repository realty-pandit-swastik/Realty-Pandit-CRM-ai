# Address Capture Bug Fixes — Implementation Plan

**Date:** 2026-05-28
**Status:** PLAN (awaiting approval). No code applied yet.
**Bundle being fixed:** `index-CVC5RWMa.js` (deployed today as `v20260528b-address-progressive-scoped`).

---

## Diagnosis (Playwright-reproduced + code-traced)

| # | Bug | Repro (live) | Root cause (in code) |
|---|---|---|---|
| **A** | Locality shows pan-India places when user **types** city (no pick) | Type "Ghaziabad" → Tab → type "ash" in Locality → returns "Ashok Vihar, Delhi", "Ashta MP", "Ashram New Delhi" | No `place_changed` fires when user only types → `cityViewport` stays `undefined` → no strict bounds → results are pan-India |
| **B** | Even after **picking** the city, Locality still leaks non-Ghaziabad places for some queries | Pick "Ghaziabad" → type "sector 1 vaishali" → still returns Delhi/MP/Maharashtra | Legacy `google.maps.places.Autocomplete` **silently ignores `setOptions({strictBounds: …})`** after construction. My dynamic-update effect is a no-op. |
| **C** | **City field collapses to "G"** after picking a locality (the most damaging — clobbers City + pincode + lat/lng) | Pick Ghaziabad → type "sector 1 vaishali" → pick suggestion → City becomes "G" | **Stale closure** in `GooglePlacesInput`. The `place_changed` listener is attached ONCE in `useEffect([ready, mode])`. It captures `onChange`/`onPlaceSelect` from the FIRST render. When Locality first mounted (right after the user typed "G" in city, triggering progressive disclosure), the closure captured `value = {city:'G', everything else empty}`. Later when the user picks a locality, the listener's `set` does `onChange({...stale_value, ...patch})` → clobbers everything not in `patch` back to that snapshot — including `city` back to `'G'`. |
| **D** | Locality field becomes **"Ghaziabad"** after picking "Sector 1 Vaishali" (user's pick discarded) | After locality pick, Locality reads "Ghaziabad" not "Sector 1, Vaishali" | `onLocality` does `set({ locality: p.locality \|\| p.sub_locality \|\| value.locality })`. Google's `locality` component for Vaishali is its PARENT city, "Ghaziabad". So the override replaces what the user picked with the parent city. |
| **E** | Society + Sub-locality + unit block appear while user is still **typing** in Locality | Type "sector 4 vais" → Society field appears underneath | Progressive disclosure gated on `!!value.locality.trim()`. Any text reveals downstream — not just a pick. |

**Order of fix matters:** C is the root of most of the visible chaos. Fix C first, then the others have clean state to work with.

---

## Design

- **Latest-ref pattern** for the place_changed listener (standard React + third-party-listener idiom): the handler calls `onChangeRef.current(...)` / `onPlaceRef.current(...)`, never the stale closure.
- **Recreate the autocomplete** when `strictBounds` or `bounds` changes (legacy API only honors these at construction).
- **Auto-geocode fallback**: when user types without picking, run a one-shot `Geocoder` to get the viewport so downstream scoping still works.
- **Preserve the user's pick**: `onLocality` enriches Sub-locality/Pincode/State/lat-lng but **never overwrites** the Locality field.
- **Viewport-gated progressive disclosure**: downstream fields appear once we have a viewport (= the user picked OR our auto-geocode resolved their typed text), not on raw text.

All changes are in 2 frontend files: `GooglePlacesInput.tsx` + `AddressFields.tsx`. **No backend, no schema, no migration.**

---

## Task 1 — Fix C (stale closure in `GooglePlacesInput`)

**File:** `frontend/src/components/GooglePlacesInput.tsx`
**Algorithm:** "Latest-ref" — the listener reads handlers from a ref that's kept fresh every render.

**Insert near the top of the component (after the existing `ready`/`failed` state):**
```ts
// "Latest-ref" pattern: the Google place_changed listener is attached ONCE per
// autocomplete instance, but it MUST always call the freshest onChange/onPlaceSelect
// — otherwise it captures stale React state and clobbers fields on pick.
const onChangeRef = useRef(onChange);
const onPlaceRef  = useRef(onPlaceSelect);
useEffect(() => { onChangeRef.current = onChange; });
useEffect(() => { onPlaceRef.current  = onPlaceSelect; });
```

**Inside the autocomplete useEffect, the listener becomes:**
```ts
autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.address_components && !place.geometry) return;
    /* …extract sub_locality, locality, district, state, pincode, lat/lng,
         viewport, name, city exactly as today… */
    onChangeRef.current(mode === 'establishment' ? (place.name || full_address) : full_address);
    onPlaceRef.current({ sub_locality, locality, district, state, pincode,
        full_address, country, latitude, longitude, name, city, viewport });
});
```

**Effect:** Google fires its listener → it calls the LATEST `onChange` / `onPlaceSelect`. They close over the LATEST `set`/`value` of the parent. No more "G" clobber.

---

## Task 2 — Fix B (legacy Autocomplete ignores `setOptions({strictBounds})`)

**File:** same — `GooglePlacesInput.tsx`
**Algorithm:** include `strictBounds` and a serialized `bounds` key in the autocomplete's useEffect deps, so when they change we destroy + recreate the widget.

**Replace the three existing `useEffect`s (autocomplete-creation + setOptions + setBounds) with one:**
```ts
// Serialize the viewport so React dep-array detects changes
const boundsKey = bounds ? `${bounds.south},${bounds.west},${bounds.north},${bounds.east}` : '';

useEffect(() => {
    if (!ready || !inputRef.current) return;
    const google = (window as any).google;
    if (!google?.maps?.places) return;

    // Tear down the previous instance — strictBounds/bounds are read at construction only
    if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
    }

    const options: any = {
        fields: ['address_components', 'geometry', 'name', 'formatted_address'],
        types: typesForMode(mode),
        componentRestrictions: { country: 'in' },
        strictBounds,
    };
    if (bounds) {
        options.bounds = new google.maps.LatLngBounds(
            { lat: bounds.south, lng: bounds.west },
            { lat: bounds.north, lng: bounds.east },
        );
    } else if (biasLat != null && biasLng != null) {
        const d = 0.22;
        options.bounds = new google.maps.LatLngBounds(
            { lat: biasLat - d, lng: biasLng - d },
            { lat: biasLat + d, lng: biasLng + d },
        );
    }

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, options);
    autocomplete.addListener('place_changed', () => { /* … see Task 1 … */ });
    autocompleteRef.current = autocomplete;

    return () => { google.maps.event.clearInstanceListeners(autocomplete); };
}, [ready, mode, strictBounds, boundsKey, biasLat, biasLng]);
```

Remove the old setOptions/setBounds effects entirely.

**Effect:** As soon as the parent sets `cityViewport`, the Locality input rebuilds its autocomplete with strict bounds applied at construction → Google honors them.

---

## Task 3 — Fix A (auto-geocode city/locality typed without picking)

**File:** `frontend/src/components/AddressFields.tsx`
**Algorithm:** on Locality input focus (or change of `value.city`), if `cityViewport` is missing but `value.city` has text, run `Geocoder.geocode` and store the first hit's viewport.

**Add this helper inside `AddressFields` (after `set`):**
```ts
const resolveViewport = (address: string, set: (vp: ViewportBox) => void) => {
    if (!address || !address.trim()) return;
    loadGoogleMaps().then(() => {
        const google = (window as any).google;
        if (!google?.maps) return;
        new google.maps.Geocoder().geocode(
            { address: address.trim(), componentRestrictions: { country: 'IN' } },
            (results: any[], status: string) => {
                if (status !== 'OK' || !results?.[0]?.geometry?.viewport) return;
                const j = results[0].geometry.viewport.toJSON();
                set({ north: j.north, south: j.south, east: j.east, west: j.west });
            },
        );
    }).catch(() => {});
};

// Whenever city text exists without a captured viewport, resolve it once.
useEffect(() => {
    if (!cityViewport && value.city) resolveViewport(value.city, setCityViewport);
}, [value.city, cityViewport]);

// Same for locality
useEffect(() => {
    if (!localityViewport && value.locality && cityViewport) {
        resolveViewport(`${value.locality}, ${value.city}`, setLocalityViewport);
    }
}, [value.locality, localityViewport, cityViewport, value.city]);
```

**Effect:** User typing "Ghaziabad" without picking → ~300 ms after they stop, `cityViewport` resolves → Locality scopes properly. Silent.

---

## Task 4 — Fix D (don't overwrite Locality with the parent city)

**File:** `AddressFields.tsx` — change `onLocality`:
```ts
const onLocality = (p: PlaceResult) => {
    if (p.viewport) setLocalityViewport(p.viewport);
    // Do NOT override locality — the input's own onChange already set it to the
    // formatted_address the user picked. Just enrich the related fields.
    set({
        sub_locality: p.sub_locality || value.sub_locality,
        pincode: p.pincode || value.pincode,
        state: p.state || value.state,
        latitude: p.latitude ?? value.latitude,
        longitude: p.longitude ?? value.longitude,
        apartment_name: '',
    });
};
```

**Effect:** User picks "Sector 1, Vaishali" → Locality stays "Sector 1, Vaishali" (not "Ghaziabad"). Sub-locality gets "Vaishali" / "Sector 1" as Google provides.

---

## Task 5 — Fix E (gate progressive disclosure on viewport, not text)

**File:** `AddressFields.tsx`:
```ts
// Progressive disclosure: reveal the next field only once we have a VIEWPORT
// (= user picked from suggestions OR our silent geocode resolved their typed text).
const showLocality       = !!cityViewport;
const showAfterLocality  = !!localityViewport;
const showSociety        = showAfterLocality;            // for flat/commercial/house
const showUnitBlock      = (layout === 'flat' || layout === 'commercial')
                             ? hasSociety
                             : showAfterLocality;        // house/plot
```

**Effect:** Society + Sub-locality + Pincode/State + Unit block stay hidden while user is typing Locality; they appear only after the user picks (or after the silent geocode resolves).

---

## Task 6 — Verification

1. `cd frontend && npm run build` — expect "✓ built" with no new TS errors.
2. Bump SW stamp → `v20260528c-address-fixes-swbust`.
3. Deploy admin frontend (`node deployment/deploy-agent.js frontend --skip-verify`).
4. Curl verify: `index-*.js` hash + the new stamp serve on admin.realtypandit.in.
5. **Playwright walk** the user's exact address (close Chrome, re-mint cookie, drive the Add wizard):
   - City: type "Ghaziabad" → pick → `cityVal` stays "Ghaziabad", `cityViewport` captured ✓
   - Locality: type "sector 1 vaishali" → suggestions all Ghaziabad-area ✓ → pick first → Locality holds "Sector 1, Vaishali, …" (not "Ghaziabad") ✓, Sub-locality auto-fills (e.g. "Vaishali" or "Sector 1"), City **stays "Ghaziabad"** (no "G" clobber) ✓
   - Society: type "Neelpadam Kunj" → suggestions in Vaishali only → pick → `apartment_name` = "Neelpadam Kunj", building lat/lng captured, **City + Locality remain intact**.
   - State: "Uttar Pradesh" auto-filled.
   - Press Next → on the next step, return to Address → all fields still hold their values (no erasure between steps).
6. Capture screenshot proof of final filled form.

**Pass criteria (all must hold):**
- No field gets clobbered when a downstream field is picked.
- All autocomplete suggestions are scoped to the prior pick.
- Progressive disclosure waits for a pick (or silent geocode resolution).

---

## Files touched
- `frontend/src/components/GooglePlacesInput.tsx` (Tasks 1, 2)
- `frontend/src/components/AddressFields.tsx` (Tasks 3, 4, 5)
- `frontend/index.html` (SW stamp bump)

**No backend changes. No schema changes. No data migration.** Reversible: simple frontend revert if needed.

## Out of scope
- Migrating to the new Google Places API (`PlaceAutocompleteElement`) — legacy works fine once we recreate the widget on bounds changes.
- The 4-renderer parity (Add wizard + Edit tab + mobile + InventoryModal) — `AddressFields` is shared; all four benefit automatically.
