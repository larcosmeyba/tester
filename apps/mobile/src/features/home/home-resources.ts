// Resources Near You — allow-list enforcement (Marcos, Section 2 audit).
//
// Rules enforced here, at the data layer:
// - Only government agencies, established nonprofits, and verified community
//   organizations.
// - Only support-relevant categories: food, housing, health, family, benefits,
//   financial assistance (and adjacent: SNAP/WIC, utility, legal aid, veterans,
//   childcare).
// - NEVER random nearby businesses.
// - Every entry must carry reliable contact/location info (address, phone, or
//   website); entries that cannot be verified are dropped, not shipped.
// - Closest relevant first.
//
// TODO (Section 2 audit): replace the mock `nearbyResources` feed with the
// verified backend resource feed (location-based, same rules applied
// server-side). This filter stays as a client-side guard.

import { nearbyResources, type ResourceItem } from '@/data/mock-data';

/** Keyword allow-list matched against the resource tag (lowercased). */
const ALLOW_LISTED_TAG_KEYWORDS = [
  'food', 'pantry', 'snap', 'calfresh', 'wic',
  'housing', 'rent', 'shelter',
  'health', 'clinic', 'medicaid',
  'benefit', 'dpss', 'social service',
  'family', 'child', 'financial', 'utility', 'legal', 'veteran',
] as const;

function distanceInMiles(resource: ResourceItem): number {
  const match = /([\d.]+)\s*mi/.exec(resource.distance ?? '');
  return match ? Number.parseFloat(match[1]) : Number.POSITIVE_INFINITY;
}

export function isAllowListedResource(resource: ResourceItem): boolean {
  const hasContact = Boolean(resource.address || resource.phone || resource.website);
  if (!hasContact) {
    return false;
  }
  const tag = resource.tag.toLowerCase();
  return ALLOW_LISTED_TAG_KEYWORDS.some((keyword) => tag.includes(keyword));
}

/** Allow-listed resources, closest first. */
export function getHomeResources(): ResourceItem[] {
  return [...nearbyResources]
    .filter(isAllowListedResource)
    .sort((a, b) => distanceInMiles(a) - distanceInMiles(b));
}
