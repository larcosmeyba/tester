# Xcode parity — tab rebuild report

The Xcode app was treated as the visual and UX source of truth. It was built and
run on a second simulator so every screen could be compared side by side rather
than inferred from Swift source.

## Screens updated

| Tab | What changed |
|---|---|
| **Home** | Rebuilt. Full-colour gradient action cards (purple benefits, orange meal plan), two-column secondary pair (blue "Cook what I have", green "Find Resources near me"), soft green EBT panel with a Coming Soon badge, amber "Use It Soon" banner, honest Coming Soon cards for Deals and Education Hub, floating "+ Add to Pantry" pill. |
| **Meal Plan** | Rebuilt. Centred "Meals for the Week" title with avatar, week calendar strip with month navigation, day label, meal rows with colour-coded thumbnails, empty-day state, Deals coming-soon card, and a two-button shopping bar ("Shop on Your Own List" + Instacart) pinned above the tab bar. |
| **Resources** | Rebuilt. Government Assistance heading, purple gradient benefits card, Penny's review-before-sending note, resource cards with category chip / meta line / "How to Apply" button, and a "More Coming Soon" list. |
| **Finance** | Rebuilt as the reference's coming-soon hub: Penny in a green glow, "Finance Hub", explanation, and a two-column grid of the six tools being built. |
| **Penny / Hive AI** | Rebuilt. Avatar with online dot, greeting, four dark suggestion cards, the required disclaimer, and the "Ask Penny" composer. Replies now route through a provider-neutral service. |

## Components created

All centralized rather than repeated per screen.

- **`hive-cards.tsx`** — `GradientActionRow`, `GradientActionCard`, `ComingSoonCard`, `ComingSoonRow`, `ComingSoonHub`, `SoftGreenPanel`, `AlertBanner`. Gradients are named by role (`benefits`, `meals`, `pantry`, `resources`), so screens never hardcode a colour.
- **`hive-navigation.tsx`** — `FloatingTabBar`, `FloatingPill`, `FloatingPillRow`, `useFloatingTabBarSpace`.
- **`hive-calendar.tsx`** — `WeekCalendarStrip` with `startOfWeek` / `addDays` / `isSameDay`.
- **`hive-instacart.tsx`** — `InstacartButton` in Instacart's own brand colours.
- **`features/penny/penny-service.ts`** — provider-neutral AI seam.

## Components changed

- **`constants/theme.ts`** — green primary with honey accent (was yellow-primary), neutral `#F4F5F6` card surface (was cream). Matches `Theme.swift` and the navigation map.
- **`hive-ui.tsx`** — `AppButton` now carries the reference's vertical green gradient; labels wrap to two lines and shrink rather than clipping.
- **`app-root.tsx`** — Home, Resources, Finance and Penny rebuilt; the flat tab strip replaced with the floating bar; superseded components removed (`QuickAction`, `SponsoredCard`, `EmergencyCard`, `PrescriptionCard`, `OfferCard`, `ListScreen`, `MealCard`).

## Remaining differences from Xcode

1. **Tab bar shape is reimplemented, not native.** The Xcode app uses a plain SwiftUI `TabView`; its inset floating look comes from iOS 26 itself. React Native gets nothing equivalent, so the shape is rebuilt by hand and used on Android too. It is very close but not pixel-identical, and it will not pick up future iOS changes automatically.
2. **Icons are the existing SF Symbols/fallback set**, not the reference's exact glyph choices in every position.
3. **App icon and logo** still use the RN project's assets. The Xcode app has a different beehive mark.
4. **First-run tour.** The Xcode app has a five-page Penny carousel; the RN app compresses this into a single "Meet Penny" sheet. Left as-is — it is existing RN behaviour and not obviously worse.
5. **Meal card thumbnails** are tinted icon tiles. The reference is the same, but intends real recipe imagery once available.

## Intentionally preserved from the newer RN build

- **Meal-plan system** — the 13-section questionnaire, real generation, cost ranges with confidence, budget checking against the range's upper bound, the pricing notice, moving meals between slots, and the grocery list. None of this exists in the Xcode app; all of it was restyled into the Xcode design language rather than dropped.
- **Category filtering** on Resources.
- **Better Auth integration**, GraphQL pantry/profile/preferences, and push tokens.
- **Paywall sheet** — kept and exported, not deleted. Monetisation is a deferred decision.
- **Finance detail screens** (transactions, spending report, connect account) remain routed and intact; they are simply not surfaced from the tab while the data is mock.

## AI architecture

Penny's replies previously came from a hardcoded array of strings. They now go
through `PennyService`, which names no provider — no OpenAI, no Anthropic, no
model identifier, no key. Swapping providers is a server-side decision that
never touches the app. A `stream` method is declared so the UI can be built
against streaming rather than retrofitted later. Safety rules stay on the
backend; the app renders refusals and fallbacks verbatim.

## iOS-specific issues

- **Fixed:** elements pinned above the floating tab bar were rendering behind it
  on devices with a home indicator, because the offset ignored the safe-area
  inset. `useFloatingTabBarSpace` now accounts for it.
- **Fixed:** `expo-linear-gradient` is a native module, so gradients did not
  render until the dev client was rebuilt. Anyone pulling this needs a rebuild
  (`pnpm --filter @helpthehive/mobile ios`), not just a Metro restart.
- The Xcode reference app did not compile on Xcode 26 as shipped — it was missing
  `import CoreData` in `Help_The_HiveApp.swift`. Fixed only in the extracted
  reference copy, not in your original archive.

## Android-specific issues

- **Not yet run on a device or emulator.** No Android SDK is installed on this
  machine, so nothing is marked ANDROID TESTED.
- Both bundles compile: iOS 3.9 MB, Android 4.2 MB Hermes bytecode.
- Shadows are specified for both platforms throughout (`shadowColor`/`shadowRadius`
  for iOS, `elevation` for Android), so the cards should read correctly on both —
  but elevation renders differently from an iOS shadow and will need a look.
- The floating tab bar is not an Android convention. It is used deliberately for
  cross-platform consistency, which is worth confirming once you see it running.

## Quality gate

| Check | Result |
|---|---|
| `pnpm --filter @helpthehive/mobile typecheck` | ✅ clean |
| `pnpm --filter @helpthehive/mobile lint` | ✅ clean |
| `pnpm --filter @helpthehive/mobile test` | ✅ 78 passing |
| iOS bundle | ✅ builds |
| Android bundle | ✅ builds |
| iOS simulator | ✅ all five tabs verified against the reference |
| Android emulator | ⛔ blocked — no SDK |

Run after each tab, not just at the end.

## Reference build

The Xcode app is installed on the simulator as `com.Help-The-Hive` for
side-by-side comparison. Two changes were made to the **extracted copy only**,
never to your archive and never to production code:

- `import CoreData` added so it compiles on Xcode 26.
- `ContentView.route` starts at `.main` to reach the tabs without signing in.
