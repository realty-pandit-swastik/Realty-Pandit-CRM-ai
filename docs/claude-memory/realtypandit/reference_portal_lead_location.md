---
name: reference_portal_lead_location
description: How portal leads carry the customer's location — MagicBricks puts the granular area ONLY in the free-text `msg` (City field is city-only), 99acres pull-feed sends only cityName + sometimes projName (no sector). Plus the correct 99acres listing-link format. Fixed 2026-06-08.
metadata:
  type: reference
---

Portal leads used to store only the **city** in `preferred_location`, losing the customer's real area.
Fixed 2026-06-08.

**MagicBricks** ([`integrations/magicbricks.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/integrations/magicbricks.ts), `/push` endpoint): the structured `City` field is **just the
city** ("Ghaziabad"). The real area is ONLY in the free-text **`msg`**, always shaped:
*"This user is looking for <BHK> <type> **for Sale/Rent in <LOCATION>** and has viewed your contact details."*
(e.g. "Sector 6 Vaishali, Ghaziabad"). Parse it with **`extractLocationFromMsg`**
([`utils/parse_lead_location.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/utils/parse_lead_location.ts), regex `for (sale|rent|lease) in (.+?)(?: and has viewed|[.\n]|$)`) →
`preferred_location` (fallback to City), then fire-and-forget `geocodeAddress` → `preferred_lat/lng`. Applied to
both the new-lead and re-enquiry branches. `geocodeAddress` ([utils/geocode.ts](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/utils/geocode.ts)) returns only `{lat,lng}`.

**99acres** (pull poller [`ninety_nine_acres_poller.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/ninety_nine_acres_poller.ts)): the feed does **NOT** carry the customer's
sector/locality — `CmpctLabl` (propertyLabel) and `QryInfo` are **0% populated** (verified over 200 leads); only
`cityName` and *sometimes* `projName` (a society) exist. Best achievable: `location = [projName, cityName].join(', ')`
(e.g. "Ramprastha Pearl Club Residency, Ghaziabad"), else city. Don't expect sector-level for 99acres. (The
granular location lives on the listing the lead enquired about, not in the lead feed.)

**99acres listing link** (admin lead detail, [`ExternalLeads.tsx`](clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/ExternalLeads.tsx), the "View on 99acres" link from
`metadata.property_code`): correct format is **`https://www.99acres.com/<property_code>`** (property_code keeps
its letter prefix, e.g. `S90501852` → `https://www.99acres.com/S90501852`). The old `…/search/property/buy/
property-in-india?prop_id=<code>` search-URL was wrong (didn't open the listing).

Related: [[reference_99acres_lead_routing]] (SubUserName→agent routing), [[feedback_poller_silent_loss]]
(poller fail-loud rules), [[reference_inventory_search]] (the word-aware address matcher).
