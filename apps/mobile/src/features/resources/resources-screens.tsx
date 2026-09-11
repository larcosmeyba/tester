// The Resources tab: resource search, videos, and the government-benefits
// entry points.
//
// Extracted verbatim from app-root.tsx; markup unchanged.
//
// The mock benefits screens (GovernmentScreen, BenefitsQuestionnaireScreen,
// ProgramApplicationScreen) were retired: the shell now renders the
// backend-connected screens from features/benefits/ through the wrappers in
// features/benefits/benefits-shell-routes.tsx. There is one benefits flow.

import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { loadSavedVideoIds, toggleVideoSaved } from '@/features/resources/saved-videos';
import { AppButton, AppHeader, AppTextField, AvatarButton, Card, Chip, HiveIcon, InfoRow, ScrollScreen, SectionHeader, rowStyles, uiText, type HiveIconName } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { ComingSoonRow, GradientActionRow } from '@/components/hive-cards';
import { allVideos, nearbyResources, type ResourceItem, type VideoItem } from '@/data/mock-data';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
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
