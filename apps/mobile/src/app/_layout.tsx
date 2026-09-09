import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { AuthProvider } from "@/auth/auth-context";
import { AppStateProvider } from "@/state/app-state";
import { MealPlanProvider } from "@/features/meals/meal-plan-context";
import { PantryProvider } from "@/features/pantry/pantry-context";
import { NotificationDeepLinkHandler } from "@/features/notifications/notification-deep-link-handler";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <AuthProvider>
      <AppStateProvider>
        <PantryProvider>
          <MealPlanProvider>
            <NotificationDeepLinkHandler />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth/verified" />
              <Stack.Screen name="auth/reset-password" />
            </Stack>
          </MealPlanProvider>
        </PantryProvider>
      </AppStateProvider>
    </AuthProvider>
  );
}
