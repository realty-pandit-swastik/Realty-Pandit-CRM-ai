# Logo Placement Instructions

## Required Logo Files

Please place the following logo files in the `public/` directory:

### 1. Favicon
- **File**: `favicon.ico`
- **Location**: `public/favicon.ico`
- **Format**: ICO format (16x16, 32x32, 48x48 sizes)
- **Source**: Convert the circular red Realty Pandit logo to ICO format

### 2. Main Logo (Header/Footer)
- **File**: `logo.png`
- **Location**: `public/logo.png`
- **Format**: PNG with transparent background
- **Recommended Size**: 200x200px or larger
- **Usage**: Website header, footer, and social sharing

### 3. Logo Variants (Optional but Recommended)
- **White Logo**: `logo-white.png` (for dark backgrounds)
- **Dark Logo**: `logo-dark.png` (for light backgrounds)
- **Location**: `public/`

## Logo Design Files Provided

You provided two logo images:

1. **Circular Logo** (Red circle with white "PANDIT")
   - Use this for favicon
   - Use this for app icons and social media profile pictures

2. **Wide Logo** (Full "REALTY PANDIT" text in red and white bars)
   - Use this for website header/footer
   - Use this for email signatures and documents

## How to Add Logos

### Step 1: Save Logo Files
Save your logo files to the `public/` folder:
```
agents/website/public/
├── favicon.ico          # Circular logo converted to ICO
├── logo.png             # Wide logo (main)
├── logo-white.png       # Optional: White version for dark backgrounds
└── logo-dark.png        # Optional: Dark version for light backgrounds
```

### Step 2: Update Navbar (if needed)
The Navbar currently uses a `Building2` icon. Update it to use your logo:

File: `agents/website/src/components/Navbar.tsx`

Replace:
```tsx
<Building2 className="w-8 h-8 text-blue-600" />
<span className="text-2xl font-bold">Realty Pandit</span>
```

With:
```tsx
<Image src="/logo.png" alt="Realty Pandit" width={180} height={60} className="h-12 w-auto" />
```

### Step 3: Update Footer (if needed)
File: `agents/website/src/components/Footer.tsx`

Replace:
```tsx
<Building2 className="w-8 h-8 text-blue-500" />
<span className="text-2xl font-bold">Realty Pandit</span>
```

With:
```tsx
<Image src="/logo.png" alt="Realty Pandit" width={180} height={60} className="h-10 w-auto" />
```

## Logo Conversion Tools

### Convert PNG to ICO (for favicon)
- **Online Tool**: https://www.icoconverter.com/
- **Upload**: Your circular logo
- **Output**: favicon.ico with multiple sizes (16x16, 32x32, 48x48)

### Optimize PNG Files
- **Tool**: https://tinypng.com/
- **Purpose**: Reduce file size without losing quality

## Current Integration Status

✅ **Tracking Codes**:
- Google Analytics (G-WJF3Y3SXM3) - Added
- Google Tag Manager (GTM-TBFWLRD7) - Added
- Facebook Domain Verification - Added

✅ **Social Media Links**:
- Facebook: https://www.facebook.com/airealtypandit
- Instagram: https://www.instagram.com/airealtypandit
- YouTube: https://www.youtube.com/channel/UCQa1_h4333_Ke9RIKSx_Gow

✅ **Google Maps**:
- Embedded on Contact Page
- Direct Link: https://maps.app.goo.gl/PrKZPa8mNiNuWHJv9

⏳ **Logo Files**:
- Need to be added manually to `public/` folder
- favicon.ico referenced in layout.tsx (will work once file is added)

## Testing After Logo Addition

1. Place logo files in `public/` folder
2. Restart dev server: `npm run dev`
3. Check:
   - Favicon appears in browser tab
   - Logo displays in header/footer
   - Social sharing preview shows logo

## Questions?

If you need help with logo placement or conversion, let me know!
