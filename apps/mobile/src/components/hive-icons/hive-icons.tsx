/**
 * Platform-independent glyph set backing `HiveIcon` (see components/hive-ui.tsx).
 *
 * Every glyph is hand-built from Views on a 24x24 grid — the same approach as
 * components/tab-icons.tsx — so each icon renders identically on iOS and
 * Android with no native dependency. Stroke weight (2.2) and rounded caps match
 * the Figma tab-icon aesthetic.
 *
 * Glyphs marked `// FIGMA-DROPIN` are clean stand-ins drawn to the same grid
 * and stroke spec: when the designer's Figma artwork lands, swap the function
 * body and remove the marker. The five tab icons (home, calendar, penny,
 * resources, finance) and the bell are final artwork — do not redraw those.
 *
 * Key names in `hiveIconGlyphs` are the public contract (`HiveIconName` is
 * `keyof typeof iconMap` in hive-ui.tsx): do not rename or remove keys.
 */

import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';

import { TabIcon } from '../tab-icons';
import { FigmaIcon } from '../figma-icons';

const GRID = 24;
const STROKE = 2.2;

export type HiveGlyphProps = { color: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function Grid({ children }: { children: ReactNode }): ReactElement {
  return <View style={{ width: GRID, height: GRID }}>{children}</View>;
}

type BarProps = {
  cx: number;
  cy: number;
  len: number;
  /** Degrees clockwise from horizontal; the bar rotates about its center. */
  angle?: number;
  sw?: number;
  color: string;
};

/** A rounded-end stroke segment centered at (cx, cy). */
function Bar({ cx, cy, len, angle = 0, sw = STROKE, color }: BarProps): ReactElement {
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - len / 2,
        top: cy - sw / 2,
        width: len,
        height: sw,
        borderRadius: sw / 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

type RingProps = { cx: number; cy: number; r: number; sw?: number; color: string };

/** An outlined circle centered at (cx, cy). */
function Ring({ cx, cy, r, sw = STROKE, color }: RingProps): ReactElement {
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        borderWidth: sw,
        borderColor: color,
      }}
    />
  );
}

type DotProps = { cx: number; cy: number; r: number; color: string };

/** A filled circle centered at (cx, cy). */
function Dot({ cx, cy, r, color }: DotProps): ReactElement {
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: color,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Figma set — final artwork, reused from tab-icons.tsx. Do not redraw. */
/* ------------------------------------------------------------------ */

function HomeGlyph({ color }: HiveGlyphProps): ReactElement {
  return <TabIcon name="home" size={GRID} color={color} />;
}

function CalendarGlyph({ color }: HiveGlyphProps): ReactElement {
  return <TabIcon name="calendar" size={GRID} color={color} />;
}

function PennyGlyph({ color }: HiveGlyphProps): ReactElement {
  return <TabIcon name="penny" size={GRID} color={color} />;
}

function ResourcesGlyph({ color }: HiveGlyphProps): ReactElement {
  return <TabIcon name="resources" size={GRID} color={color} />;
}

function FinanceGlyph({ color }: HiveGlyphProps): ReactElement {
  return <TabIcon name="finance" size={GRID} color={color} />;
}

/* ------------------------------------------------------------------ */
/* Shared / UI chrome                                                  */
/* ------------------------------------------------------------------ */

// Final artwork — ported from the Finance header bell in
// features/budget/budget-screens.tsx (already a custom glyph per checklist).
function BellGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Top knob */}
      <Dot cx={12} cy={3.7} r={1.1} color={color} />
      {/* Dome */}
      <View
        style={{
          position: 'absolute',
          left: 6.5,
          top: 4.6,
          width: 11,
          height: 11,
          borderWidth: STROKE,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: 5.5,
          borderTopRightRadius: 5.5,
        }}
      />
      {/* Skirt */}
      <Bar cx={12} cy={15.4} len={14.5} color={color} />
      {/* Clapper */}
      <Dot cx={12} cy={19.5} r={1.1} color={color} />
    </Grid>
  );
}

