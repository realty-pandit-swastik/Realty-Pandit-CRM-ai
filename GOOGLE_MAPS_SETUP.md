# Google Maps Integration - Setup Guide

## Overview

The Property Map View feature displays all inventory properties on an interactive Google Maps interface with:
- **Color-coded markers** by property status (Available=Green, Sold/Rented=Red, Hold=Orange, Withdrawn=Gray)
- **Marker clustering** for dense areas (automatic grouping when zoomed out)
- **Info windows** showing property details on marker click
- **Filters sidebar** for intent, type, price range, status, and location search
- **Auto-zoom** to fit all visible properties
- **Mobile responsive** design

---

## Prerequisites

You need a **Google Maps API Key** with the following APIs enabled:
1. **Maps JavaScript API** - For displaying the map
2. **Places API** - For location autocomplete (future enhancement)
3. **Geocoding API** - For converting addresses to lat/lng coordinates

---

## Step 1: Get Google Maps API Key

### 1.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" → "New Project"
3. Enter project name: `Realty Pandit Maps`
4. Click "Create"

### 1.2 Enable Required APIs

1. Navigate to **APIs & Services** → **Library**
2. Search and enable each of these APIs:
   - **Maps JavaScript API**
   - **Geocoding API**
   - **Places API** (optional, for future autocomplete)

### 1.3 Create API Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **API Key**
3. Copy the generated API key
4. Click **Restrict Key** (recommended for security):
   - **Application restrictions**:
     - For development: Choose "HTTP referrers" and add:
       - `http://localhost:5173/*` (frontend dev)
       - `http://localhost:3001/*` (admin dev)
     - For production: Add your production domain(s)
   - **API restrictions**:
     - Choose "Restrict key"
     - Select: Maps JavaScript API, Geocoding API, Places API
5. Save restrictions

---

## Step 2: Configure Environment Variables

### 2.1 Frontend (.env)

Create or update `agents/frontend/.env`:

```bash
VITE_GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE
```

### 2.2 Backend (.env)

Update `agents/backend/.env`:

```bash
GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE
```

**Important:** Use the SAME API key for both frontend and backend.

---

## Step 3: Geocode Existing Properties

Before properties can appear on the map, they need latitude/longitude coordinates.

### 3.1 Run the Geocoding Script

```bash
cd agents/backend

# Set environment variable (if not in .env)
export GOOGLE_MAPS_API_KEY=your_api_key_here  # Linux/Mac
set GOOGLE_MAPS_API_KEY=your_api_key_here     # Windows CMD

# Run the script
npx ts-node src/scripts/geocode-properties.ts
```

### 3.2 What the Script Does

- Finds all properties without `latitude`/`longitude`
- Builds address strings from structured fields (locality, city, state, pincode)
- Calls Google Geocoding API to convert addresses to coordinates
- Updates properties with lat/lng in the database
- Rate-limited to avoid API quota issues (200ms delay between calls)

### 3.3 Expected Output

```
🗺️  Starting geocoding process...

Found 150 properties to geocode

[1/150] Geocoding: Sector 150, Gautam Buddh Nagar, Uttar Pradesh - 201310...
✅ Success: 28.4954, 77.4907

[2/150] Geocoding: Golf Course Road, Gurgaon, Haryana - 122002...
✅ Success: 28.4645, 77.0678

...

📊 Geocoding Summary:
============================================================
Total properties: 150
✅ Successfully geocoded: 142
❌ Failed: 5
⏭️  Skipped (no address): 3
============================================================
```

---

## Step 4: Access the Property Map

1. **Build and deploy** the updated frontend:
   ```bash
   cd agents/frontend
   npm run build
   ```

2. **Login to admin dashboard**

3. **Navigate to "Property Map"** in the sidebar (🗺️ icon)

4. You should see:
   - Interactive Google Map
   - Colored markers for each geocoded property
   - Filters sidebar on the left
   - Info windows on marker click

---

## Features Overview

### 🎯 Marker Colors
- 🟢 **Green** = Available (active)
- 🔴 **Red** = Sold or Rented
- 🟠 **Orange** = On Hold
- ⚫ **Gray** = Withdrawn

### 🔍 Filters
- **Intent**: Sale / Rent / Lease
- **Property Type**: Flat, House, Plot, Office, Shop, etc.
- **Status**: Available, Sold, Rented, Withdrawn
- **Price Range**: Min/Max price (₹)
- **Location Search**: Search by city, locality, or area

