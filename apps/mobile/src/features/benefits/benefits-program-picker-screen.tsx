/**
 * Benefits flow, Page 2 — Choose Benefits (audit Section 3).
 *
 * Matches Marcos's screenshots: "What would you like to apply for?" with the
 * state pill, the privacy banner, the 3-step "How it works", multi-select
 * program cards, and a bottom CTA that stays disabled until at least one
 * program is selected.
 *
 * Programs come from the picker catalog (built on the existing program
 * config), never a second hardcoded list. Continue starts one draft
 * application per selected program for the chosen state and hands the ids to
 * the group questionnaire — one questionnaire covers all of them because
 * answers are stored once on the benefits profile and shared.
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, HiveIcon, Screen } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { type Navigation } from '@/features/app/navigation-types';
import {
  fetchBenefitsApplication,
  fetchBenefitsApplications,
  fetchBenefitsForms,
  startBenefitsApplication,
} from './benefits-repository';
import { programCatalog, type CatalogProgram } from './benefits-program-catalog';

// TODO (Section 3 audit): confirm this is the exact Penny illustration from
// Marcos's screenshots. penny-money.png is the closest shipped asset.
const pennySource = require('@/assets/images/hive/penny-money.png');

const HOW_IT_WORKS = [
  'Select the benefits\nyou want to apply for',
  'Complete one\nuniversal questionnaire',
  'Review your auto-\nfilled applications &\ndownload',
];

function normaliseProgram(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function BenefitsProgramPickerScreen({ nav, state }: { nav: Navigation; state: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  function toggle(programId: string) {
    setSelected((current) =>
      current.includes(programId)
        ? current.filter((id) => id !== programId)
        : [...current, programId],
    );
  }

  async function continueToQuestionnaire() {
    if (selected.length === 0 || starting) return;
    setStarting(true);
    setError('');
    try {
      const forms = await fetchBenefitsForms(state);
      // Reuse existing drafts for this state so returning users don't pile up
      // duplicate applications; only start what isn't already drafted.
      const existing = await fetchBenefitsApplications();
      const applicationIds: string[] = [];
      const missing: string[] = [];

      for (const programId of selected) {
        const already = existing.find(
          (application) =>
            normaliseProgram(application.form.program) === programId &&
            (application.form.state ?? '') === state &&
            application.status !== 'COMPLETED' &&
            application.status !== 'SUPERSEDED',
        );
        if (already) {
          applicationIds.push(already.id);
          continue;
        }
        const form = forms.find((candidate) => normaliseProgram(candidate.program) === programId);
        if (!form) {
          const program = programCatalog.find((entry) => entry.id === programId);
          missing.push(program?.name ?? programId);
          continue;
        }
        const application = await startBenefitsApplication(form.id);
        applicationIds.push(application.id);
      }

      if (missing.length > 0) {
        setError(
          `We don't have an application form for ${missing.join(', ')} in ${state} yet.`,
        );
        return;
      }
      // Refresh: the questionnaire reads the union of outstanding questions.
      for (const id of applicationIds) {
        await fetchBenefitsApplication(id);
      }
      nav.push('benefitsGroupQuestionnaire', { applicationIds, state });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start your applications.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image source={pennySource} style={styles.penny} resizeMode="contain" />
          <View style={styles.headerText}>
            <Text style={styles.title}>What would you like to apply for?</Text>
            <Text style={styles.subtitle}>Apply for multiple benefits with one questionnaire.</Text>
          </View>
        </View>

        <View style={styles.statePill}>
          <HiveIcon name="map" size={14} color={HiveColors.green} />
          <Text style={styles.statePillText}>Showing programs available in {state}</Text>
        </View>

        <View style={styles.privacyBanner}>
          <HiveIcon name="shield" size={18} color={HiveColors.green} />
          <Text style={styles.privacyText}>
            Your information stays private and is never submitted without your review.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.steps}>
          {HOW_IT_WORKS.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Select programs to apply for</Text>
        <Text style={styles.sectionSubtitle}>
          Choose one or more — you&apos;ll fill out a single questionnaire that covers all of them.
        </Text>

        <View style={styles.cards}>
          {programCatalog.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              selected={selected.includes(program.id)}
              onToggle={() => toggle(program.id)}
            />
          ))}
        </View>

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.ctaWrap}>
        <AppButton
          title={starting ? 'Starting…' : selected.length === 0 ? 'Select at least one program above' : 'Continue'}
          onPress={continueToQuestionnaire}
          disabled={selected.length === 0 || starting}
        />
      </View>
    </Screen>
  );
}

function ProgramCard({
  program,
  selected,
  onToggle,
}: {
  program: CatalogProgram;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${program.name}, ${program.categoryPill}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.cardPressed]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <HiveIcon name="check" size={14} color={HiveColors.white} /> : null}
      </View>
      <View style={[styles.iconTile, { backgroundColor: program.tileColor }]}>
        <HiveIcon name={program.icon} size={24} color={HiveColors.green} />
      </View>
      <View style={styles.cardText}>
        <View style={styles.nameRow}>
          <Text style={styles.programName}>{program.name}</Text>
          <View style={[styles.pill, { backgroundColor: program.tileColor }]}>
            <Text style={styles.pillText}>{program.categoryPill}</Text>
          </View>
        </View>
        <Text style={styles.programBlurb}>{program.pickerBlurb}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  penny: { width: 56, height: 56 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 24, fontWeight: '800', color: HiveColors.text },
  subtitle: { fontSize: 14, color: HiveColors.textSecondary },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: HiveColors.greenLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statePillText: { fontSize: 13, fontWeight: '600', color: HiveColors.green },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: HiveColors.greenLight,
    borderRadius: 12,
    padding: Spacing.three,
  },
  privacyText: { flex: 1, fontSize: 14, color: HiveColors.textSecondary },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: HiveColors.text, marginTop: Spacing.one },
  sectionSubtitle: { fontSize: 14, color: HiveColors.textSecondary, marginTop: -Spacing.one },
  steps: { flexDirection: 'row', gap: Spacing.one },
  step: { flex: 1, alignItems: 'center', gap: Spacing.one },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: HiveColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: HiveColors.white, fontSize: 17, fontWeight: '800' },
  stepText: { fontSize: 12, color: HiveColors.textSecondary, textAlign: 'center' },
  cards: { gap: Spacing.two, marginTop: Spacing.one },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: HiveColors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HiveColors.border,
    padding: Spacing.three,
  },
  cardSelected: { borderColor: HiveColors.green, borderWidth: 2 },
  cardPressed: { opacity: 0.85 },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: HiveColors.green, borderColor: HiveColors.green },
  iconTile: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  programName: { fontSize: 17, fontWeight: '800', color: HiveColors.text },
  pill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700', color: HiveColors.green },
  programBlurb: { fontSize: 13, color: HiveColors.textSecondary },
  error: { color: HiveColors.danger, fontSize: 13 },
  ctaWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    backgroundColor: HiveColors.white,
    borderTopWidth: 1,
    borderTopColor: HiveColors.border,
  },
});
