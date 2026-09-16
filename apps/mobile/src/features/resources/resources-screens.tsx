// The Resources tab: government-benefits entry points, the user's application
// records, and location-based resource lookup.
//
// NOTE — DUPLICATES PENDING RETIREMENT: GovernmentScreen,
// BenefitsQuestionnaireScreen and ProgramApplicationScreen here write to local
// app-state only. features/benefits/ holds the newer, backend-connected
// versions of all three, already wired to real routes under app/resources/.
// These three go when the routes stop re-exporting the AppRoot shell; deleting
// them now would break the shell's own navigation with nothing to replace it.
//
// The Resources list itself is real data only: the ResourceService calls the
// backend's /resources/nearby endpoint. The Xcode app's hardcoded Burbank list
// was placeholder data and is intentionally NOT carried over — every distance,
// rating, and listing on screen comes from the API response.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  AppButton,
  AppHeader,
  AppTextField,
  AvatarButton,
  Card,
  Chip,
  HiveIcon,
  ScrollScreen,
  uiText,
  rowStyles,
} from '@/components/hive-ui';
import { HiveColors, Radii } from '@/constants/theme';
import { GradientActionRow } from '@/components/hive-cards';
import { allVideos, benefitPrograms, nearbyResources, type BenefitProgram, type ResourceItem, type VideoItem } from '@/data/mock-data';
import { BenefitsRenewalBanner } from '@/features/benefits/benefits-renewal-banner';
import { ResourcesApplicationsSection } from '@/features/resources/resources-applications';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { Bullet, HorizontalScroller, sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import {
  categoryParamFor,
  chooseResourceLookupKind,
  fetchByZip,
  fetchNearby,
  ResourceServiceError,
  type NearbyResource,
} from '@/features/resources/resource-service';

// ---------------------------------------------------------------------------
// Location-backed resource lookup
// ---------------------------------------------------------------------------

const RESOURCE_RADIUS_MILES = 25;
const TAB_PREVIEW_COUNT = 3;
const RESOURCE_CATEGORIES = ['All', 'Food', 'Housing', 'Healthcare', 'Utility', 'Job'];

type ResourceLookupState =
  | { status: 'loading' }
  | { status: 'ready'; resources: NearbyResource[] }
  | { status: 'unavailable'; message: string };

/** Copy shown when the endpoint is not configured or a request fails. */
function lookupErrorMessage(error: unknown): string {
  if (error instanceof ResourceServiceError && error.notConfigured) {
    return "Resource lookup isn't available right now — check back soon.";
  }
  if (error instanceof ResourceServiceError && error.kind === 'unauthorized') {
    return 'Please sign in to look up resources near you.';
  }
  return "We couldn't load resources near you. Check your connection and try again.";
}

const NO_LOCATION_MESSAGE =
  "We couldn't determine your location. Add your ZIP code in your profile to find resources near you.";

/**
 * Requests foreground location permission when the Resources surface appears
 * (mirrors the Xcode tab's onAppear), persists the permission decision the
 * same way onboarding does, then loads resources from device coordinates —
 * falling back to the profile ZIP when permission is denied or unavailable.
 * Never invents listings: 503s and errors surface as honest unavailable states.
 */
function useNearbyResources(categoryChip: string): ResourceLookupState {
  const app = useAppState();
  const [lookup, setLookup] = useState<ResourceLookupState>({ status: 'loading' });
  const sourceRef = useRef<{ kind: 'coords'; latitude: number; longitude: number } | { kind: 'zip'; zip: string } | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (chip: string) => {
    const source = sourceRef.current;
    if (!source) return;
    setLookup({ status: 'loading' });
    try {
      const category = categoryParamFor(chip);
      const resources =
        source.kind === 'coords'
          ? await fetchNearby(source.latitude, source.longitude, RESOURCE_RADIUS_MILES, category)
          : await fetchByZip(source.zip, category);
      if (mountedRef.current) setLookup({ status: 'ready', resources });
    } catch (error) {
      if (mountedRef.current) setLookup({ status: 'unavailable', message: lookupErrorMessage(error) });
    }
  }, []);

  // Permission + coordinates resolve once per mount; the tab remounts every
  // time it is selected, so this runs on each visit.
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      let granted = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === Location.PermissionStatus.GRANTED;
      } catch {
        granted = false;
      }
      // Persist the decision (same shape onboarding writes); a sync failure
      // must not block the lookup.
      try {
        await app.savePreferences({
          locationPermissionStatus: granted ? 'granted' : 'denied',
        });
      } catch {
        // Intentionally ignored — the lookup below does not depend on it.
      }

      if (granted) {
        sourceRef.current = null;
      }
      const lookupKind = chooseResourceLookupKind(
        granted ? 'granted' : app.preferences.locationPermissionStatus,
        app.profile.zip,
      );
      if (lookupKind === 'coords') {
        try {
          const position = await Location.getCurrentPositionAsync({});
          sourceRef.current = {
            kind: 'coords',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } catch {
          // Location services may be off even with permission granted — the
          // ZIP fallback below still gives the user real results.
          sourceRef.current = null;
        }
      }
      if (!sourceRef.current && app.profile.zip.trim()) {
        sourceRef.current = { kind: 'zip', zip: app.profile.zip.trim() };
      }
      if (!mountedRef.current) return;
      if (!sourceRef.current) {
        setLookup({ status: 'unavailable', message: NO_LOCATION_MESSAGE });
        return;
      }
      await load(categoryChip);
    })();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when the category chip changes; guarded until the source resolves.
  useEffect(() => {
    if (sourceRef.current) {
      void load(categoryChip);
    }
  }, [categoryChip, load]);

  return lookup;
}

