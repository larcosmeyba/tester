// The Resources tab: resource search, videos, and the government-benefits
// entry points.
//
// Extracted verbatim from app-root.tsx; markup unchanged.
//
// NOTE — DUPLICATES PENDING RETIREMENT: GovernmentScreen,
// BenefitsQuestionnaireScreen and ProgramApplicationScreen here write to local
// app-state only. features/benefits/ holds the newer, backend-connected
// versions of all three, already wired to real routes under app/resources/.
// These three go when the routes stop re-exporting the AppRoot shell; deleting
// them now would break the shell's own navigation with nothing to replace it.

import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadSavedVideoIds, toggleVideoSaved } from '@/features/resources/saved-videos';
import { AppButton, AppHeader, AppTextField, AvatarButton, Card, Chip, HiveIcon, InfoRow, ScrollScreen, SectionHeader, rowStyles, uiText, type HiveIconName } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { ComingSoonRow, GradientActionRow } from '@/components/hive-cards';
import { allVideos, benefitPrograms, type BenefitProgram, nearbyResources, type ResourceItem, type VideoItem } from '@/data/mock-data';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { Bullet, sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { Radii } from '@/constants/theme';

const pennySource = require('@/assets/images/hive/penny.png');

export function ResourcesScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  // The Figma shows exactly the first two nearby resources; "See all" opens
  // the full searchable list.
  const featuredResources = nearbyResources.slice(0, 2);

  return (
    <View style={sharedStyles.tabScreen}>
      <View style={sharedStyles.centeredHeader}>
        <View style={sharedStyles.headerSpacer} />
        <Text style={sharedStyles.centeredHeaderTitle}>Government Assistance</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView contentContainerStyle={styles.resourceContent} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionInset}>
          <GradientActionRow
            icon="doc"
            gradient="benefits"
            title="Start Your Benefits Application"
            subtitle="Penny pre-fills SNAP, Medicaid, WIC & more - you review before submitting"
            onPress={() => nav.push('government')}
          />
        </View>

        <View style={styles.pennyNote}>
          <Image source={pennySource} style={styles.pennyNoteImage} resizeMode="contain" />
          <Text style={styles.pennyNoteText}>
            We&apos;ll guide you through your application step by step. Before anything is printed or
            sent, you&apos;ll have the chance to review every detail and make sure it&apos;s ready to go
            to the right government office.
          </Text>
        </View>

        <SectionHeader title="Resources Near You" onPress={() => nav.push('resourceSearch')} />
        {featuredResources.map((resource) => (
          <ResourceRow
            key={resource.id}
            resource={resource}
            onPress={() => nav.push('resourceDetails', { resource })}
          />
        ))}

        <Text style={sharedStyles.homeSectionTitle}>More Coming Soon</Text>
        <View style={styles.comingSoonList}>
          <ComingSoonRow
            icon="wallet"
            title="How-To Video Guides"
            subtitle="Step-by-step guides for SNAP, housing & more"
            onPress={() => nav.push('resourcesHub')}
          />
          <ComingSoonRow
            icon="tag"
            title="Deals & Discounts"
            subtitle="Curated EBT-friendly deals near you"
            onPress={() => nav.push('deals')}
          />
          <ComingSoonRow
            icon="heart"
            title="Emergency Help"
            subtitle="Urgent housing, food, and crisis resources"
            onPress={() => nav.push('resourceSearch')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

export function ResourceSearchScreen({ nav }: { nav: Navigation }) {
  const [query, setQuery] = useState('');
  const results = nearbyResources.filter((resource) => resource.name.toLowerCase().includes(query.toLowerCase()) || resource.tag.toLowerCase().includes(query.toLowerCase()));

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Find Resources" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <AppTextField label="Search" value={query} onChangeText={setQuery} placeholder="Food, housing, healthcare" />
      </View>
      {(query ? results : nearbyResources).map((resource) => (
        <ResourceRow key={resource.id} resource={resource} onPress={() => nav.push('resourceDetails', { resource })} />
      ))}
    </ScrollScreen>
  );
}

export function ResourceDetailsScreen({ nav, resource }: { nav: Navigation; resource?: ResourceItem }) {
  const chosen = resource ?? nearbyResources[0];

  return (
    <ScrollScreen>
      <AppHeader title="Resource Details" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Chip label={chosen.tag} tone="green" />
        <Text style={uiText.subtitle}>{chosen.name}</Text>
        <Text style={uiText.muted}>{chosen.description}</Text>
        <InfoRow icon="map" title={chosen.address} subtitle={chosen.distance} />
        <InfoRow icon="bell" title={chosen.hours} />
        <InfoRow icon="chat" title={chosen.phone} />
        <InfoRow icon="resources" title={chosen.website} onPress={() => Linking.openURL(`https://${chosen.website}`)} />
        <AppButton title="Call Resource" onPress={() => Linking.openURL(`tel:${chosen.phone}`)} />
      </View>
    </ScrollScreen>
  );
}

/**
 * Government Assistance — the Figma program-selection screen (copy verbatim).
 *
 * Privacy banner, three-step "How it works", eight selectable programs, the
 * "Penny will never invent answers" safeguard, and a CTA that stays disabled
 * until at least one program is picked. The CTA opens the benefits
 * questionnaire; nothing is ever submitted without the user's review.
 */
export function GovernmentScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const canContinue = selected.length > 0;

  function continueToQuestionnaire() {
    // Persist the selection so the questionnaire (and later the benefits
    // submission flow) knows which programs the user picked.
    app.updateGovernmentProfile({ selectedPrograms: selected });
    nav.push('benefitsQuestionnaire', { programs: selected });
  }

  return (
    <SafeAreaView style={govStyles.safeArea} edges={['top', 'bottom']}>
      <View style={govStyles.backRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={nav.back}
          style={({ pressed }) => [govStyles.backButton, pressed && sharedStyles.pressed]}>
          <HiveIcon name="back" size={22} color={HiveColors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={govStyles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={govStyles.title}>Government Assistance</Text>
        <Text style={govStyles.subtitle}>Apply for multiple benefits with one questionnaire.</Text>

        <View style={govStyles.privacyBanner}>
          <View style={govStyles.privacyIcon}>
            <HiveIcon name="xcircle" size={18} color={HiveColors.greenDark} />
          </View>
          <Text style={govStyles.privacyText}>
            Your information stays private and is never submitted without your review.
          </Text>
        </View>

        <Text style={govStyles.sectionTitle}>How it works</Text>
        <View style={govStyles.stepsRow}>
          {HOW_IT_WORKS.map((step) => (
            <View key={step.number} style={govStyles.step}>
              <View style={govStyles.stepNumber}>
                <Text style={govStyles.stepNumberText}>{step.number}</Text>
              </View>
              <Text style={govStyles.stepCaption}>{step.caption}</Text>
            </View>
          ))}
        </View>

        <Text style={govStyles.sectionTitle}>Select programs to apply for</Text>
        <Text style={govStyles.sectionSubtitle}>
          Choose one or more - you&apos;ll fill out a single questionnaire that covers all of them.
        </Text>

        <View style={govStyles.programList}>
          {BENEFIT_PROGRAMS.map((program) => {
            const isSelected = selected.includes(program.id);
            return (
              <Pressable
                key={program.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={program.name}
                onPress={() => toggle(program.id)}
                style={({ pressed }) => [
                  govStyles.programCard,
                  isSelected && govStyles.programCardSelected,
                  pressed && sharedStyles.pressed,
                ]}>
                <View
                  style={[
                    govStyles.radio,
                    isSelected && govStyles.radioSelected,
                  ]}>
                  {isSelected ? (
                    <HiveIcon name="check" size={12} color={HiveColors.white} />
                  ) : null}
                </View>
                <View style={[govStyles.programIcon, { backgroundColor: program.tile }]}>
                  <HiveIcon name={program.icon} size={26} color={program.accent} />
                </View>
                <View style={govStyles.programText}>
                  <View style={govStyles.programNameRow}>
                    <Text style={govStyles.programName}>{program.name}</Text>
                    <View style={[govStyles.pill, { backgroundColor: program.tile }]}>
                      <Text style={[govStyles.pillText, { color: program.accent }]}>
                        {program.category}
                      </Text>
                    </View>
                  </View>
                  <Text style={govStyles.programDescription}>{program.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={govStyles.safeguard}>
          <View style={govStyles.safeguardIcon}>
            <HiveIcon name="penny" size={22} color={HiveColors.greenDark} />
          </View>
          <Text style={govStyles.safeguardText}>
            Penny will never invent answers. Every detail is reviewed by you before anything is
            submitted.
          </Text>
        </View>
      </ScrollView>

      <View style={govStyles.ctaBar}>
        <AppButton
          title={canContinue ? 'Continue' : 'Select at least one program above'}
          disabled={!canContinue}
          onPress={continueToQuestionnaire}
        />
      </View>
    </SafeAreaView>
  );
}

const HOW_IT_WORKS = [
  { number: '1', caption: 'Select the benefits you want to apply for' },
  { number: '2', caption: 'Complete one universal questionnaire' },
  { number: '3', caption: 'Review your auto-filled applications & download' },
];

interface BenefitProgramOption {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: HiveIconName;
  /** Tinted tile/pill background. */
  tile: string;
  /** Glyph + pill text color. */
  accent: string;
}

const BENEFIT_PROGRAMS: BenefitProgramOption[] = [
  {
    id: 'snap',
    name: 'SNAP',
    category: 'Food Assistance',
    description: 'Helps eligible households pay for groceries.',
    icon: 'cart',
    tile: '#E6F6EC',
    accent: '#2E9E4F',
  },
  {
    id: 'wic',
    name: 'WIC',
    category: 'Women, Infants & Children',
    description:
      'Provides food and nutrition support for pregnant women, infants, and young children.',
    icon: 'users',
    tile: '#FDECEA',
    accent: '#C0564F',
  },
  {
    id: 'medicaid',
    name: 'Medicaid',
    category: 'Health Coverage',
    description: 'Provides health coverage for eligible low-income individuals and families.',
    icon: 'ambulance',
    tile: '#E7F0FE',
    accent: '#2F7CF6',
  },
  {
    id: 'liheap',
    name: 'LIHEAP',
    category: 'Utility Assistance',
    description: 'Helps eligible households pay home energy costs.',
    icon: 'hexagon',
    tile: '#F7F0E1',
    accent: '#A07D2C',
  },
  {
    id: 'tanf',
    name: 'TANF',
    category: 'Cash Assistance',
    description: 'Provides temporary cash assistance for eligible families.',
    icon: 'dollar',
    tile: '#F1EAFE',
    accent: '#7C3AED',
  },
  {
    id: 'va_disability',
    name: 'VA Disability',
    category: 'Veterans Affairs',
    description:
      'Monthly tax-free payments for veterans with service-connected disabilities or conditions.',
    icon: 'medal',
    tile: '#E8EDF7',
    accent: '#3B4E8C',
  },
  {
    id: 'va_pension',
    name: 'VA Pension',
    category: 'Veterans Affairs',
    description: 'Provides financial support to low-income wartime veterans and surviving spouses.',
    icon: 'wallet',
    tile: '#E8EDF7',
    accent: '#3B4E8C',
  },
  {
    id: 'va_health_care',
    name: 'VA Health Care',
    category: 'Veterans Affairs',
    description:
      'Provides comprehensive medical care, mental health services, and prescriptions through VA facilities.',
    icon: 'heart',
    tile: '#E8EDF7',
    accent: '#3B4E8C',
  },
];

const govStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: HiveColors.white },
  backRow: { paddingHorizontal: 12, paddingTop: 4 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 20, paddingBottom: 16, gap: 16 },
  title: { color: HiveColors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: HiveColors.textSecondary, fontSize: 16, lineHeight: 22, marginTop: -10 },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#E9F7EF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  privacyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: HiveColors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyText: { flex: 1, color: '#1E5C38', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  sectionTitle: { color: HiveColors.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  sectionSubtitle: { color: HiveColors.textSecondary, fontSize: 15, lineHeight: 21, marginTop: -10 },
  stepsRow: { flexDirection: 'row', gap: 8 },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  stepNumber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E5C38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: HiveColors.white, fontSize: 18, fontWeight: '800' },
  stepCaption: {
    color: HiveColors.text,
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
  },
  programList: { gap: 12 },
  programCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: HiveColors.white,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  programCardSelected: { borderColor: HiveColors.green },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: HiveColors.greenDark, backgroundColor: HiveColors.greenDark },
  programIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programText: { flex: 1, gap: 4 },
  programNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  programName: { color: HiveColors.text, fontSize: 17, fontWeight: '800' },
  pill: { borderRadius: Radii.pill, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontSize: 12, fontWeight: '700' },
  programDescription: { color: HiveColors.textSecondary, fontSize: 14, lineHeight: 20 },
  safeguard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#E9F7EF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  safeguardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeguardText: { flex: 1, color: '#1E5C38', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  ctaBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: HiveColors.white,
    borderTopWidth: 1,
    borderTopColor: HiveColors.border,
  },
});

export function BenefitsQuestionnaireScreen({ nav, programs }: { nav: Navigation; programs?: string[] }) {
  const app = useAppState();
  const programIds = programs ?? app.governmentProfile.selectedPrograms;
  const programNames = programIds
    .map((id) => BENEFIT_PROGRAMS.find((program) => program.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const [firstName, setFirstName] = useState(app.formName.firstName);
  const [lastName, setLastName] = useState(app.formName.lastName);
  const [stateName, setStateName] = useState(app.governmentProfile.state || 'California');
  const [householdSize, setHouseholdSize] = useState(String(app.governmentProfile.householdSize || app.profile.householdSize));
  const [employmentStatus, setEmploymentStatus] = useState(app.governmentProfile.employmentStatus || 'Working part-time');
  const [monthlyIncome, setMonthlyIncome] = useState(app.governmentProfile.monthlyIncome || '');
  const [housingStatus, setHousingStatus] = useState(app.governmentProfile.housingStatus || 'Renting');
  const [monthlyRent, setMonthlyRent] = useState(app.governmentProfile.monthlyRent || '');

  function save() {
    app.updateGovernmentProfile({
      completed: true,
      firstName: firstName.trim() === app.profile.firstName ? '' : firstName.trim(),
      lastName: lastName.trim() === app.profile.lastName ? '' : lastName.trim(),
      state: stateName,
      householdSize: Number.parseInt(householdSize, 10) || 1,
      employmentStatus,
      monthlyIncome,
      housingStatus,
      monthlyRent,
    });
    // Penny does the paperwork: the saved profile becomes the autofilled draft
    // the user reviews on the next screen before anything leaves the app.
    const firstProgram = BENEFIT_PROGRAMS.find((program) => program.id === programIds[0]);
    if (firstProgram) {
      nav.replace('programApplication', { program: firstProgram });
    } else {
      nav.back();
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Benefits Questionnaire" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        {programNames.length > 0 ? (
          <Text style={uiText.muted}>Applying for: {programNames.join(', ')}</Text>
        ) : null}
        <AppTextField label="First name" value={firstName} onChangeText={setFirstName} />
        <AppTextField label="Last name" value={lastName} onChangeText={setLastName} />
        <AppTextField label="State" value={stateName} onChangeText={setStateName} />
        <AppTextField label="Household size" value={householdSize} onChangeText={setHouseholdSize} keyboardType="number-pad" />
        <AppTextField label="Employment status" value={employmentStatus} onChangeText={setEmploymentStatus} />
        <AppTextField label="Monthly income" value={monthlyIncome} onChangeText={setMonthlyIncome} keyboardType="decimal-pad" />
        <AppTextField label="Housing status" value={housingStatus} onChangeText={setHousingStatus} />
        <AppTextField label="Monthly rent" value={monthlyRent} onChangeText={setMonthlyRent} keyboardType="decimal-pad" />
        <AppButton title="Save Benefits Profile" onPress={save} />
      </View>
    </ScrollScreen>
  );
}

export function ProgramApplicationScreen({ nav, program }: { nav: Navigation; program?: BenefitProgram }) {
  const app = useAppState();
  const chosen = program ?? benefitPrograms[0];

  return (
    <ScrollScreen>
      <AppHeader title={`${chosen.name} Application`} onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>{chosen.name}</Text>
        <Text style={uiText.muted}>{chosen.estimate}</Text>
        <Text style={sharedStyles.fieldGroupLabel}>Application checklist</Text>
        {chosen.requirements.map((requirement) => <Bullet key={requirement} text={requirement} />)}
        <Text style={sharedStyles.fieldGroupLabel}>Prefilled profile</Text>
        <Card>
          <Text style={sharedStyles.cardBody}>Name: {app.formName.firstName} {app.formName.lastName}</Text>
          <Text style={sharedStyles.cardBody}>Household size: {app.governmentProfile.householdSize || app.profile.householdSize}</Text>
          <Text style={sharedStyles.cardBody}>State: {app.governmentProfile.state || 'Not set'}</Text>
        </Card>
        <AppButton title="Done" onPress={nav.back} />
      </View>
    </ScrollScreen>
  );
}

export function VideoHubScreen({ nav, title, videos }: { nav: Navigation; title: string; videos: VideoItem[] }) {
  return (
    <ScrollScreen>
      <AppHeader title={title} onBack={nav.back} />
      <View style={sharedStyles.gridList}>
        {videos.map((video) => <VideoCard key={video.id} video={video} onPress={() => nav.push('video', { video })} wide />)}
      </View>
    </ScrollScreen>
  );
}

export function VideoDetailScreen({ nav, video }: { nav: Navigation; video?: VideoItem }) {
  const chosen = video ?? allVideos[0];
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSavedVideoIds().then((ids) => {
      if (!cancelled) setSaved(ids.has(chosen.id));
    });
    return () => {
      cancelled = true;
    };
  }, [chosen.id]);

  async function onToggleSave() {
    setSaved(await toggleVideoSaved(chosen.id));
  }

  return (
    <ScrollScreen>
      <AppHeader title="How-To Video" onBack={nav.back} />
      <View style={sharedStyles.videoHero}>
        <HiveIcon name="play" size={42} color={HiveColors.white} />
      </View>
      <View style={sharedStyles.formScreen}>
        <View style={rowStyles.spread}>
          <Text style={uiText.subtitle}>{chosen.title}</Text>
          <Chip label={chosen.duration} />
        </View>
        <Text style={uiText.muted}>{chosen.description}</Text>
        <View style={sharedStyles.chipRow}>
          {chosen.tags.map((tag) => <Chip key={tag} label={tag} tone="neutral" />)}
        </View>
        <AppButton
          title={saved ? 'Saved ✓' : 'Save Video'}
          variant="secondary"
          onPress={() => void onToggleSave()}
        />
      </View>
    </ScrollScreen>
  );
}

export function VideoCard({ video, onPress, wide = false }: { video: VideoItem; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.videoCard, wide && styles.videoCardWide, pressed && sharedStyles.pressed]}>
      <View style={styles.videoThumb}>
        <HiveIcon name="play" size={24} color={HiveColors.white} />
      </View>
      <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
      <View style={rowStyles.spread}>
        <Text style={sharedStyles.miniMuted}>{video.duration}</Text>
        <Chip label={video.category} tone="neutral" />
      </View>
    </Pressable>
  );
}

