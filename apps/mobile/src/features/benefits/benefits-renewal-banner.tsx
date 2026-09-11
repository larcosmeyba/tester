/**
 * The in-app complement to renewal pushes: when any tracked renewal is due
 * within 30 days, a card invites the user into the Benefits-due screen.
 *
 * This is the fallback for users who deny push permission, and a complement
 * for everyone else. It reads live from the server and holds nothing locally —
 * renewal metadata lives only in memory, like the rest of the benefits data.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { type BenefitsRenewal, fetchBenefitsRenewals } from '@/features/benefits/benefits-repository';
import { renewalNeedsAttention } from '@/features/benefits/benefits-renewals';
import { useBenefitsRouter } from '@/features/benefits/benefits-shell-bridge';

export function BenefitsRenewalBanner() {
  const router = useBenefitsRouter();
  const [due, setDue] = useState<BenefitsRenewal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBenefitsRenewals()
      .then((renewals) => {
        if (!cancelled) setDue(renewals.filter(renewalNeedsAttention));
      })
      .catch(() => {
        // The banner is a courtesy. A failed load means no banner, not an error.
        if (!cancelled) setDue([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!due || due.length === 0) return null;

  const count = due.length;
  const headline =
    count === 1
      ? `Your ${due[0].program} renewal is coming up`
      : `${count} benefits renewals are coming up`;

  return (
    <Card style={styles.card} onPress={() => router.push('/resources/benefits-renewals')}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.body}>
            Time to review your benefits — see the deadlines and start the renewal paperwork.
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: HiveColors.warningBg, marginHorizontal: Spacing.three, marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  text: { flex: 1, gap: 2 },
  headline: { color: HiveColors.text, fontSize: 15, fontWeight: '600' },
  body: { color: HiveColors.textSecondary, fontSize: 13 },
  chevron: { color: HiveColors.warningText, fontSize: 24 },
});
