/**
 * Custom bottom tab bar icons, drawn from the Figma set.
 *
 * Hand-built from Views (no new native dependency), so they render identically
 * on iOS and Android — the same technique the HiveIcon system now uses
 * throughout the app.
 *
 * Each glyph is designed on a 24x24 grid and scaled to the requested size, so
 * the geometry below is in grid units.
 */

import { View } from 'react-native';

export type TabIconName = 'home' | 'calendar' | 'penny' | 'resources' | 'finance';

const GRID = 24;

function HomeGlyph({ color }: { color: string }) {
  const sw = 2.2;
  return (
    <View style={{ width: GRID, height: GRID }}>
      {/* Roof: two bars meeting at the apex, eaves landing on the body walls. */}
      <View
        style={{
          position: 'absolute',
          left: 2.75,
          top: 7.15,
          width: 11,
          height: sw,
          borderRadius: sw / 2,
          backgroundColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 10.25,
          top: 7.15,
          width: 11,
          height: sw,
          borderRadius: sw / 2,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      {/* Body: open-top rect tucked under the roof. */}
      <View
        style={{
          position: 'absolute',
          left: 5,
          top: 11,
          width: 14,
          height: 10,
          borderWidth: sw,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 1.5,
          borderBottomRightRadius: 1.5,
        }}
      />
    </View>
  );
}

function CalendarGlyph({ color }: { color: string }) {
  const sw = 2.2;
  return (
    <View style={{ width: GRID, height: GRID }}>
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: 6.5,
          width: 16,
          height: 14.5,
          borderWidth: sw,
          borderColor: color,
          borderRadius: 3,
        }}
      />
      {/* Binder rings. */}
      <View
        style={{
          position: 'absolute',
          left: 7.7,
          top: 3.5,
          width: 2.6,
          height: 5.5,
          borderRadius: 1.3,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 13.7,
          top: 3.5,
          width: 2.6,
          height: 5.5,
          borderRadius: 1.3,
          backgroundColor: color,
        }}
      />
      {/* Header divider. */}
      <View
        style={{
          position: 'absolute',
          left: 6.2,
          top: 11.5,
          width: 11.6,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function PennyGlyph({ color }: { color: string }) {
  const sw = 2.2;
  return (
    <View style={{ width: GRID, height: GRID }}>
      {/* Antennae, splayed outward, meeting the top of the head. */}
      <View
        style={{
          position: 'absolute',
          left: 6.5,
          top: 2.5,
          width: sw,
          height: 6.5,
          borderRadius: sw / 2,
          backgroundColor: color,
          transform: [{ rotate: '-25deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 15.3,
          top: 2.5,
          width: sw,
          height: 6.5,
          borderRadius: sw / 2,
          backgroundColor: color,
          transform: [{ rotate: '25deg' }],
        }}
      />
      {/* Antenna tips. */}
      <View
        style={{
          position: 'absolute',
          left: 4.43,
          top: 1,
          width: 3.6,
          height: 3.6,
          borderRadius: 1.8,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 15.97,
          top: 1,
          width: 3.6,
          height: 3.6,
          borderRadius: 1.8,
          backgroundColor: color,
        }}
      />
      {/* Head. */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          top: 8,
          width: 16,
          height: 15,
          borderRadius: 7.5,
          borderWidth: sw,
          borderColor: color,
        }}
      />
      {/* Eyes. */}
      <View
        style={{
          position: 'absolute',
          left: 7.7,
          top: 11.7,
          width: 2.6,
          height: 2.6,
          borderRadius: 1.3,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 13.7,
          top: 11.7,
          width: 2.6,
          height: 2.6,
          borderRadius: 1.3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function BookGlyph({ color }: { color: string }) {
  const sw = 2.2;
  return (
    <View style={{ width: GRID, height: GRID }}>
      <View
        style={{
          position: 'absolute',
          left: 3,
          top: 5.5,
          width: 18,
          height: 13,
          borderWidth: sw,
          borderColor: color,
          borderRadius: 2.5,
        }}
      />
      {/* Center spine. */}
      <View
        style={{
          position: 'absolute',
          left: 10.9,
          top: 5.5,
          width: sw,
          height: 13,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function WalletGlyph({ color }: { color: string }) {
  const sw = 2.2;
  return (
    <View style={{ width: GRID, height: GRID }}>
      <View
        style={{
          position: 'absolute',
          left: 3.5,
          top: 6,
          width: 17,
          height: 12.5,
          borderWidth: sw,
          borderColor: color,
          borderRadius: 3,
        }}
      />
      {/* Clasp dot. */}
      <View
        style={{
          position: 'absolute',
          left: 15,
          top: 10.75,
          width: 3,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * The tab bar icon. `color` is the stroke color: the design-token green when
 * the tab is active, near-black otherwise.
 */
export function TabIcon({ name, size = 22, color }: { name: TabIconName; size?: number; color: string }) {
  const scale = size / GRID;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: GRID, height: GRID, transform: [{ scale }] }}>
        {name === 'home' ? (
          <HomeGlyph color={color} />
        ) : name === 'calendar' ? (
          <CalendarGlyph color={color} />
        ) : name === 'penny' ? (
          <PennyGlyph color={color} />
        ) : name === 'resources' ? (
          <BookGlyph color={color} />
        ) : (
          <WalletGlyph color={color} />
        )}
      </View>
    </View>
  );
}
