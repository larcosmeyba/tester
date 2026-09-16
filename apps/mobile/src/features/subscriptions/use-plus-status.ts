/**
 * Plus subscription status for the app's subscription UI.
 *
 * Reads the `plus` entitlement from RevenueCat. When the SDK isn't configured
 * (no public keys yet) this simply reports "not Plus" — the paywall renders
 * in preview mode and the purchase button stays honest about it.
 */
import { useCallback, useEffect, useState } from 'react';

import { isPlusActive } from './revenuecat';

export function usePlusStatus() {
  const [isPlus, setIsPlus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setIsPlus(await isPlusActive());
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- one-shot entitlement check:
     the Plus status is read once when the hook mounts; refresh() is also
     exposed for explicit re-checks after purchase/restore. */
  useEffect(() => {
    refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { isPlus, isLoading, refresh };
}
