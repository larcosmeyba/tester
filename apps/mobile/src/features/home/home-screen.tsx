// The Home tab.
//
// Extracted verbatim from app-root.tsx; markup unchanged.

import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AvatarButton, Card, HiveIcon, SectionHeader, rowStyles } from '@/components/hive-ui';
import { AlertBanner, ActionGradients, ComingSoonCard, GradientActionCard, GradientActionRow, SoftGreenPanel } from '@/components/hive-cards';
import { FloatingPill, FloatingPillRow } from '@/components/hive-navigation';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors } from '@/constants/theme';
import { FLOATING_TAB_BAR_HEIGHT } from '@/components/hive-navigation';
import { usePantry } from '@/features/pantry/pantry-context';

export function HomeScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const pantry = usePantry();
  const firstName = app.profile.firstName || 'there';

  return (
    <View style={sharedStyles.tabScreen}>
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}>
          <View style={sharedStyles.flexOne}>
            <Text style={styles.homeGreeting}>Hi {firstName},</Text>
            <Text style={styles.homeSubGreeting}>Ready to save some money today?</Text>
          </View>
          <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} accessibilityLabel="View account" />
        </View>

        {app.ebtConnected ? (
          <LinearGradient
            colors={ActionGradients.ebt}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ebtConnected}>
            <View style={rowStyles.spread}>
              <Text style={styles.ebtLight}>EBT Balance</Text>
              <HiveIcon name="card" size={20} color="rgba(255,255,255,0.6)" />
            </View>
            <Text style={styles.ebtBalance}>$234.00</Text>
            <Text style={styles.ebtMeta}>Updated today · Next deposit Aug 1</Text>
            <Pressable onPress={() => app.setSelectedTab(4)} style={styles.ebtDetailsButton}>
              <Text style={styles.ebtDetailsText}>See details</Text>
            </Pressable>
          </LinearGradient>
        ) : (
          <SoftGreenPanel
            icon="card"
            title="EBT Card Balance"
            subtitle="Coming soon — balance & deposit tracking"
            badge="Coming Soon"
            onPress={() => nav.push('connectAccount')}
            style={styles.homeBlock}
          />
        )}

        {pantry.expiringItems.length > 0 ? (
          <AlertBanner
            emoji="🐝"
            title="Use It Soon 🐝"
            subtitle={`${pantry.expiringItems.length} pantry item${pantry.expiringItems.length === 1 ? '' : 's'} expiring in the next 5 days`}
            onPress={() => nav.push('pantry')}
            style={styles.homeBlock}
          />
        ) : null}

        <Text style={styles.homeQuestion}>What would you like to do first?</Text>

        <View style={styles.actionStack}>
          <GradientActionRow
            icon="doc"
            gradient="benefits"
            title="Start Government Assistance Applications"
            subtitle="Get help preparing applications for benefits you may qualify for."
            onPress={() => nav.push('government')}
          />
          <GradientActionRow
            icon="fork"
            gradient="meals"
            title="Create this week's meal plan"
            onPress={() => router.push('/meals/questionnaire')}
          />
        </View>

        <View style={styles.actionPair}>
          <GradientActionCard
            icon="fridge"
            gradient="pantry"
            title="Cook what I have"
            onPress={() => nav.push('pantry')}
          />
          <GradientActionCard
            icon="map"
            gradient="resources"
            title="Find Resources near me"
            onPress={() => app.setSelectedTab(3)}
          />
        </View>

        <Text style={sharedStyles.homeSectionTitle}>Weekly Best Deals</Text>
        <ComingSoonCard
          icon="cart"
          title="Coming Soon"
          subtitle="Curated EBT-friendly deals near you — launching soon!"
          onPress={() => nav.push('deals')}
          showChevron
          style={styles.homeBlock}
        />

        <SectionHeader title="Education Hub" onPress={() => nav.push('educationHub')} />
        <ComingSoonCard
          emoji="🎓"
          title="Educational Video Content"
          subtitle="Coming soon — money tips, cooking guides & more"
          onPress={() => nav.push('educationHub')}
          showChevron
          style={styles.homeBlock}
        />
      </ScrollView>

      <FloatingPillRow>
        {app.cart.length > 0 ? (
          <FloatingPill
            icon="cart"
            tone="light"
            align="left"
            label={`${app.cart.length} item cart · Clear`}
            onPress={app.clearCart}
          />
        ) : null}
        <FloatingPill icon="plus" label="Add to Pantry" onPress={() => nav.push('pantry')} />
      </FloatingPillRow>
    </View>
  );
}


const styles = StyleSheet.create({
  actionPair: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 28,
  },
  actionStack: {
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  ebtBalance: {
    color: HiveColors.white,
    fontSize: 38,
    fontWeight: '700',
  },
  ebtConnected: {
    marginHorizontal: 20,
    marginBottom: 22,
    padding: 20,
    borderRadius: 18,
    gap: 4,
  },
  ebtDetailsButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  ebtDetailsText: {
    color: HiveColors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  ebtLight: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  ebtMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  homeBlock: {
    marginHorizontal: 20,
    marginBottom: 18,
  },
  homeContent: {
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + 110,
  },
  homeGreeting: {
    color: HiveColors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  homeHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeQuestion: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  homeSubGreeting: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
});
