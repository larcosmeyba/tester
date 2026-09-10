// The Finance tab and its detail screens.
//
// Extracted verbatim from app-root.tsx; markup unchanged. Every figure on these
// screens still comes from data/mock-data.ts — there is no budget backend yet.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AppButton, AppHeader, AvatarButton, Card, Chip, HiveIcon, Screen, ScrollScreen, SelectionRow, rowStyles, uiText } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { ComingSoonHub } from '@/components/hive-cards';
import { spendingCategories, transactions } from '@/data/mock-data';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { FLOATING_TAB_BAR_HEIGHT } from '@/components/hive-navigation';
import { useMockServices } from '@/constants/env';
import { fetchBenefitsRenewals } from '@/features/benefits/benefits-repository';
import { renewalNeedsAttention } from '@/features/benefits/benefits-renewals';

const pennySource = require('@/assets/images/hive/penny.png');

/**
 * Notification bell drawn from Views on a 24x24 grid — the same approach as
 * components/tab-icons.tsx. HiveIcon is SF Symbols with a letter fallback on
 * Android (the bell rendered as "!"), so the header bell gets a real glyph
 * that renders identically on both platforms.
 */
function BellGlyph({ color, size = 20 }: { color: string; size?: number }) {
  const scale = size / 24;
  const sw = 2.2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 24, height: 24, transform: [{ scale }] }}>
        {/* Top knob */}
        <View
          style={{
            position: 'absolute',
            left: 10.9,
            top: 2.6,
            width: 2.2,
            height: 2.2,
            borderRadius: 1.1,
            backgroundColor: color,
          }}
        />
        {/* Dome */}
        <View
          style={{
            position: 'absolute',
            left: 6.5,
            top: 4.6,
            width: 11,
            height: 11,
            borderWidth: sw,
            borderColor: color,
            borderBottomWidth: 0,
            borderTopLeftRadius: 5.5,
            borderTopRightRadius: 5.5,
          }}
        />
        {/* Skirt */}
        <View
          style={{
            position: 'absolute',
            left: 4.75,
            top: 15.4,
            width: 14.5,
            height: sw,
            borderRadius: sw / 2,
            backgroundColor: color,
          }}
        />
        {/* Clapper */}
        <View
          style={{
            position: 'absolute',
            left: 10.9,
            top: 18.4,
            width: 2.2,
            height: 2.2,
            borderRadius: 1.1,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

/**
 * How many things need the user's attention behind the notification bell.
 *
 * Preview/mock builds show the two specified examples (a benefits renewal
 * coming due and the weekly meal-plan reminder). Real builds count live
 * benefits renewals needing attention; a failed load means no badge, not an
 * error — the bell itself always renders.
 */
function useFinanceAlertCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (useMockServices) {
        if (!cancelled) setCount(2);
        return;
      }
      try {
        const renewals = await fetchBenefitsRenewals();
        if (!cancelled) setCount(renewals.filter(renewalNeedsAttention).length);
      } catch {
        if (!cancelled) setCount(0);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}

export function FinanceScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const alertCount = useFinanceAlertCount();

  return (
    <View style={sharedStyles.tabScreen}>
      <View style={sharedStyles.centeredHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={alertCount > 0 ? `Notifications, ${alertCount} needing attention` : 'Notifications'}
          onPress={() => nav.push('notifications')}
          style={styles.headerIconButton}>
          <BellGlyph color={HiveColors.text} size={20} />
          {alertCount > 0 ? <View style={styles.alertBadge} accessibilityElementsHidden /> : null}
        </Pressable>
        <Text style={sharedStyles.centeredHeaderTitle}>Finances</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView contentContainerStyle={styles.financeContent} showsVerticalScrollIndicator={false}>
        <ComingSoonHub
          image={pennySource}
          title="Finance Hub"
          subtitle="Coming Soon to Help The Hive"
          body="We're building powerful money tools designed specifically for families like yours — EBT tracking, spending insights, bill reminders, and more."
          features={[
            { icon: 'card', label: 'EBT Balance Tracking' },
            { icon: 'chart', label: 'Spending Reports' },
            { icon: 'bell', label: 'Bill Reminders' },
            { icon: 'finance', label: 'Budget Goals' },
            { icon: 'heart', label: 'Rx Savings' },
            { icon: 'shield', label: 'Insurance Offers' },
          ]}
          footnote="Penny will notify you the moment this launches"
        />
      </ScrollView>
    </View>
  );
}

export function SpendingReportScreen({ nav }: { nav: Navigation }) {
  return (
    <ScrollScreen>
      <AppHeader title="Spending Report" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <DonutPlaceholder large />
        {spendingCategories.map((category) => (
          <Card key={category.name}>
            <View style={rowStyles.spread}>
              <View style={rowStyles.row}>
                <View style={[styles.legendDot, { backgroundColor: category.color }]} />
                <Text style={sharedStyles.cardTitle}>{category.name}</Text>
              </View>
              <Text style={sharedStyles.cardTitle}>{category.amount}</Text>
            </View>
          </Card>
        ))}
        <AppButton title="View Transactions" onPress={() => nav.push('transactions')} />
      </View>
    </ScrollScreen>
  );
}

export function TransactionsScreen({ nav }: { nav: Navigation }) {
  const [filter, setFilter] = useState<'All' | 'EBT' | 'Card'>('All');
  const filtered = filter === 'All' ? transactions : transactions.filter((transaction) => transaction.type === filter);

  return (
    <ScrollScreen>
      <AppHeader title="Transactions" onBack={nav.back} />
      <View style={sharedStyles.filterRow}>
        {(['All', 'EBT', 'Card'] as const).map((option) => (
          <Chip key={option} label={option} selected={filter === option} onPress={() => setFilter(option)} />
        ))}
      </View>
      <View style={sharedStyles.listStack}>
        {filtered.map((transaction) => (
          <Card key={transaction.id}>
            <View style={rowStyles.spread}>
              <View>
                <Text style={sharedStyles.cardTitle}>{transaction.store}</Text>
                <Text style={sharedStyles.miniMuted}>{transaction.section} - {transaction.category} - {transaction.type}</Text>
              </View>
              <Text style={styles.transactionAmount}>{transaction.amount}</Text>
            </View>
          </Card>
        ))}
      </View>
    </ScrollScreen>
  );
}

export function ConnectAccountScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();

  return (
    <Screen>
      <AppHeader title="Connect Account" onBack={nav.back} />
      <View style={sharedStyles.permissionScreen}>
        <View style={sharedStyles.bigIconCircle}>
          <HiveIcon name="card" size={38} color={HiveColors.green} />
        </View>
        <Text style={sharedStyles.permissionTitle}>Connect your EBT card</Text>
        <Text style={sharedStyles.permissionSubtitle}>This prototype toggles local connected state. No bank or EBT provider is contacted.</Text>
        <View style={sharedStyles.fullWidth}>
          <AppButton title={app.ebtConnected ? 'Disconnect EBT' : 'Connect EBT'} onPress={() => {
            app.setEbtConnected(!app.ebtConnected);
            nav.back();
          }} />
          <AppButton title="Maybe Later" variant="plain" onPress={nav.back} />
        </View>
      </View>
    </Screen>
  );
}

export function BudgetSettingsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [budget, setBudget] = useState(app.preferences.weeklyBudget || '$75-100');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function save() {
    setIsSaving(true);
    setSaveError('');
    try {
      await app.savePreferences({ weeklyBudget: budget });
      nav.back();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your budget.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollScreen>
      <AppHeader title="Budget Settings" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>Weekly grocery budget</Text>
        {['Below $50', '$75-100', '$100-$150', '$150-$200'].map((option) => (
          <SelectionRow key={option} title={option} selected={budget === option} onPress={() => setBudget(option)} />
        ))}
        {saveError ? <Text style={sharedStyles.authError}>{saveError}</Text> : null}
        <AppButton title={isSaving ? 'Saving…' : 'Save Budget'} disabled={isSaving} onPress={() => void save()} />
      </View>
    </ScrollScreen>
  );
}

export function DonutPlaceholder({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.donut, large && styles.donutLarge]}>
      <View style={[styles.donutInner, large && styles.donutInnerLarge]}>
        <Text style={styles.donutAmount}>$2,442.90</Text>
        <Text style={styles.donutLabel}>TOTAL SPENT</Text>
      </View>
    </View>
  );
}

/**
 * Penny paywall sheet. Deferred by product decision — kept intact so it can be
 * wired to a message limit once monetisation is agreed, rather than rebuilt.
 */

const styles = StyleSheet.create({
  donut: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 22,
    borderTopColor: HiveColors.greenDark,
    borderRightColor: HiveColors.green,
    borderBottomColor: HiveColors.greenSoft,
    borderLeftColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutAmount: {
    color: HiveColors.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  donutInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutInnerLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  donutLabel: {
    color: HiveColors.textSecondary,
    fontSize: 8,
    fontWeight: '700',
  },
  donutLarge: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 30,
    alignSelf: 'center',
  },
  financeContent: { paddingBottom: FLOATING_TAB_BAR_HEIGHT + 60 },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.card,
  },
  alertBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: HiveColors.danger,
    borderWidth: 2,
    borderColor: HiveColors.white,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  transactionAmount: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
});
