// The Home tab — benefits-first.
//
// Header with the hive logo and greeting, a gold hero card leading into the
// eligibility check, the in-progress application (wired to the real benefits
// draft state), a Programs grid into the existing benefits flow, and a
// floating "Ask Penny" pill opening Penny chat. Meal, pantry, and finance
// surfaces are shelved: their code stays in the repo, but nothing on this
// screen reaches them anymore.

import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native';

import {
  AppLogo,
  AvatarButton,
  HiveIcon,
  PennyImage,
  type HiveIconName,
} from '@/components/hive-ui';
import { FLOATING_TAB_BAR_HEIGHT, useFloatingTabBarSpace } from '@/components/hive-navigation';
import { useAppState } from '@/state/app-state';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors } from '@/constants/theme';
import {
  applicationPercentComplete,
  applicationProgramLabel,
  isApplicationInProgress,
} from '@/features/benefits/benefits-applications-screen';
import {
  fetchBenefitsApplications,
  type BenefitsApplication,
} from '@/features/benefits/benefits-repository';

const logoSource = require('@/assets/images/hive/logo.png');
const pennySource = require('@/assets/images/hive/penny.png');

const PROGRAMS: { name: string; subtitle: string; icon: HiveIconName }[] = [
  { name: 'SNAP', subtitle: 'Groceries', icon: 'cart' },
  { name: 'WIC', subtitle: 'Nutrition', icon: 'child' },
  { name: 'Medicaid', subtitle: 'Health coverage', icon: 'ambulance' },
  { name: 'LIHEAP', subtitle: 'Energy assistance', icon: 'bolt' },
];

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function ContinueCard({ application, nav }: { application: BenefitsApplication; nav: Navigation }) {
  const pct = applicationPercentComplete(application);
  return (
    <View style={styles.continueCard}>
      <View style={styles.continueIcon}>
        <HiveIcon name="doc" size={22} color={HiveColors.green} />
      </View>
      <View style={sharedStyles.flexOne}>
        <Text style={styles.continueTitle}>{applicationProgramLabel(application)} application</Text>
        <Text style={styles.continueMeta}>{pct}% complete</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Resume application"
        onPress={() => nav.push('benefitsQuestionnaire', { applicationId: application.id })}
        style={({ pressed }) => [styles.resumeButton, pressed && sharedStyles.pressed]}>
        <Text style={styles.resumeText}>Resume</Text>
      </Pressable>
    </View>
  );
}

export function HomeScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const tabBarSpace = useFloatingTabBarSpace();
  const firstName = app.profile.firstName?.trim() || '';
  const greeting = greetingForHour(new Date().getHours());

  const [draft, setDraft] = useState<BenefitsApplication | null>(null);
  const [draftsChecked, setDraftsChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBenefitsApplications()
      .then((list) => {
        if (cancelled) return;
        const inProgress = (list ?? [])
          .filter(isApplicationInProgress)
          .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
        setDraft(inProgress[0] ?? null);
        setDraftsChecked(true);
      })
      .catch(() => {
        // No backend in preview mode: the section simply stays hidden.
        if (!cancelled) setDraftsChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={sharedStyles.tabScreen}>
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}>
          <AppLogo source={logoSource} size={40} />
          <Text style={styles.homeTitle}>Help The Hive</Text>
          <View style={sharedStyles.flexOne} />
          <AvatarButton
            imageUri={app.profile.profileImageUri}
            onPress={() => nav.push('account')}
            accessibilityLabel="View account"
          />
        </View>

        <Text style={styles.homeGreeting}>
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </Text>

        <LinearGradient
          colors={[HiveColors.yellow, HiveColors.yellowDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}>
          <Text style={styles.heroHeadline}>Penny does the paperwork.{'\n'}You just sign.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check what you qualify for"
            onPress={() => nav.push('government')}
            style={({ pressed }) => [styles.heroButton, pressed && sharedStyles.pressed]}>
            <Text style={styles.heroButtonText}>Check what you qualify for</Text>
          </Pressable>
        </LinearGradient>

        {draft ? (
          <View>
            <Text style={styles.sectionTitle}>Continue your application</Text>
            <ContinueCard application={draft} nav={nav} />
          </View>
        ) : draftsChecked ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No applications in progress</Text>
            <Text style={styles.emptySubtitle}>
              Answer a few questions and Penny will prepare your paperwork.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Programs</Text>
        <View style={styles.programGrid}>
          {PROGRAMS.map((program) => (
            <Pressable
              key={program.name}
              accessibilityRole="button"
              accessibilityLabel={`${program.name} — ${program.subtitle}`}
              onPress={() => nav.push('government')}
              style={({ pressed }) => [styles.programCard, pressed && sharedStyles.pressed]}>
              <View style={styles.programIcon}>
                <HiveIcon name={program.icon} size={24} color={HiveColors.green} />
              </View>
              <Text style={styles.programName}>{program.name}</Text>
              <Text style={styles.programSubtitle}>{program.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask Penny"
        onPress={() => nav.push('penny')}
        style={({ pressed }) => [
          styles.pennyPill,
          { bottom: tabBarSpace + 16 },
          pressed && sharedStyles.pressed,
        ]}>
        <PennyImage source={pennySource} size={30} />
        <Text style={styles.pennyPillText}>Ask Penny</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  homeContent: {
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + 110,
  },
  homeHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeTitle: {
    color: HiveColors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  homeGreeting: {
    color: HiveColors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 22,
    padding: 22,
    borderRadius: 20,
    gap: 14,
  },
  heroHeadline: {
    color: HiveColors.text,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  heroButton: {
    alignSelf: 'flex-start',
    backgroundColor: HiveColors.cream,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  heroButtonText: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    color: HiveColors.text,
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 22,
    backgroundColor: HiveColors.card,
    borderRadius: 18,
    padding: 16,
  },
  continueIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueTitle: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  continueMeta: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: HiveColors.border,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: HiveColors.green,
  },
  resumeButton: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: HiveColors.green,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resumeText: {
    color: HiveColors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCard: {
    marginHorizontal: 20,
    marginBottom: 22,
    backgroundColor: HiveColors.card,
    borderRadius: 18,
    padding: 18,
    gap: 4,
  },
  emptyTitle: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 13,
  },
  programGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 20,
  },
  programCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: HiveColors.card,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  programIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: HiveColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  programName: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  programSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 13,
  },
  pennyPill: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: HiveColors.cream,
    borderRadius: 28,
    paddingLeft: 10,
    paddingRight: 18,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pennyPillText: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
