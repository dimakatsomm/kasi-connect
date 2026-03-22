import prisma from '../db';
import config from '../config';
import logger from '../config/logger';
import type { VendorRow } from '../types';
import type { VendorSector, NearbyVendor } from '../types';

/**
 * Map user-facing sector label to Prisma VendorType.
 */
function sectorToVendorType(sector: VendorSector): 'retail' | 'food' {
  return sector === 'spaza' ? 'retail' : 'food';
}

/**
 * Haversine distance between two lat/lng points (in kilometres).
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find active vendors of a given sector within the configured search radius
 * of the customer's location.
 *
 * @param sector   'spaza' or 'restaurant'
 * @param lat      Customer latitude
 * @param lng      Customer longitude
 * @param radiusKm Override for the search radius (default from config)
 */
export async function findNearbyVendors(
  sector: VendorSector,
  lat: number,
  lng: number,
  radiusKm: number = config.vendor.searchRadiusKm
): Promise<NearbyVendor[]> {
  const vendorType = sectorToVendorType(sector);

  const vendors = await prisma.vendor.findMany({
    where: {
      is_active: true,
      type: vendorType,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      type: true,
      latitude: true,
      longitude: true,
    },
  });

  const nearby: NearbyVendor[] = [];

  for (const v of vendors) {
    if (v.latitude == null || v.longitude == null) continue;
    const distance = haversineKm(lat, lng, v.latitude, v.longitude);
    if (distance <= radiusKm) {
      nearby.push({
        id: v.id,
        name: v.name,
        type: v.type,
        distance: Math.round(distance * 100) / 100, // 2 decimal places
      });
    }
  }

  // Sort by distance ascending
  nearby.sort((a, b) => a.distance - b.distance);

  logger.info('Nearby vendor search', {
    sector,
    lat,
    lng,
    radiusKm,
    found: nearby.length,
  });

  return nearby;
}

/**
 * Get the WhatsApp number for a vendor to send order fulfilment requests.
 * Falls back to the vendor's primary phone if whatsapp_number is not set.
 */
export async function getVendorWhatsAppNumber(
  vendorId: string
): Promise<string | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { whatsapp_number: true, phone: true },
  });

  if (!vendor) return null;
  return vendor.whatsapp_number ?? vendor.phone;
}

/**
 * Check if a phone number belongs to a vendor.
 * Returns the vendor if found, null otherwise.
 */
export async function getVendorByPhone(
  phone: string
): Promise<VendorRow | null> {
  // Check both phone and whatsapp_number
  return prisma.vendor.findFirst({
    where: {
      OR: [{ phone }, { whatsapp_number: phone }],
      is_active: true,
    },
  });
}