// ---------------------------------------------------------------------------
// Shared resource card (real API records)
// ---------------------------------------------------------------------------

function formatDistance(distanceMi: number | null): string | null {
  return distanceMi != null ? `${distanceMi.toFixed(1)} mi` : null;
}

function resourceMetaLine(resource: NearbyResource): string | null {
  const parts = [formatDistance(resource.distanceMi), resource.hours?.trim() || null].filter(
    (part): part is string => part != null && part.length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

function openWebsite(website: string) {
  const url = website.startsWith('http') ? website : `https://${website}`;
  void Linking.openURL(url);
}

function NearbyResourceCard({
  resource,
  onPress,
}: {
  resource: NearbyResource;
  onPress?: () => void;
}) {
  const metaLine = resourceMetaLine(resource);
  const card = (
    <View style={styles.nearbyCard}>
      <View style={styles.nearbyTag}>
        <Text style={styles.nearbyTagText}>{resource.tag}</Text>
      </View>
      <Text style={styles.nearbyName}>{resource.name}</Text>
      {metaLine ? (
        <View style={styles.nearbyMetaRow}>
          <Text style={styles.nearbyMetaPin}>📍</Text>
          <Text style={sharedStyles.miniMuted}>{metaLine}</Text>
        </View>
      ) : null}
      {resource.description ? (
        <Text style={styles.nearbyDescription} numberOfLines={2}>
          {resource.description}
        </Text>
      ) : null}
      {resource.website ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`How to apply at ${resource.name}`}
          onPress={() => openWebsite(resource.website as string)}
          style={({ pressed }) => [styles.howToApplyButton, pressed && sharedStyles.pressed]}>
          <Text style={styles.howToApplyButtonText}>How to Apply</Text>
        </Pressable>
      ) : null}
    </View>
  );
  if (!onPress) return card;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && sharedStyles.pressed}>
      {card}
    </Pressable>
  );
}

