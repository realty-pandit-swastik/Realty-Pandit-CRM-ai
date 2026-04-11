/**
 * Geocoding Script for Existing Properties
 *
 * This script populates latitude and longitude coordinates for properties
 * that don't have geocoded data yet using Google Geocoding API.
 *
 * Usage:
 * 1. Set GOOGLE_MAPS_API_KEY environment variable
 * 2. Run: npx ts-node src/scripts/geocode-properties.ts
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const GOOGLE_GEOCODING_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const BATCH_SIZE = 10; // Process properties in batches to avoid rate limiting
const DELAY_MS = 200; // Delay between API calls (Google allows 50 requests/second)

interface GeocodeResult {
  lat: number;
  lng: number;
}

/**
 * Geocode an address using Google Geocoding API
 */
async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!GOOGLE_GEOCODING_API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY environment variable not set');
    return null;
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: address,
        key: GOOGLE_GEOCODING_API_KEY,
      },
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
      };
    } else if (response.data.status === 'ZERO_RESULTS') {
      console.warn(`No results found for address: ${address}`);
      return null;
    } else {
      console.error(`Geocoding failed for address: ${address}, Status: ${response.data.status}`);
      return null;
    }
  } catch (error: any) {
    console.error(`Error geocoding address: ${address}`, error.message);
    return null;
  }
}

/**
 * Build a searchable address string from inventory data
 */
function buildAddressString(property: any): string {
  const parts: string[] = [];

  // Start with structured address components
  if (property.flat_no) parts.push(property.flat_no);
  if (property.apartment_name) parts.push(property.apartment_name);
  if (property.plot_no) parts.push(property.plot_no);
  if (property.locality) parts.push(property.locality);
  if (property.city || property.district) parts.push(property.city || property.district);
  if (property.state) parts.push(property.state);
  if (property.pincode) parts.push(property.pincode);

  // If structured address is empty, use full_address or location fallback
  if (parts.length === 0) {
    if (property.full_address) return property.full_address;
    if (property.location) return property.location;
    return '';
  }

  return parts.join(', ');
}

/**
 * Delay execution for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function to geocode all properties
 */
async function geocodeProperties() {
  console.log('🗺️  Starting geocoding process...\n');

  try {
    // Find properties without geocoded coordinates
    const properties = await prisma.inventory.findMany({
      where: {
        OR: [
          { latitude: null },
          { longitude: null },
        ],
      },
      select: {
        id: true,
        flat_no: true,
        apartment_name: true,
        plot_no: true,
        locality: true,
        city: true,
        district: true,
        state: true,
        pincode: true,
        full_address: true,
        location: true,
      },
    });

    console.log(`Found ${properties.length} properties to geocode\n`);

    if (properties.length === 0) {
      console.log('✅ All properties are already geocoded!');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    // Process properties in batches
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      const address = buildAddressString(property);

      if (!address || address.trim() === '') {
        console.log(`⏭️  Skipped property ${property.id} - No address available`);
        skippedCount++;
        continue;
      }

      console.log(`[${i + 1}/${properties.length}] Geocoding: ${address.substring(0, 80)}...`);

      const coordinates = await geocodeAddress(address);

      if (coordinates) {
        // Update property with coordinates
        await prisma.inventory.update({
          where: { id: property.id },
          data: {
            latitude: coordinates.lat,
            longitude: coordinates.lng,
          },
        });

        console.log(`✅ Success: ${coordinates.lat}, ${coordinates.lng}`);
        successCount++;
      } else {
        console.log(`❌ Failed to geocode`);
        failCount++;
      }

      // Rate limiting delay
      if (i < properties.length - 1) {
        await delay(DELAY_MS);
      }

      // Progress update every 10 properties
      if ((i + 1) % 10 === 0) {
        console.log(`\nProgress: ${i + 1}/${properties.length} processed\n`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Geocoding Summary:');
    console.log('='.repeat(60));
    console.log(`Total properties: ${properties.length}`);
    console.log(`✅ Successfully geocoded: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⏭️  Skipped (no address): ${skippedCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error during geocoding process:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
geocodeProperties()
  .then(() => {
    console.log('\n✨ Geocoding process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
