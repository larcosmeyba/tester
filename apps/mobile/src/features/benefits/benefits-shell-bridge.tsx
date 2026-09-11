/**
 * The bridge between the app-state shell and the benefits screens.
 *
 * Two navigation systems grew up side by side: the shell in
 * features/app/app-root.tsx, which owns a stack of ScreenNames and renders
 * one screen at a time, and the expo-router routes under src/app/resources,
 * which render the same screens outside the shell. There is one benefits
 * flow, so the screens cannot be written twice — instead they navigate
 * through this bridge.
 *
 * Inside the shell, a screen is wrapped in <BenefitsShellBridge nav params>:
 * useBenefitsRouter() returns a shell-backed router that translates the
 * expo-style hrefs the screens use ("/resources/applications/abc") into
 * shell pushes, and useBenefitsParams() returns the shell route's params.
 *
 * Under expo-router (the src/app/resources re-exports) there is no bridge,
 * and both hooks fall back to the real expo-router hooks, so those routes
 * keep working exactly as before.
 *
 * The href-to-shell mapping is a pure function (benefitsHrefToShellRoute) so
 * the reconciliation is testable without rendering anything.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocalSearchParams as useExpoParams, useRouter as useExpoRouter } from 'expo-router';

import type { Navigation } from '@/features/app/navigation-types';
import { benefitsHrefToShellRoute } from '@/features/benefits/benefits-route-mapping';

export type BenefitsBridgeRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  setParams: (params: Record<string, string | undefined>) => void;
};

type BridgeValue = {
  router: BenefitsBridgeRouter;
  params: Record<string, string | undefined>;
};

const BridgeContext = createContext<BridgeValue | null>(null);

function normalizeParams(params: Record<string, unknown> | undefined): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  if (!params) return normalized;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') normalized[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') normalized[key] = String(value);
    else normalized[key] = undefined;
  }
  return normalized;
}

function shellRouter(
  nav: Navigation,
  setParamOverrides: (params: Record<string, string | undefined>) => void,
): BenefitsBridgeRouter {
  const go = (method: 'push' | 'replace', href: string) => {
    const route = benefitsHrefToShellRoute(href);
    // A href outside the benefits flow is ignored rather than followed: the
    // screens only ever navigate within the flow, and leaving the shell for
    // an unknown path would strand the user outside it.
    if (!route) return;
    nav[method](route.name, route.params);
  };
  return {
    push: (href: string) => go('push', href),
    replace: (href: string) => go('replace', href),
    back: () => nav.back(),
    setParams: (params: Record<string, string | undefined>) =>
      setParamOverrides(normalizeParams(params)),
  };
}

export function BenefitsShellBridge({
  nav,
  params,
  children,
}: {
  nav: Navigation;
  params?: Record<string, unknown>;
  children: ReactNode;
}) {
  const [paramOverrides, setParamOverrides] = useState<Record<string, string | undefined>>({});

  const applyParamOverrides = useCallback((overrides: Record<string, string | undefined>) => {
    setParamOverrides((current) => ({ ...current, ...overrides }));
  }, []);

  const value = useMemo<BridgeValue>(
    () => ({
      router: shellRouter(nav, applyParamOverrides),
      params: { ...normalizeParams(params), ...paramOverrides },
    }),
    [nav, params, paramOverrides, applyParamOverrides],
  );

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

/**
 * The router the benefits screens navigate with. Inside the shell it is the
 * shell-backed translation above; under expo-router it is the real router.
 */
export function useBenefitsRouter(): BenefitsBridgeRouter {
  const bridge = useContext(BridgeContext);
  const expoRouter = useExpoRouter();
  if (bridge) return bridge.router;
  return {
    push: (href: string) => expoRouter.push(href as never),
    replace: (href: string) => expoRouter.replace(href as never),
    back: () => expoRouter.back(),
    setParams: (params: Record<string, string | undefined>) =>
      expoRouter.setParams(params as never),
  };
}

/**
 * The params the benefits screens read. Inside the shell they are the shell
 * route's params (plus any setParams overrides); under expo-router they are
 * the route's search params.
 */
export function useBenefitsParams<T extends Record<string, string | string[]>>(): T {
  const bridge = useContext(BridgeContext);
  const expoParams = useExpoParams<T>();
  return (bridge ? bridge.params : expoParams) as T;
}