function ResourceLookupBody({ lookup }: { lookup: ResourceLookupState }) {
  if (lookup.status === 'loading') {
    return (
      <View style={styles.lookupCentered}>
        <ActivityIndicator size="large" color={HiveColors.green} />
      </View>
    );
  }
  if (lookup.status === 'unavailable') {
    return (
      <View style={styles.lookupCentered}>
        <HiveIcon name="map" size={36} color={HiveColors.border} />
        <Text style={styles.lookupUnavailable}>{lookup.message}</Text>
      </View>
    );
  }
  return (
    <>
      {lookup.resources.slice(0, TAB_PREVIEW_COUNT).map((resource) => (
        <NearbyResourceCard key={resource.id} resource={resource} />
      ))}
      {lookup.resources.length === 0 ? (
        <Text style={styles.lookupUnavailable}>No resources found nearby right now.</Text>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Resources tab
// ---------------------------------------------------------------------------

export function ResourcesScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const lookup = useNearbyResources('All');

  return (
    <View style={sharedStyles.tabScreen}>
      <View style={sharedStyles.centeredHeader}>
        <View style={sharedStyles.headerSpacer} />
        <Text style={sharedStyles.centeredHeaderTitle}>Resources</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView contentContainerStyle={styles.resourceContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Government Assistance</Text>
        <View style={styles.sectionInset}>
          <GradientActionRow
            icon="doc"
            gradient="benefits"
            title="Start Your Benefits Application"
            subtitle="Penny pre-fills SNAP, Medicaid, WIC & more — you review before submitting"
            onPress={() => nav.push('benefitsState')}
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

        <View style={styles.sectionInset}>
          <ResourcesApplicationsSection nav={nav} />
        </View>

        <View style={styles.sectionInset}>
          <BenefitsRenewalBanner />
        </View>

        <View style={styles.nearbyHeaderRow}>
          <Text style={styles.sectionTitle}>Resources Near You</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all resources"
            onPress={() => nav.push('resourceSearch')}
            style={({ pressed }) => [styles.seeAllPill, pressed && sharedStyles.pressed]}>
            <Text style={styles.seeAllPillText}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.nearbyList}>
          <ResourceLookupBody lookup={lookup} />
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Resource search
// ---------------------------------------------------------------------------

export function ResourceSearchScreen({ nav }: { nav: Navigation }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const lookup = useNearbyResources(selectedCategory);
  const resultCount = lookup.status === 'ready' ? lookup.resources.length : 0;

  return (
    <View style={sharedStyles.tabScreen}>
      <View style={styles.searchHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={nav.back}
          style={({ pressed }) => [styles.searchBackButton, pressed && sharedStyles.pressed]}>
          <HiveIcon name="back" size={16} color={HiveColors.text} />
        </Pressable>
        <Text style={styles.searchTitle}>Resources Near You</Text>
        <View style={styles.searchHeaderSpacer} />
      </View>

      <HorizontalScroller>
        {RESOURCE_CATEGORIES.map((category) => (
          <Chip
            key={category}
            label={category}
            selected={selectedCategory === category}
            onPress={() => setSelectedCategory(category)}
          />
        ))}
      </HorizontalScroller>

      <Text style={styles.resultCount}>
        {lookup.status === 'loading'
          ? 'Finding resources…'
          : `${resultCount} result${resultCount === 1 ? '' : 's'} near you`}
      </Text>

      <ScrollView contentContainerStyle={styles.searchList} showsVerticalScrollIndicator={false}>
        {lookup.status === 'loading' ? (
          <View style={styles.lookupCentered}>
            <ActivityIndicator size="large" color={HiveColors.green} />
          </View>
        ) : lookup.status === 'unavailable' ? (
          <View style={styles.lookupCentered}>
            <HiveIcon name="map" size={36} color={HiveColors.border} />
            <Text style={styles.lookupUnavailable}>{lookup.message}</Text>
          </View>
        ) : lookup.resources.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🔍</Text>
            <Text style={styles.emptyStateTitle}>No resources found</Text>
            <Text style={styles.emptyStateSubtitle}>Try adjusting your search or category filter.</Text>
            <View style={styles.supportBox}>
              <Text style={sharedStyles.miniMuted}>Can&apos;t find what you need?</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL('mailto:support@helpthehive.com?subject=Resource%20Request')}>
                <Text style={styles.supportLink}>Email us at support@helpthehive.com</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          lookup.resources.map((resource) => (
            <NearbyResourceCard
              key={resource.id}
              resource={resource}
              onPress={() => nav.push('resourceDetails', { resource })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Resource details
// ---------------------------------------------------------------------------

type DetailsResource = ResourceItem | NearbyResource;

function isNearbyResource(resource: DetailsResource): resource is NearbyResource {
  return typeof (resource as NearbyResource).distanceMi !== 'undefined';
}

function directionsUrl(resource: DetailsResource): string {
  if (isNearbyResource(resource) && resource.latitude != null && resource.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${resource.latitude},${resource.longitude}`,
    )}`;
  }
  const address = isNearbyResource(resource) ? resource.address : (resource.address ?? resource.name);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function ResourceDetailsScreen({ nav, resource }: { nav: Navigation; resource?: DetailsResource }) {
  const chosen = resource ?? nearbyResources[0];
  const nearby = isNearbyResource(chosen);
  const tag = chosen.tag;
  const name = chosen.name;
  const description = chosen.description;
  const hours = chosen.hours;
  const phone = chosen.phone;
  const website = chosen.website;
  const address = nearby ? chosen.address : (chosen.address ?? null);
  const rating = nearby ? chosen.rating : undefined;
  const services = nearby ? chosen.services : undefined;
  const distanceText = nearby ? formatDistance(chosen.distanceMi) : chosen.distance;

  return (
    <ScrollScreen>
      <AppHeader title="Resource Details" onBack={nav.back} />
      <View style={styles.detailsHero}>
        <HiveIcon name="map" size={52} color={HiveColors.green} />
      </View>
      <View style={styles.detailsBody}>
        <View style={styles.detailsTagRow}>
          <View style={styles.nearbyTag}>
            <Text style={styles.nearbyTagText}>{tag}</Text>
          </View>
          {rating != null ? (
            <Text style={sharedStyles.miniMuted}>★ {rating.toFixed(1)}</Text>
          ) : null}
        </View>
        <Text style={styles.detailsName}>{name}</Text>
        {description ? <Text style={styles.detailsDescription}>{description}</Text> : null}

        {services && services.length > 0 ? (
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionTitle}>Services Offered</Text>
            {services.map((service) => (
              <View key={service} style={styles.checklistRow}>
                <HiveIcon name="checkCircle" size={18} color={HiveColors.green} />
                <Text style={styles.checklistText}>{service}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {hours || distanceText ? (
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionTitle}>Hours &amp; Availability</Text>
            {hours ? (
              <View style={rowStyles.spread}>
                <Text style={uiText.muted}>Hours</Text>
                <Text style={styles.detailsHoursValue}>{hours}</Text>
              </View>
            ) : null}
            {distanceText ? (
              <View style={rowStyles.spread}>
                <Text style={uiText.muted}>Distance</Text>
                <Text style={styles.detailsHoursValue}>{distanceText}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <AppButton title="Get Directions" onPress={() => Linking.openURL(directionsUrl(chosen))} />

        <View style={styles.detailsSection}>
          <Text style={styles.detailsSectionTitle}>Contact Information</Text>
          {phone ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`)}
              style={styles.contactRow}>
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>{phone}</Text>
            </Pressable>
          ) : null}
          {website ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => openWebsite(website)}
              style={styles.contactRow}>
              <Text style={styles.contactLabel}>Website</Text>
              <Text style={[styles.contactValue, styles.contactLink]} numberOfLines={1}>
                {website}
              </Text>
            </Pressable>
          ) : null}
          {address ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>Address</Text>
              <Text style={styles.contactValue}>{address}</Text>
            </View>
          ) : null}
          {!phone && !website && !address ? (
            <Text style={uiText.muted}>No contact information available.</Text>
          ) : null}
        </View>

        {website ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => openWebsite(website)}
            style={({ pressed }) => [styles.visitWebsiteButton, pressed && sharedStyles.pressed]}>
            <Text style={styles.visitWebsiteButtonText}>Visit Their Website</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollScreen>
  );
}

// ---------------------------------------------------------------------------
// Duplicates pending retirement — behavior unchanged (see file header note).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Video hub — the guides do not exist yet, so the hub is an honest
// "coming soon" state. Never renders fake playable videos.
// ---------------------------------------------------------------------------

const UPCOMING_VIDEO_TITLES = [
  'How to Apply for SNAP',
  'How to Find Rental Assistance',
  'How to Apply for Medicaid',
  'How to Lower Your Utility Bills',
  'Finding Job Training Programs',
];

export function VideoHubScreen({ nav, title, videos }: { nav: Navigation; title: string; videos: VideoItem[] }) {
  if (videos.length === 0) {
    return (
      <ScrollScreen>
        <AppHeader title="Resource Hub" onBack={nav.back} />
        <View style={styles.comingSoonArt}>
          <View style={styles.comingSoonArtCircle}>
            <Text style={styles.comingSoonArtEmoji}>🎓</Text>
          </View>
          <Text style={styles.comingSoonTitle}>Video Guides Coming Soon</Text>
          <Text style={styles.comingSoonCopy}>
            We&apos;re creating step-by-step video guides to help you apply for SNAP, housing
            assistance, Medicaid, and more.
          </Text>
        </View>
        <View style={styles.comingSoonList}>
          {UPCOMING_VIDEO_TITLES.map((videoTitle) => (
            <View key={videoTitle} style={styles.comingSoonRow}>
              <View style={styles.comingSoonPlayCircle}>
                <HiveIcon name="play" size={11} color={HiveColors.green} />
              </View>
              <Text style={styles.comingSoonRowTitle}>{videoTitle}</Text>
              <View style={styles.soonChip}>
                <Text style={styles.soonChipText}>Soon</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.comingSoonFooter}>✦ Penny will notify you when videos go live</Text>
      </ScrollScreen>
    );
  }

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

// ---------------------------------------------------------------------------
// Legacy mock-typed cards — kept for export compatibility.
// ---------------------------------------------------------------------------

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

/**
 * Compact card for the horizontally-scrolling "Resources Near You" rail
 * (Audit Section 8). Tapping opens the full resource details.
 */
export function ResourceCard({ resource, onPress }: { resource: ResourceItem; onPress: () => void }) {
  return (
    <Card style={styles.resourceCardHorizontal} onPress={onPress}>
      <Chip label={resource.tag} tone="green" />
      <Text style={styles.resourceCardName} numberOfLines={2}>
        {resource.name}
      </Text>
      <Text style={sharedStyles.miniMuted} numberOfLines={2}>
        {resource.description}
      </Text>
      <View style={styles.resourceMetaRow}>
        <HiveIcon name="map" size={12} color={HiveColors.textSecondary} />
        <Text style={sharedStyles.miniMuted}>{resource.distance}</Text>
      </View>
    </Card>
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
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  checklistText: { color: HiveColors.text, fontSize: 14, flex: 1 },
  comingSoonArt: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 32 },
  comingSoonArtCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  comingSoonArtEmoji: { fontSize: 48 },
  comingSoonCopy: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  comingSoonFooter: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  comingSoonList: { gap: 10, marginHorizontal: 20, marginVertical: 20 },
  comingSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
  },
  comingSoonPlayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonRowTitle: { color: HiveColors.text, fontSize: 14, fontWeight: '500', flex: 1 },
  comingSoonTitle: { color: HiveColors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  contactLabel: { color: HiveColors.textSecondary, fontSize: 12, width: 70 },
  contactLink: { color: HiveColors.green, textDecorationLine: 'underline' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  contactValue: { color: HiveColors.text, fontSize: 14, flex: 1 },
  detailsBody: { padding: 20, gap: 16 },
  detailsDescription: { color: HiveColors.textSecondary, fontSize: 15 },
  detailsHero: {
    height: 200,
    backgroundColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsHoursValue: { color: HiveColors.text, fontSize: 14, fontWeight: '500' },
  detailsName: { color: HiveColors.text, fontSize: 22, fontWeight: '700' },
  detailsSection: { gap: 8, marginTop: 4 },
  detailsSectionTitle: { color: HiveColors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  detailsTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, gap: 8 },
  emptyStateIcon: { fontSize: 36, marginBottom: 6 },
  emptyStateSubtitle: { color: HiveColors.textSecondary, fontSize: 14, textAlign: 'center' },
  emptyStateTitle: { color: HiveColors.text, fontSize: 16, fontWeight: '600' },
  howToApplyButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: HiveColors.green,
  },
  howToApplyButtonText: { color: HiveColors.white, fontSize: 13, fontWeight: '600' },
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
  lookupCentered: { alignItems: 'center', paddingVertical: 32, gap: 12, paddingHorizontal: 20 },
  lookupUnavailable: { color: HiveColors.textSecondary, fontSize: 14, textAlign: 'center' },
  nearbyCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    gap: 8,
    alignItems: 'flex-start',
  },
  nearbyDescription: { color: HiveColors.textSecondary, fontSize: 13, lineHeight: 19 },
  nearbyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  nearbyList: { paddingBottom: 20 },
  nearbyMetaPin: { fontSize: 12 },
  nearbyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nearbyName: { color: HiveColors.text, fontSize: 15, fontWeight: '700' },
  nearbyTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.sm,
    backgroundColor: HiveColors.greenLight,
  },
  nearbyTagText: { color: HiveColors.green, fontSize: 11, fontWeight: '700' },
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
  resourceCardHorizontal: {
    width: 250,
    marginRight: 12,
    padding: 16,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    gap: 8,
    alignItems: 'flex-start',
  },
  resourceCardName: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
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
  resultCount: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBackButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  searchHeaderSpacer: { width: 36 },
  searchList: { paddingBottom: 80 },
  searchTitle: { color: HiveColors.text, fontSize: 20, fontWeight: '700', flex: 1 },
  sectionInset: { marginHorizontal: 20, marginBottom: 16 },
  sectionTitle: { color: HiveColors.text, fontSize: 17, fontWeight: '700' },
  seeAllPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: HiveColors.greenLight,
  },
  seeAllPillText: { color: HiveColors.green, fontSize: 14, fontWeight: '600' },
  soonChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: HiveColors.greenLight,
  },
  soonChipText: { color: HiveColors.green, fontSize: 11, fontWeight: '600' },
  supportBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
  },
  supportLink: { color: HiveColors.green, fontSize: 14, fontWeight: '600' },
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
  visitWebsiteButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitWebsiteButtonText: { color: HiveColors.green, fontSize: 15, fontWeight: '600' },
});
