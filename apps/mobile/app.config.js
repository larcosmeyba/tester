// Expo app config (was app.json).
//
// Two reasons this is a .js module instead of static JSON:
// 1. The deep-link host (applinks / Android intent filter) must match the
//    deployed backend's public host. That host is not the same in dev and
//    production, so it comes from the EAS build environment
//    (EXPO_PUBLIC_DEEP_LINK_HOST) and falls back to the dev API host for
//    local/dev builds. Set EXPO_PUBLIC_DEEP_LINK_HOST in the production EAS
//    environment to the prod API host (the same value as the backend's
//    APP_PUBLIC_URL) before the production build.
// 2. NSPrivacyCollectedDataTypes is built from one shared list so the
//    privacy manifest, the tracked PrivacyInfo.xcprivacy, and the store
//    privacy-label answers can't drift apart.

const deepLinkHost =
  process.env.EXPO_PUBLIC_DEEP_LINK_HOST || 'helpthehive-dev-api-bybr7qopwa-uc.a.run.app';

// Data types the app actually collects (linked to the user, never used for
// tracking, purpose: app functionality):
// - Name, Email Address, Phone Number: account signup (better-auth);
//   phone stored on user profile, change flow verified by one-time code
// - Photos or Videos: optional profile photo, pantry scan images
// - Precise Location: "resources near you" (optional, ZIP fallback)
// - User ID, Device ID: account id + Expo push token
// - Other Financial Info: benefits questionnaire (income sources, bank
//   accounts, expenses). SSN is never collected — see fieldpath.go neverAsk.
// - Customer Support: feedback emails to support@helpthehive.com
// - Other User Content: Penny chats, meal plans, pantry/grocery lists,
//   benefits answers
// - Search History: grocery product searches (Kroger pricing)
const collectedDataTypes = [
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypePhoneNumber',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypePreciseLocation',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypeDeviceID',
  'NSPrivacyCollectedDataTypeOtherFinancialInfo',
  'NSPrivacyCollectedDataTypeCustomerSupport',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeSearchHistory',
].map((type) => ({
  NSPrivacyCollectedDataType: type,
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
}));

module.exports = {
  expo: {
    name: 'HelpTheHive',
    slug: 'help-the-hive',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'helpthehive',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/images/icon.png',
      bundleIdentifier: 'com.helpthehive',
      associatedDomains: [`applinks:${deepLinkHost}`],
      infoPlist: {
        LSMinimumSystemVersion: '16.4',
        // App uses only standard HTTPS (exempt encryption) — skips Apple's
        // annual export-compliance question in App Store Connect.
        ITSAppUsesNonExemptEncryption: false,
      },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
        NSPrivacyCollectedDataTypes: collectedDataTypes,
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
            NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
            NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
          },
        ],
      },
      buildNumber: '1',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#000000',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      package: 'com.helpthehive',
      allowBackup: false,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: deepLinkHost,
              pathPrefix: '/auth/verified',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      permissions: ['android.permission.POST_NOTIFICATIONS'],
      versionCode: 1,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-secure-store',
        {
          faceIDPermission: false,
        },
      ],
      'expo-notifications',
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow $(PRODUCT_NAME) to access your photos',
          cameraPermission: 'Allow $(PRODUCT_NAME) to use your camera to scan pantry items',
          microphonePermission: false,
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: false,
          locationAlwaysPermission: false,
          motionUsagePermission: false,
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#000000',
          image: './assets/images/hive/logo.png',
          imageWidth: 120,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'de5e96b0-aefb-45e9-8c47-1afe078bcc7d',
      },
    },
    owner: 'help-the-hive',
  },
};