### 📍 Marker Clustering
- Automatically groups nearby markers when zoomed out
- Shows count of properties in each cluster
- Click cluster to zoom in and see individual properties

### ℹ️ Info Window
Displays when clicking a marker:
- Property image (if available)
- Property type and intent (e.g., "FLAT for Sale")
- Location (locality, city)
- Price (formatted in Lakh/Crore)
- Specs (BHK, area in sqft)
- Status badge

---

## Troubleshooting

### Map Not Loading

**Error**: "Error loading Google Maps. Please check your API key configuration."

**Solution**:
1. Verify `VITE_GOOGLE_MAPS_API_KEY` is set in `agents/frontend/.env`
2. Check API key has Maps JavaScript API enabled
3. Check browser console for specific error messages
4. Verify API restrictions (if any) include your domain

### No Properties on Map

**Possible Causes**:
1. **Properties not geocoded** → Run geocoding script (Step 3)
2. **Database migration not applied** → Check `latitude`/`longitude` columns exist
3. **Filters too restrictive** → Click "Reset Filters" button

Check in browser console:
- Network tab → Should see API call to `/api/inventory`
- Console → Should log number of properties loaded

### Geocoding Script Fails

**Error**: "Geocoding failed, Status: REQUEST_DENIED"

**Solution**:
1. Verify Geocoding API is enabled in Google Cloud Console
2. Check API key has Geocoding API restriction (if restricted)
3. Verify billing is enabled on Google Cloud project (required for Geocoding API)

**Error**: "No results found for address: ..."

**Solution**:
- Property has incomplete address data
- Manually edit property in admin → Add locality, city, state, pincode

---

## API Quotas & Pricing

### Free Tier (Monthly)
- **Maps JavaScript API**: $200 credit = ~28,000 map loads
- **Geocoding API**: $200 credit = ~40,000 geocode requests

### Best Practices
1. **Cache geocoded coordinates** (already done via DB storage)
2. **Rate limit** geocoding script (already implemented: 200ms delay)
3. **Avoid re-geocoding** existing properties (script only geocodes properties with `latitude = NULL`)
4. **Monitor usage** in Google Cloud Console

---

## Database Schema

### Inventory Table Changes

```sql
ALTER TABLE "inventory"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE INDEX "inventory_latitude_longitude_idx"
ON "inventory"("latitude", "longitude");
```

### Migration File
Location: `agents/backend/prisma/migrations/20260224000000_add_geo_coordinates/migration.sql`

---

## Future Enhancements (Phase 1.2-1.4)

The following features are planned but not yet implemented:

1. **Multi-View Dashboard Tabs** (Phase 1.2)
   - 7 dashboard tabs (Main, Market Trends, User Performance, Lead Sources, etc.)

2. **Chart Library Integration** (Phase 1.3)
   - Recharts visualization library
   - Line charts, bar charts, pie charts, heatmaps

3. **Property Live Status Board** (Phase 1.4)
   - Floor-plan style unit availability view
   - Color-coded unit status grid

---

## Files Modified/Created

### Frontend
- `agents/frontend/src/components/PropertyMapView.tsx` (NEW)
- `agents/frontend/src/components/DashboardLayout.tsx` (MODIFIED)
- `agents/frontend/src/App.tsx` (MODIFIED)
- `agents/frontend/.env.example` (NEW)
- `agents/frontend/package.json` (MODIFIED - added @react-google-maps/api)

### Backend
- `agents/backend/prisma/schema.prisma` (MODIFIED - added lat/lng fields)
- `agents/backend/prisma/migrations/20260224000000_add_geo_coordinates/` (NEW)
- `agents/backend/src/scripts/geocode-properties.ts` (NEW)
- `agents/backend/.env.example` (MODIFIED)

---

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify all environment variables are set
3. Check Google Cloud Console → APIs & Services → Credentials for API key status
4. Review this guide's Troubleshooting section

---

**Status**: ✅ Phase 1.1 Complete - Google Maps Integration with Property Pins

**Next Steps**:
1. Get Google Maps API key from Google Cloud Console
2. Set environment variables in both frontend and backend
3. Run geocoding script to populate coordinates
4. Deploy and test the Property Map view

Good luck! 🗺️✨
