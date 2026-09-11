/**
 * The guided checklist for applying: what to have ready before, during, and
 * after the application.
 *
 * The content comes from the server — reference material, not rules the app
 * invents, and items flagged confirmOnPortal say so plainly because details
 * vary by state and county. The checkboxes are local and deliberately not
 * persisted: they are a reading aid, not part of the application.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, CheckboxRow, EmptyState, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  type BenefitsChecklistSection,
  fetchBenefitsChecklist,
} from '@/features/benefits/benefits-repository';
import { orderChecklistSections } from '@/features/benefits/benefits-checklist';
import {
  useBenefitsParams,
  useBenefitsRouter,
} from '@/features/benefits/benefits-shell-bridge';

export default function BenefitsChecklistScreen() {
  const router = useBenefitsRouter();
  const { program, state } = useBenefitsParams<{ program?: string; state?: string }>();

  const [sections, setSections] = useState<BenefitsChecklistSection[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!program || !state) return;
    let cancelled = false;
    fetchBenefitsChecklist(program, state)
      .then((result) => {
        if (!cancelled) setSections(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load the checklist.');
      });
    return () => {
      cancelled = true;
    };
  }, [program, state]);

  const ordered = useMemo(() => (sections ? orderChecklistSections(sections) : []), [sections]);

  const toggle = (key: string) =>
    setChecked((current) => ({ ...current, [key]: !current[key] }));

  if (!program || !state) {
    return (
      <ScrollScreen>
        <AppHeader title="Application checklist" onBack={router.back} />
        <View style={styles.body}>
          <Text style={styles.error}>
            We need a program and a state to load the right checklist.
          </Text>
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <AppHeader title="Application checklist" onBack={router.back} />
      <View style={styles.body}>
        <Text style={uiText.muted}>
          {program} · {state} — what to have ready, in order. Tick things off as you go;
          the ticks stay on this screen and are never sent anywhere.
        </Text>

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        {sections === null && error === '' ? (
          <Text style={uiText.muted}>Loading…</Text>
        ) : ordered.length === 0 ? (
          <EmptyState
            title="No checklist yet"
            subtitle="There's no guided checklist for this program and state yet."
          />
        ) : (
          ordered.map((section, sectionIndex) => (
            <Card key={`${section.phase}-${sectionIndex}`}>
              <Text style={uiText.subtitle}>{section.title}</Text>
              <View style={styles.items}>
                {section.items.map((item, itemIndex) => {
                  const key = `${section.phase}:${itemIndex}`;
                  return (
                    <CheckboxRow
                      key={key}
                      title={item.label}
                      subtitle={
                        [
                          item.detail ?? '',
                          item.confirmOnPortal
                            ? 'Confirm this on the official portal — the details vary by state and county.'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      selected={checked[key] ?? false}
                      onPress={() => toggle(key)}
                    />
                  );
                })}
              </View>
            </Card>
          ))
        )}

        <AppButton title="Back to the portal" variant="plain" onPress={router.back} />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  items: { gap: Spacing.one, marginTop: Spacing.one },
  error: { color: HiveColors.danger, fontSize: 13 },
});
