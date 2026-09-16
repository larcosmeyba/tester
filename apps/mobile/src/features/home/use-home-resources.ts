/**
 * Home tab "Resources Near You" data — real backend only.
 *
 * Mirrors the Resources tab's lookup chain (see
 * features/resources/resources-screens.tsx): request foreground location
 * permission when the surface appears, query GET /resources/nearby by device
 * coordinates when granted, fall back to the profile ZIP when permission is
 * denied or the position is unavailable. The section title only claims
 * "Near You" when there is a genuine user-derived location; otherwise it
 * falls back to the neutral "Community Resources". No demo listings, no
 * invented distances — 503s, errors, and empty results all surface as
 * honest states.
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { useAppState } from '@/state/app-state';
import {
  chooseResourceLookupKind,
  fetchByZip,
  fetchNearby,
  ResourceServiceError,
  type NearbyResource,
} from '@/features/resources/resource-service';

const RESOURCE_RADIUS_MILES = 25;
const HOME_PREVIEW_COUNT = 4;

export type HomeResourceLookupState =
  | { status: 'loading' }
  | { status: 'ready'; resources: NearbyResource[]; title: string; caption: string | null }
  | { status: 'empty'; title: string; caption: string | null }
  | { status: 'unavailable'; message: string };

function lookupErrorMessage(error: unknown): string {
  if (error instanceof ResourceServiceError && error.notConfigured) {
    return "Resource lookup isn't available right now — check back soon.";
  }
  if (error instanceof ResourceServiceError && error.kind === 'unauthorized') {
    return 'Please sign in to look up resources near you.';
  }
  return "We couldn't load resources near you. Check your connection and try again.";
}

const NO_LOCATION_MESSAGE =
  "We couldn't determine your location. Add your ZIP code in your profile to find resources near you.";

type LocationPermissionStatus = 'granted' | 'denied';

export function useHomeResources(): HomeResourceLookupState {
  const app = useAppState();
  const [lookup, setLookup] = useState<HomeResourceLookupState>({ status: 'loading' });
  const mountedRef = useRef(true);

  // Permission resolves once per mount; the tab remounts every time it is
  // selected, so this runs on each visit (mirrors the Resources tab).
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      let permission: LocationPermissionStatus = 'denied';
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        permission = status === Location.PermissionStatus.GRANTED ? 'granted' : 'denied';
      } catch {
        permission = 'denied';
      }
      // Persist the decision (same shape onboarding writes); a sync failure
      // must not block the lookup.
      try {
        await app.savePreferences({ locationPermissionStatus: permission });
      } catch {
        // Intentionally ignored — the lookup below does not depend on it.
      }
      if (!mountedRef.current) return;

      const snap = app;
      const zip = snap.profile.zip.trim();
      const lookupKind = chooseResourceLookupKind(permission, snap.profile.zip);

      // Honest title/caption: "Near You" only with a real user-derived location.
      const title = lookupKind ? 'Resources Near You' : 'Community Resources';
      const caption =
        permission === 'granted'
          ? 'Based on your current location'
          : lookupKind === 'zip'
            ? `Showing results near ${zip}`
            : null;

      if (!lookupKind) {
        setLookup({ status: 'unavailable', message: NO_LOCATION_MESSAGE });
        return;
      }

      setLookup({ status: 'loading' });
      try {
        const resources =
          lookupKind === 'coords'
            ? await (async () => {
                const position = await Location.getCurrentPositionAsync({});
                return fetchNearby(
                  position.coords.latitude,
                  position.coords.longitude,
                  RESOURCE_RADIUS_MILES,
                );
              })()
            : await fetchByZip(zip);
        if (!mountedRef.current) return;
        const preview = resources.slice(0, HOME_PREVIEW_COUNT);
        setLookup(
          preview.length > 0
            ? { status: 'ready', resources: preview, title, caption }
            : { status: 'empty', title, caption },
        );
      } catch (error) {
        if (mountedRef.current) setLookup({ status: 'unavailable', message: lookupErrorMessage(error) });
      }
    })();
    return () => {
      mountedRef.current = false;
    };
    // `app` is intentionally the mount-time snapshot: the tab remounts on
    // every visit, so the effect always sees fresh state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return lookup;
}

/** Miles → "0.8 mi", null-safe (renders nothing when the backend gave none). */
export function formatResourceDistance(distanceMi: number | null): string | null {
  return distanceMi != null ? `${distanceMi.toFixed(1)} mi` : null;
}