// Final Figma artwork — Marcos Leyba, 2026-09-10.
function UserGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="user" size={GRID} color={color} />;
}

// FIGMA-DROPIN
function GearGlyph({ color }: HiveGlyphProps): ReactElement {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Grid>
      {teeth.map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <Bar
            key={a}
            cx={12 + 8.5 * Math.sin(rad)}
            cy={12 - 8.5 * Math.cos(rad)}
            len={3.6}
            angle={90 - a}
            color={color}
          />
        );
      })}
      <Ring cx={12} cy={12} r={6.5} color={color} />
      <Ring cx={12} cy={12} r={2.4} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function BackGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={11} cy={8.75} len={9} angle={-45} color={color} />
      <Bar cx={11} cy={15.25} len={9} angle={45} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function NextGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={13} cy={8.75} len={9} angle={45} color={color} />
      <Bar cx={13} cy={15.25} len={9} angle={-45} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function PlusGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={12} cy={12} len={12} color={color} />
      <Bar cx={12} cy={12} len={12} angle={90} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function CheckGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={8.2} cy={14.3} len={6.4} angle={45} color={color} />
      <Bar cx={14} cy={11.6} len={11} angle={-45} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function CloseGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={12} cy={12} len={12.5} angle={45} color={color} />
      <Bar cx={12} cy={12} len={12.5} angle={-45} color={color} />
    </Grid>
  );
}

/* ------------------------------------------------------------------ */
/* Home / feature cards                                               */
/* ------------------------------------------------------------------ */

// Final Figma artwork — Marcos Leyba, 2026-09-10.
function CardGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="card" size={GRID} color={color} />;
}

// Final Figma artwork — Marcos Leyba, 2026-09-10.
function DocGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="doc" size={GRID} color={color} />;
}

// Final Figma artwork — Marcos Leyba, 2026-09-10.
function ForkGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="fork" size={GRID} color={color} />;
}

// Final artwork: the "Meal Plan for the Week" fork variant.
function ForkMealplanGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="forkMealplan" size={GRID} color={color} />;
}

// Final Figma artwork — Marcos Leyba, 2026-09-10.
function FridgeGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="fridge" size={GRID} color={color} />;
}

// Final Figma artwork — Marcos Leyba, 2026-09-10.
function MapPinGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="map" size={GRID} color={color} />;
}

// Final Figma artwork — Marcos Leyba, 2026-09-10.
function CartGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="cart" size={GRID} color={color} />;
}

// Final artwork: the "Coming Soon — Meal Plan for the Week" cart variant.
function CartMealplanGlyph({ color }: HiveGlyphProps): ReactElement {
  return <FigmaIcon name="cartMealplan" size={GRID} color={color} />;
}

/* ------------------------------------------------------------------ */
/* Meal plan / pantry / resources                                      */
/* ------------------------------------------------------------------ */

// FIGMA-DROPIN
function PlayGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={9} cy={12} len={12} angle={90} color={color} />
      <Bar cx={13.25} cy={9} len={10.4} angle={35.2} color={color} />
      <Bar cx={13.25} cy={15} len={10.4} angle={-35.2} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function BoxGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Lid */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: 4.5,
          width: 16,
          height: 4.5,
          borderRadius: 2,
          borderWidth: STROKE,
          borderColor: color,
        }}
      />
      {/* Body */}
      <View
        style={{
          position: 'absolute',
          left: 5.5,
          top: 9,
          width: 13,
          height: 11,
          borderWidth: STROKE,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
    </Grid>
  );
}

// FIGMA-DROPIN
function SnowflakeGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {[0, 60, 120].map((a) => (
        <Bar key={a} cx={12} cy={12} len={15} angle={a} color={color} />
      ))}
    </Grid>
  );
}

