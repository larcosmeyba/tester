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

import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { AppButton, AppHeader, AppTextField, AvatarButton, Card, Chip, EmptyState, HiveIcon, InfoRow, ScrollScreen, SectionHeader, rowStyles, uiText } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { ComingSoonRow, GradientActionRow } from '@/components/hive-cards';
import { allVideos, benefitPrograms, type BenefitProgram, nearbyResources, type ResourceItem, type VideoItem } from '@/data/mock-data';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { Bullet, HorizontalScroller, sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { Radii } from '@/constants/theme';

export function ResourcesScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const categories = ['All', 'Food', 'Housing', 'Healthcare', 'Utility', 'Job'];
  const filteredResources =
    selectedCategory === 'All'
      ? nearbyResources
      : nearbyResources.filter((resource) =>
          resource.tag.toLowerCase().includes(selectedCategory.toLowerCase())
        );

  return (
    <View style={sharedStyles.tabScreen}>
      <View style={sharedStyles.centeredHeader}>
        <View style={sharedStyles.headerSpacer} />
        <Text style={sharedStyles.centeredHeaderTitle}>Resources</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView contentContainerStyle={styles.resourceContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageSectionTitle}>Government Assistance</Text>
        <View style={styles.sectionInset}>
          <GradientActionRow
            icon="doc"
            gradient="benefits"
            title="Start Your Benefits Application"
            subtitle="Penny pre-fills SNAP, Medicaid, WIC & more — you review before submitting"
            onPress={() => nav.push('government')}
          />
        </View>

        <View style={styles.pennyNote}>
          <Text style={styles.pennyNoteEmoji}>🐝</Text>
          <Text style={styles.pennyNoteText}>
            We&apos;ll guide you through your application step by step. Before anything is printed or
            sent, you&apos;ll have the chance to review every detail and make sure it&apos;s ready to go
            to the right government office.
          </Text>
        </View>

        {/* Category filtering is newer than the reference build; kept, restyled. */}
        <HorizontalScroller>
          {categories.map((category) => (
            <Chip
              key={category}
              label={category}
              selected={selectedCategory === category}
              onPress={() => setSelectedCategory(category)}
            />
          ))}
        </HorizontalScroller>

        <SectionHeader title="Resources Near You" onPress={() => nav.push('resourceSearch')} />
        {filteredResources.length > 0 ? (
          filteredResources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              onPress={() => nav.push('resourceDetails', { resource })}
            />
          ))
        ) : (
          <EmptyState title="No resources match this filter." icon="map" />
        )}

        <Text style={sharedStyles.homeSectionTitle}>More Coming Soon</Text>
        <View style={styles.comingSoonList}>
          <ComingSoonRow
            icon="play"
            title="How-To Video Guides"
            subtitle="Step-by-step guides for SNAP, housing & more"
            onPress={() => nav.push('resourcesHub')}
          />
          <ComingSoonRow
            icon="cart"
            title="Deals & Discounts"
            subtitle="Curated EBT-friendly deals near you"
            onPress={() => nav.push('deals')}
          />
          <ComingSoonRow
            icon="shield"
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

export function GovernmentScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();

  return (
    <ScrollScreen>
      <AppHeader title="Government Assistance" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Card style={styles.benefitsBanner}>
          <Text style={styles.infoTitleStrong}>Benefits profile</Text>
          <Text style={styles.infoSubtitleText}>
            {app.governmentProfile.completed ? 'Profile ready for review before any application.' : 'Complete a profile to prefill application drafts.'}
          </Text>
          <AppButton title={app.governmentProfile.completed ? 'Update Profile' : 'Start Questionnaire'} onPress={() => nav.push('benefitsQuestionnaire')} />
        </Card>
      </View>
      <View style={sharedStyles.listStack}>
        {benefitPrograms.map((program) => (
          <Card key={program.id} onPress={() => nav.push('programApplication', { program })}>
            <View style={rowStyles.spread}>
              <View style={sharedStyles.flexOne}>
                <Text style={sharedStyles.cardTitle}>{program.name}</Text>
                <Text style={sharedStyles.miniMuted}>{program.agency}</Text>
                <Text style={sharedStyles.cardBody}>{program.description}</Text>
              </View>
              <HiveIcon name="next" size={14} color={HiveColors.textSecondary} />
            </View>
          </Card>
        ))}
      </View>
    </ScrollScreen>
  );
}

export function BenefitsQuestionnaireScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
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
    nav.back();
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Benefits Questionnaire" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
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
        <AppButton title="Review Draft Application" onPress={nav.back} />
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
        <AppButton title="Save Video" variant="secondary" onPress={nav.back} />
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
  pennyNoteEmoji: { fontSize: 20 },
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
