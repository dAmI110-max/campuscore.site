/**
 * Configurable Seller Premium limits.
 * Values live in platform_commerce (migration 0007); defaults match the approved package.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { HttpError } from "./errors";

export type PremiumLimits = {
  freeListingLimit: number;
  freeImagesPerListing: number;
  premiumListingLimit: number;
  premiumImagesPerListing: number;
  premiumBoostsPerMonth: number;
  premiumBoostHours: number;
  premiumPriceMinor: number;
};

const DEFAULTS: PremiumLimits = {
  freeListingLimit: 5,
  freeImagesPerListing: 2,
  premiumListingLimit: 20,
  premiumImagesPerListing: 5,
  premiumBoostsPerMonth: 2,
  premiumBoostHours: 48,
  premiumPriceMinor: 200_000,
};

export async function loadPremiumLimits(): Promise<PremiumLimits> {
  try {
    const result = await db.execute<{
      free_listing_limit: number;
      free_images_per_listing: number;
      premium_listing_limit: number;
      premium_images_per_listing: number;
      premium_boosts_per_month: number;
      premium_boost_hours: number;
      premium_price_minor: number;
    }>(sql`
      select free_listing_limit, free_images_per_listing, premium_listing_limit,
             premium_images_per_listing, premium_boosts_per_month, premium_boost_hours,
             premium_price_minor
      from platform_commerce where id = 1
    `);
    const row = (result as unknown as { rows?: typeof DEFAULTS[] }).rows?.[0]
      ?? (Array.isArray(result) ? result[0] : undefined);
    if (!row) return { ...DEFAULTS };
    const r = row as Record<string, number>;
    return {
      freeListingLimit: Number(r.free_listing_limit ?? DEFAULTS.freeListingLimit),
      freeImagesPerListing: Number(r.free_images_per_listing ?? DEFAULTS.freeImagesPerListing),
      premiumListingLimit: Number(r.premium_listing_limit ?? DEFAULTS.premiumListingLimit),
      premiumImagesPerListing: Number(r.premium_images_per_listing ?? DEFAULTS.premiumImagesPerListing),
      premiumBoostsPerMonth: Number(r.premium_boosts_per_month ?? DEFAULTS.premiumBoostsPerMonth),
      premiumBoostHours: Number(r.premium_boost_hours ?? DEFAULTS.premiumBoostHours),
      premiumPriceMinor: Number(r.premium_price_minor ?? DEFAULTS.premiumPriceMinor),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function assertListingWithinCap(opts: {
  ownerId: string;
  isPremiumActive: boolean;
  currentActiveCount: number;
}): Promise<void> {
  const limits = await loadPremiumLimits();
  const cap = opts.isPremiumActive ? limits.premiumListingLimit : limits.freeListingLimit;
  if (opts.currentActiveCount >= cap) {
    throw new HttpError(
      403,
      opts.isPremiumActive
        ? `Premium sellers can have at most ${cap} active listings. Remove or unpublish one first.`
        : `Free sellers can have at most ${cap} active listings. Upgrade to Premium for a higher limit.`,
    );
  }
}

export async function assertImageCountAllowed(opts: {
  isPremiumActive: boolean;
  imageCount: number;
}): Promise<void> {
  const limits = await loadPremiumLimits();
  const max = opts.isPremiumActive ? limits.premiumImagesPerListing : limits.freeImagesPerListing;
  if (opts.imageCount > max) {
    throw new HttpError(
      400,
      opts.isPremiumActive
        ? `Premium listings allow at most ${max} images.`
        : `Free listings allow at most ${max} images. Upgrade to Premium for more.`,
    );
  }
}

/**
 * When Premium lapses: listings above the free limit stay in the DB but are hidden
 * (status remains; a hidden flag or soft-cap is applied by callers).
 */
export function excessListingsShouldBeHidden(
  isPremiumActive: boolean,
  activeCount: number,
  freeLimit: number,
): boolean {
  return !isPremiumActive && activeCount > freeLimit;
}