// FIGMA-DROPIN
function TrashGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Handle */}
      <Bar cx={12} cy={3.5} len={2.5} angle={90} color={color} />
      {/* Lid */}
      <Bar cx={12} cy={5.5} len={14} color={color} />
      {/* Body */}
      <View
        style={{
          position: 'absolute',
          left: 7,
          top: 8,
          width: 10,
          height: 12.5,
          borderWidth: STROKE,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
      {/* Slats */}
      <Bar cx={10.3} cy={14.5} len={6} angle={90} sw={1.8} color={color} />
      <Bar cx={13.7} cy={14.5} len={6} angle={90} sw={1.8} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function ChatGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <View
        style={{
          position: 'absolute',
          left: 3.5,
          top: 5,
          width: 17,
          height: 12,
          borderRadius: 5,
          borderWidth: STROKE,
          borderColor: color,
        }}
      />
      {/* Tail */}
      <Bar cx={7.5} cy={18.75} len={4.9} angle={114} color={color} />
      <Bar cx={9} cy={18.9} len={6.5} angle={-40} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function CameraGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Viewfinder bump */}
      <Bar cx={10} cy={6.5} len={5.5} sw={3} color={color} />
      {/* Body */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: 8,
          width: 16,
          height: 11.5,
          borderRadius: 3,
          borderWidth: STROKE,
          borderColor: color,
        }}
      />
      {/* Lens */}
      <Ring cx={12} cy={13.75} r={3.2} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function ChartGlyph({ color }: HiveGlyphProps): ReactElement {
  const bars = [
    { left: 6, top: 13, height: 6.5 },
    { left: 10.4, top: 9.5, height: 10 },
    { left: 14.8, top: 6, height: 13.5 },
  ];
  return (
    <Grid>
      {bars.map((b) => (
        <View
          key={b.left}
          style={{
            position: 'absolute',
            left: b.left,
            top: b.top,
            width: 3.2,
            height: b.height,
            borderRadius: 1.6,
            backgroundColor: color,
          }}
        />
      ))}
      {/* Baseline */}
      <Bar cx={12} cy={19.5} len={16} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function ShieldGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={12} cy={5.5} len={11} color={color} />
      <Bar cx={9.25} cy={12.5} len={15} angle={68.6} color={color} />
      <Bar cx={14.75} cy={12.5} len={15} angle={-68.6} color={color} />
      {/* Inner check */}
      <Bar cx={10.2} cy={11.5} len={4.2} angle={45} color={color} />
      <Bar cx={13.2} cy={10.3} len={6.5} angle={-45} color={color} />
    </Grid>
  );
}

/* ------------------------------------------------------------------ */
/* Onboarding / misc                                                  */
/* ------------------------------------------------------------------ */

