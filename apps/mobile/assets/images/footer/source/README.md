# Footer tab source assets — Section 2

These are the ORIGINAL approved SVG files from Marcos's Section 2 ZIP
("Icons for footer" folder), copied verbatim. The app uses the rendered
PNG derivatives in this folder (`tab-*.png`) because `react-native-svg`
is not installed.

## Visually verified tab assignment

The ZIP file names are misleading — this mapping was verified pixel by
pixel against "Footer /Floating Navigation.png" in all five selected
states. Do NOT re-derive it from the file names.

| Tab      | Selected source              | Unselected source              |
|----------|------------------------------|--------------------------------|
| Home     | `Home Taps.svg`              | `Home Not Tapped.svg`          |
| MealPlan | `Resource Tapped.svg`        | `Resource NotTap.svg`          |
| Penny    | `ChatGPT Image ... 2-1.svg`  | `ChatGPT Image ... 2.svg`      |
| Budget   | `pill-MealPlan.svg`          | `tab-MealPlan.svg`             |
| Profile  | `tab-Budget-1.svg`           | `tab-Budget.svg`               |

Selected treatment: grey rounded pill (#E9E9EC, 56x36 rx18) behind a green
(#1B5E20) glyph; unselected glyph is dark (#3C4043), no pill. Penny's SVGs
ship no pill — the app draws the same pill behind the Penny glyph in RN.

The canonical map lives in `src/components/footer-tabs.ts`.
