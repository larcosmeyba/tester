import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { AuthProvider } from "@/auth/auth-context";
import { AppStateProvider } from "@/state/app-state";
import { MealPlanProvider } from "@/features/meals/meal-plan-context";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <AuthProvider>
      <AppStateProvider>
        <MealPlanProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth/verified" />
            <Stack.Screen name="auth/reset-password" />
          </Stack>
        </MealPlanProvider>
      </AppStateProvider>
    </AuthProvider>
  );
}