// FIGMA-DROPIN
function HeartGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Ring cx={8.4} cy={8.6} r={3.9} color={color} />
      <Ring cx={15.6} cy={8.6} r={3.9} color={color} />
      <Bar cx={8.8} cy={15.5} len={10.2} angle={51.3} color={color} />
      <Bar cx={15.2} cy={15.5} len={10.2} angle={-51.3} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function BoltGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={10.25} cy={8.25} len={12.4} angle={-58.3} color={color} />
      <Bar cx={9} cy={13.5} len={4} color={color} />
      <Bar cx={10.75} cy={17.25} len={7.5} angle={90} color={color} />
      <Bar cx={13.75} cy={15.75} len={12.4} angle={-58.3} color={color} />
      <Bar cx={15} cy={10.5} len={4} color={color} />
      <Bar cx={13.25} cy={6.75} len={7.5} angle={90} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function BriefcaseGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Handle */}
      <View
        style={{
          position: 'absolute',
          left: 9,
          top: 5.5,
          width: 6,
          height: 4.5,
          borderWidth: STROKE,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
        }}
      />
      {/* Body */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: 9.5,
          width: 16,
          height: 10,
          borderRadius: 2.5,
          borderWidth: STROKE,
          borderColor: color,
        }}
      />
      {/* Clasp */}
      <Dot cx={12} cy={12.5} r={1.4} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function ChildGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Ring cx={12} cy={6.5} r={3} color={color} />
      {/* Torso */}
      <Bar cx={12} cy={14} len={6.5} angle={90} color={color} />
      {/* Arms */}
      <Bar cx={12} cy={12.5} len={9} color={color} />
      {/* Legs */}
      <Bar cx={10.6} cy={19.5} len={5} angle={20} color={color} />
      <Bar cx={13.4} cy={19.5} len={5} angle={-20} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function SunGlyph({ color }: HiveGlyphProps): ReactElement {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Grid>
      {rays.map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <Bar
            key={a}
            cx={12 + 7.6 * Math.sin(rad)}
            cy={12 - 7.6 * Math.cos(rad)}
            len={3.4}
            angle={90 - a}
            color={color}
          />
        );
      })}
      <Dot cx={12} cy={12} r={3.4} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function SunriseGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Rising sun: half-disc arc sitting on the horizon */}
      <View
        style={{
          position: 'absolute',
          left: 8,
          top: 11.5,
          width: 8,
          height: 8,
          borderRadius: 4,
          borderWidth: STROKE,
          borderColor: 'transparent',
          borderTopColor: color,
          borderLeftColor: color,
          borderRightColor: color,
        }}
      />
      {/* Up arrow */}
      <Bar cx={12} cy={8} len={7} angle={90} color={color} />
      <Bar cx={10.9} cy={6.1} len={3.4} angle={130} color={color} />
      <Bar cx={13.1} cy={6.1} len={3.4} angle={50} color={color} />
      {/* Horizon */}
      <Bar cx={12} cy={17} len={16} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function MoonGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Crescent: ring with the right side open */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          top: 5,
          width: 13,
          height: 13,
          borderRadius: 6.5,
          borderWidth: STROKE,
          borderColor: 'transparent',
          borderLeftColor: color,
          borderTopColor: color,
          borderBottomColor: color,
        }}
      />
    </Grid>
  );
}

// FIGMA-DROPIN
function MicGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      {/* Capsule */}
      <View
        style={{
          position: 'absolute',
          left: 9,
          top: 3,
          width: 6,
          height: 11,
          borderRadius: 3,
          borderWidth: STROKE,
          borderColor: color,
        }}
      />
      {/* Cradle */}
      <View
        style={{
          position: 'absolute',
          left: 7,
          top: 10,
          width: 10,
          height: 7,
          borderWidth: STROKE,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 5,
          borderBottomRightRadius: 5,
        }}
      />
      {/* Stem + base */}
      <Bar cx={12} cy={18.2} len={2.6} angle={90} color={color} />
      <Bar cx={12} cy={20.5} len={8} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function SendGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={12} cy={8} len={17.9} angle={-26.6} color={color} />
      <Bar cx={8} cy={16} len={11.3} angle={45} color={color} />
      <Bar cx={16} cy={12} len={17.9} angle={116.6} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function LeafGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: 4,
          width: 16,
          height: 16,
          borderWidth: STROKE,
          borderColor: color,
          borderTopRightRadius: 16,
          borderBottomLeftRadius: 16,
        }}
      />
      <Bar cx={12} cy={12} len={13} angle={-45} sw={1.8} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN
function DollarGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Ring cx={12} cy={12} r={8.5} color={color} />
      <Bar cx={12} cy={12} len={11} angle={90} color={color} />
      <Bar cx={12} cy={8.4} len={5} color={color} />
      <Bar cx={12} cy={15.6} len={5} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — wallet/billfold for the VA Pension card.
function WalletGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <View
        style={{
          position: 'absolute',
          left: 4.5,
          top: 7,
          width: 15,
          height: 10.5,
          borderRadius: 2.5,
          borderWidth: 2.2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 13.5,
          top: 10.5,
          width: 6,
          height: 3.5,
          borderRadius: 1.75,
          borderWidth: 2.2,
          borderColor: color,
          borderLeftWidth: 0,
        }}
      />
    </Grid>
  );
}

