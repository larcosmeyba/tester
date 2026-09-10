/**
 * Build Your Meal Plan — the three-option entry screen.
 *
 * Card copy is transcribed from the Figma (BUild_Your_Meal_Plan_Screen.svg).
 * Note: an earlier pass used different card copy supplied in chat; the Figma
 * render is the authoritative source and now wins — flagged for Marcos.
 *
 * - Import from Social Media → paste video links, transcribed into recipes.
 * - Recipe Database → budget-friendly, EBT-approved recipes.
 * - AI Meal Generator → a few quick questions; Penny builds the weekly plan.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HiveIcon, ScrollScreen, uiText, type HiveIconName } from '@/components/hive-ui';
import { HiveColors, Radii } from '@/constants/theme';

interface BuildOption {
  key: string;
  title: string;
  description: string;
  icon: HiveIconName;
  badge?: string;
  background: string;
  iconBackground: string;
  route: '/meals/import' | '/meals/database' | '/meals/questionnaire';
}

const OPTIONS: BuildOption[] = [
  {
    key: 'social',
    title: 'Import from Social Media',
    description:
      'Paste a TikTok, Instagram Reel, or YouTube link — we\u2019ll transcribe it into a recipe.',
    icon: 'link',
    background: '#2F7CF6',
    iconBackground: 'rgba(255,255,255,0.18)',
    route: '/meals/import',
  },
  {
    key: 'database',
    title: 'Recipe Database',
    description: 'Browse our collection of budget-friendly, EBT-approved recipes.',
    icon: 'xcircle',
    background: '#2E9E4F',
    iconBackground: 'rgba(255,255,255,0.18)',
    route: '/meals/database',
  },
  {
    key: 'ai',
    title: 'AI Meal Generator',
    description:
      'Answer a few quick questions and let Penny build your full personalized weekly plan.',
    icon: 'sparkle',
    badge: 'Recommended',
    background: '#6D28D9',
    iconBackground: 'rgba(255,255,255,0.18)',
    route: '/meals/questionnaire',
  },
];

function BuildOptionCard({ option }: { option: BuildOption }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.title}
      onPress={() => router.push(option.route)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: option.background },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.iconCircle, { backgroundColor: option.iconBackground }]}>
        <HiveIcon name={option.icon} size={34} color="#FFFFFF" />
      </View>
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{option.title}</Text>
          {option.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{option.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description}>{option.description}</Text>
      </View>
      <HiveIcon name="next" size={22} color="rgba(255,255,255,0.85)" />
    </Pressable>
  );
}

export function BuildMealsScreen() {
  return (
    <ScrollScreen>
      <View style={styles.body}>
        <Text style={uiText.title}>Build Your Meal Plan</Text>
        <Text style={uiText.muted}>How would you like to create this week&apos;s plan?</Text>

        <View style={styles.options}>
          {OPTIONS.map((option) => (
            <BuildOptionCard key={option.key} option={option} />
          ))}
        </View>

        <View style={styles.footnote}>
          <Text style={styles.footnoteText}>
            All options create a full 7-day plan. You can swap individual meals afterward.
          </Text>
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  options: {
    gap: 16,
    marginTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.85 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  badge: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  badgeText: {
    color: '#6D28D9',
    fontSize: 14,
    fontWeight: '800',
  },
  description: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    lineHeight: 21,
  },
  footnote: {
    marginTop: 12,
  },
  footnoteText: {
    color: HiveColors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
