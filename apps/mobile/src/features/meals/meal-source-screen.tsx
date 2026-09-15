/**
 * "Build Your Meal Plan" source choice — rebuilt from Marcos's SwiftUI sandbox
 * (`MealGeneratorSourceView`). Two gradient cards:
 *
 * - Import from Social Media (blue): paste a TikTok / Instagram Reel / YouTube
 *   link and Penny transcribes it into a recipe.
 * - AI Meal Generator (purple, "Recommended"): the questionnaire, where Penny
 *   builds the full personalized weekly plan.
 *
 * Route: /meals/source. The questionnaire and video-import routes own their own
 * screens; this one only links out to them.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppHeader, HiveIcon, type HiveIconName, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';

/** Swift sandbox gradient pairs (SwiftUI RGB -> hex). */
const SOCIAL_GRADIENT = ['#1470E6', '#0A42B8'] as const;
const AI_GRADIENT = ['#6629D1', '#38149E'] as const;

export function MealSourceScreen() {
  const router = useRouter();

  return (
    <ScrollScreen>
      <AppHeader title="Meal Plan" onBack={router.back} />
      <View style={styles.body}>
        <View style={styles.heading}>
          <Text style={styles.title}>Build Your Meal Plan</Text>
          <Text style={uiText.muted}>How would you like to create this week&apos;s plan?</Text>
        </View>

        <View style={styles.cards}>
          <SourceCard
            icon="link"
            gradient={SOCIAL_GRADIENT}
            title="Import from Social Media"
            description="Paste a TikTok, Instagram Reel, or YouTube link — we'll transcribe it into a recipe."
            onPress={() => router.push('/meals/video-import')}
          />
          <SourceCard
            icon="sparkles"
            gradient={AI_GRADIENT}
            title="AI Meal Generator"
            description="Answer a few quick questions and let Penny build your full personalized weekly plan."
            badge="Recommended"
            onPress={() => router.push('/meals/questionnaire')}
          />
        </View>

        <View style={styles.footnote}>
          <Text style={styles.bee}>🐝</Text>
          <Text style={[uiText.small, styles.footnoteText]}>
            All options create a full 7-day plan. You can swap individual meals afterward.
          </Text>
        </View>
      </View>
    </ScrollScreen>
  );
}

function SourceCard({
  icon,
  gradient,
  title,
  description,
  badge,
  onPress,
}: {
  icon: HiveIconName;
  gradient: readonly [string, string];
  title: string;
  description: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.cardShadow, { shadowColor: gradient[1] }, pressed && styles.pressed]}>
      <LinearGradient colors={[gradient[0], gradient[1]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.card}>
        <View style={styles.cardIcon}>
          <HiveIcon name={icon} size={22} color={HiveColors.white} />
        </View>
        <View style={styles.cardText}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{title}</Text>
            {badge ? (
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { color: gradient[0] }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
        <HiveIcon name="next" size={13} color="rgba(255,255,255,0.65)" />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: Spacing.three },
  heading: { gap: 6 },
  title: { color: HiveColors.text, fontSize: 22, fontWeight: '700' },
  cards: { gap: 14 },
  cardShadow: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pressed: { opacity: 0.9 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: HiveColors.white, fontSize: 16, fontWeight: '700' },
  badge: {
    backgroundColor: HiveColors.white,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardDescription: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 16 },
  footnote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: Spacing.one },
  bee: { fontSize: 12, lineHeight: 18 },
  footnoteText: { flex: 1 },
});