// FIGMA-DROPIN — pie chart for Spending Reports.
function PieGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Ring cx={12} cy={12} r={8.5} color={color} />
      <Bar cx={12} cy={7.8} len={8.4} angle={90} color={color} />
      <Bar cx={15} cy={10.2} len={8.4} angle={35} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — chain-link mark for social import.
function LinkGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Ring cx={9} cy={12} r={4.6} color={color} />
      <Ring cx={15} cy={12} r={4.6} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — circled X as drawn in the Recipe Database card.
function XCircleGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Ring cx={12} cy={12} r={8.5} color={color} />
      <Bar cx={12} cy={12} len={8} angle={45} color={color} />
      <Bar cx={12} cy={12} len={8} angle={135} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — eight-spoke sparkle for the AI Meal Generator card.
function SparkleGlyph({ color }: HiveGlyphProps): ReactElement {
  const spokes = [0, 45, 90, 135].map((angle) => ({ angle }));
  return (
    <Grid>
      {spokes.map((spoke, index) => (
        <Bar key={index} cx={12} cy={12} len={13} angle={spoke.angle} color={color} />
      ))}
      <Dot cx={12} cy={12} r={1.8} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — five-point star outline for the feedback rating.
// Ten segments of a regular 5-point star (outer r=8, inner r=3.2, centered 12,12).
function StarGlyph({ color }: HiveGlyphProps): ReactElement {
  const segments = [
    { cx: 12.95, cy: 6.7, len: 5.73, angle: 70.6 },
    { cx: 16.75, cy: 9.45, len: 5.7, angle: 1 },
    { cx: 17.3, cy: 11.25, len: 5.78, angle: 142.7 },
    { cx: 15.85, cy: 15.75, len: 5.76, angle: 72.8 },
    { cx: 14.35, cy: 16.85, len: 5.74, angle: -144.9 },
    { cx: 9.65, cy: 16.85, len: 5.74, angle: 144.9 },
    { cx: 8.15, cy: 15.75, len: 5.76, angle: -72.8 },
    { cx: 6.7, cy: 11.25, len: 5.78, angle: -142.7 },
    { cx: 7.25, cy: 9.45, len: 5.7, angle: -1 },
    { cx: 11.05, cy: 6.7, len: 5.73, angle: -70.6 },
  ];
  return (
    <Grid>
      {segments.map((segment, index) => (
        <Bar
          key={index}
          cx={segment.cx}
          cy={segment.cy}
          len={segment.len}
          angle={segment.angle}
          color={color}
        />
      ))}
    </Grid>
  );
}

// FIGMA-DROPIN — circled "i" for the About row.
function InfoGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Ring cx={12} cy={12} r={8.5} color={color} />
      <Dot cx={12} cy={8} r={1.6} color={color} />
      <Bar cx={12} cy={14} len={6} angle={90} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — padlock for the locked Premium row.
function LockGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <View
        style={{
          position: 'absolute',
          left: 7,
          top: 4.5,
          width: 10,
          height: 8,
          borderWidth: STROKE,
          borderColor: color,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderBottomWidth: 0,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 5,
          top: 11,
          width: 14,
          height: 10,
          borderWidth: STROKE,
          borderColor: color,
          borderRadius: 2.5,
        }}
      />
      <Dot cx={12} cy={15.5} r={1.4} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — minus for the household stepper.
function MinusGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={12} cy={12} len={10} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — price-tag mark for Deals & Discounts.
function TagGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <View
        style={{
          position: 'absolute',
          left: 5,
          top: 5,
          width: 14,
          height: 14,
          borderWidth: STROKE,
          borderColor: color,
          borderRadius: 4,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <Dot cx={9.5} cy={9.5} r={1.6} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — two-person "household" mark for WIC.
function UsersGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Dot cx={9} cy={8} r={2.6} color={color} />
      <Bar cx={9} cy={14.5} len={8} angle={90} color={color} />
      <Dot cx={16} cy={9.5} r={2.2} color={color} />
      <Bar cx={16} cy={15} len={6.6} angle={90} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — side-view ambulance for Medicaid.
function AmbulanceGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <View
        style={{
          position: 'absolute',
          left: 2.5,
          top: 7,
          width: 15,
          height: 9,
          borderWidth: STROKE,
          borderColor: color,
          borderRadius: 2.5,
        }}
      />
      <Bar cx={7.5} cy={11.5} len={4.5} color={color} />
      <Bar cx={7.5} cy={11.5} len={4.5} angle={90} color={color} />
      <Dot cx={6.5} cy={18} r={2} color={color} />
      <Dot cx={14.5} cy={18} r={2} color={color} />
    </Grid>
  );
}

// FIGMA-DROPIN — hexagon outline for LIHEAP.
function HexagonGlyph({ color }: HiveGlyphProps): ReactElement {
  const r = 7.5;
  const edges = [0, 1, 2, 3, 4, 5].map((i) => {
    const mid = ((i * 60 + 30) * Math.PI) / 180;
    return {
      cx: 12 + r * 0.866 * Math.cos(mid),
      cy: 12 + r * 0.866 * Math.sin(mid),
      angle: i * 60 - 60,
    };
  });
  return (
    <Grid>
      {edges.map((edge, index) => (
        <Bar key={index} cx={edge.cx} cy={edge.cy} len={r} angle={edge.angle} color={color} />
      ))}
    </Grid>
  );
}

// FIGMA-DROPIN — service medal for VA Disability.
function MedalGlyph({ color }: HiveGlyphProps): ReactElement {
  return (
    <Grid>
      <Bar cx={10} cy={6.5} len={6} angle={62} color={color} />
      <Bar cx={14} cy={6.5} len={6} angle={118} color={color} />
      <Ring cx={12} cy={15} r={4.6} color={color} />
      <Dot cx={12} cy={15} r={1.4} color={color} />
    </Grid>
  );
}

/* ------------------------------------------------------------------ */
/* Name -> glyph map. Aliased as `iconMap` in hive-ui.tsx.             */
/* ------------------------------------------------------------------ */

export const hiveIconGlyphs = {
  home: HomeGlyph,
  calendar: CalendarGlyph,
  penny: PennyGlyph,
  resources: ResourcesGlyph,
  finance: FinanceGlyph,
  user: UserGlyph,
  bell: BellGlyph,
  gear: GearGlyph,
  back: BackGlyph,
  next: NextGlyph,
  plus: PlusGlyph,
  check: CheckGlyph,
  close: CloseGlyph,
  card: CardGlyph,
  doc: DocGlyph,
  fork: ForkGlyph,
  'fork-mealplan': ForkMealplanGlyph,
  fridge: FridgeGlyph,
  map: MapPinGlyph,
  cart: CartGlyph,
  'cart-mealplan': CartMealplanGlyph,
  play: PlayGlyph,
  box: BoxGlyph,
  snow: SnowflakeGlyph,
  trash: TrashGlyph,
  chat: ChatGlyph,
  camera: CameraGlyph,
  chart: ChartGlyph,
  shield: ShieldGlyph,
  heart: HeartGlyph,
  bolt: BoltGlyph,
  job: BriefcaseGlyph,
  child: ChildGlyph,
  sun: SunGlyph,
  sunrise: SunriseGlyph,
  moon: MoonGlyph,
  mic: MicGlyph,
  send: SendGlyph,
  leaf: LeafGlyph,
  dollar: DollarGlyph,
  users: UsersGlyph,
  ambulance: AmbulanceGlyph,
  hexagon: HexagonGlyph,
  medal: MedalGlyph,
  tag: TagGlyph,
  star: StarGlyph,
  info: InfoGlyph,
  lock: LockGlyph,
  minus: MinusGlyph,
  link: LinkGlyph,
  xcircle: XCircleGlyph,
  sparkle: SparkleGlyph,
  pie: PieGlyph,
  wallet: WalletGlyph,
} as const;