export function ResourceRow({ resource, onPress }: { resource: ResourceItem; onPress: () => void }) {
  return (
    <View style={styles.resourceCard}>
      <View style={styles.resourceTag}>
        <Text style={styles.resourceTagText}>{resource.tag}</Text>
      </View>
      <Text style={styles.resourceName}>{resource.name}</Text>
      <View style={styles.resourceMetaRow}>
        <HiveIcon name="map" size={12} color={HiveColors.textSecondary} />
        <Text style={sharedStyles.miniMuted}>
          {resource.distance} · {resource.hours}
        </Text>
      </View>
      <Text style={sharedStyles.cardBody}>{resource.description}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`How to apply at ${resource.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.applyButton, pressed && sharedStyles.pressed]}>
        <Text style={styles.applyButtonText}>How to Apply</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: HiveColors.green,
  },
  applyButtonText: { color: HiveColors.white, fontSize: 15, fontWeight: '600' },
  benefitsBanner: {
    marginHorizontal: 20,
    backgroundColor: HiveColors.white,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  comingSoonList: { gap: 8, marginHorizontal: 20, marginBottom: 20 },
  infoSubtitleText: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  infoTitleStrong: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  pageSectionTitle: {
    color: HiveColors.text,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 12,
  },
  pennyNote: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  pennyNoteImage: { width: 34, height: 34, borderRadius: 17 },
  pennyNoteText: { flex: 1, color: HiveColors.textSecondary, fontSize: 14, lineHeight: 20 },
  resourceCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 16,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    gap: 8,
    alignItems: 'flex-start',
  },
  resourceContent: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  resourceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resourceName: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 3,
  },
  resourceTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.sm,
    backgroundColor: HiveColors.greenLight,
  },
  resourceTagText: { color: HiveColors.green, fontSize: 13, fontWeight: '700' },
  sectionInset: { marginHorizontal: 20, marginBottom: 16 },
  videoCard: {
    width: 184,
    gap: 8,
    borderRadius: Radii.lg,
    backgroundColor: HiveColors.card,
    padding: 12,
  },
  videoCardWide: {
    width: '100%',
  },
  videoThumb: {
    height: 92,
    borderRadius: 12,
    backgroundColor: HiveColors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTitle: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 36,
  },
});
