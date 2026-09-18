/**
 * Edit Answers (audit Section 3b).
 *
 * Edits the reusable household/profile answers that feed every application —
 * the server-side profile model, not local AppState. Saves through the
 * existing `saveBenefitsAnswers` mutation, then refills each application so
 * the generated PDFs pick the new answers up.
 *
 * Standing product rule: there is no SSN field here and there never will be.
 * Any profile answer whose path looks like an SSN is filtered out as a
 * safety net on top of the server's NeverAsk policy.
 *
 * Rendered inside a full-screen modal. Saving invalidates the caller's
 * review confirmations via `onSaved`.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, AppTextField, Card, Chip, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';

import { centsToMoney, moneyToCents } from './benefits-answers';
import type { BenefitsAnswer, BenefitsGroupRowInput } from '@helpthehive/api-contract';
import {
  fetchBenefitsProfile,
  fetchBenefitsVocabulary,
  refillBenefitsApplication,
  saveBenefitsAnswers,
  saveBenefitsGroup,
} from './benefits-repository';
import type { BenefitsFieldSpec, BenefitsProfileData } from './benefits-types';
import { GroupQuestionEditor } from './benefits-group-editor';
import { rowSpecsFor, type GroupBucket } from './benefits-groups';
import { SensitiveScreen } from '@/features/analytics/sensitive-screen';

type EditableKind = 'TEXT' | 'NUMBER' | 'MONEY' | 'DATE' | 'BOOLEAN';

const EDITABLE_KINDS: ReadonlySet<string> = new Set(['TEXT', 'NUMBER', 'MONEY', 'DATE', 'BOOLEAN']);

function isSsnPath(fieldPath: string): boolean {
  return fieldPath.toLowerCase().includes('ssn');
}

function prettyPath(fieldPath: string): string {
  const last = fieldPath.split('.').pop() ?? fieldPath;
  return last
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function answerToString(answer: BenefitsAnswer): string {
  switch (answer.kind) {
    case 'TEXT':
      return answer.text ?? '';
    case 'NUMBER':
      return answer.number != null ? String(answer.number) : '';
    case 'MONEY':
      return answer.moneyCents != null ? centsToMoney(answer.moneyCents) : '';
    case 'DATE':
      return answer.date ?? '';
    case 'BOOLEAN':
      return answer.bool == null ? '' : answer.bool ? 'Yes' : 'No';
    default:
      return '';
  }
}

export function BenefitsEditAnswers({
  applicationIds,
  onClose,
  onSaved,
}: {
  /** Applications to refill after the save so their PDFs pick up the edits. */
  applicationIds: string[];
  onClose: () => void;
  /** Called after a successful save + refill. The caller must reset review confirmations. */
  onSaved: () => void;
}) {
  const [answers, setAnswers] = useState<BenefitsAnswer[] | null>(null);
  const [profile, setProfile] = useState<BenefitsProfileData | null>(null);
  const [specs, setSpecs] = useState<BenefitsFieldSpec[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [groupSaving, setGroupSaving] = useState<Record<string, boolean>>({});
  const [groupSaveErrors, setGroupSaveErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchBenefitsProfile(), fetchBenefitsVocabulary()])
      .then(([profile, vocabulary]) => {
        if (cancelled) return;
        setProfile(profile);
        setAnswers(profile.answers);
        setSpecs(vocabulary);
        const initial: Record<string, string> = {};
        for (const answer of profile.answers) {
          if (EDITABLE_KINDS.has(answer.kind) && !isSsnPath(answer.fieldPath)) {
            initial[answer.fieldPath] = answerToString(answer);
          }
        }
        setDrafts(initial);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load your answers.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const specByPath = useMemo(() => {
    const map = new Map<string, BenefitsFieldSpec>();
    for (const spec of specs ?? []) map.set(spec.fieldPath, spec);
    return map;
  }, [specs]);

  const editable = useMemo(
    () =>
      (answers ?? []).filter(
        (answer) =>
          EDITABLE_KINDS.has(answer.kind) &&
          !isSsnPath(answer.fieldPath) &&
          !answer.isSensitive,
      ),
    [answers],
  );

  // Collected repeating groups (household members, jobs, …) get the same row
  // editor the questionnaire uses, so corrections there flow into every form.
  const groupBuckets = useMemo<GroupBucket[]>(() => {
    if (!profile || !specs) return [];
    const buckets: GroupBucket[] = [];
    for (const group of profile.groups) {
      if (!group.collected) continue;
      if (rowSpecsFor(group.groupPath, specs).length === 0) continue;
      const spec = specs.find((candidate) => candidate.fieldPath === group.groupPath);
      buckets.push({
        groupPath: group.groupPath,
        sectionGroup: spec?.group ?? '',
        groupQuestion: null,
        missingRowPaths: new Set<string>(),
        required: false,
        sensitive: spec?.isSensitive ?? false,
      });
    }
    return buckets;
  }, [profile, specs]);

  async function saveGroup(bucket: GroupBucket, rows: BenefitsGroupRowInput[]): Promise<boolean> {
    setGroupSaving((current) => ({ ...current, [bucket.groupPath]: true }));
    setGroupSaveErrors((current) => ({ ...current, [bucket.groupPath]: '' }));
    try {
      const updated = await saveBenefitsGroup({ groupPath: bucket.groupPath, rows });
      setProfile(updated);
      setAnswers(updated.answers);
      for (const applicationId of applicationIds) {
        await refillBenefitsApplication(applicationId);
      }
      onSaved();
      return true;
    } catch (cause) {
      setGroupSaveErrors((current) => ({
        ...current,
        [bucket.groupPath]:
          cause instanceof Error ? cause.message : 'Could not save these answers.',
      }));
      return false;
    } finally {
      setGroupSaving((current) => ({ ...current, [bucket.groupPath]: false }));
    }
  }

  if (answers === null) {
    return (
      <ScrollScreen>
        <AppHeader title="Edit answers" onBack={onClose} />
        <View style={styles.body}>
          <Text style={error !== '' ? styles.error : uiText.muted}>
            {error !== '' ? error : 'Loading your answers…'}
          </Text>
        </View>
      </ScrollScreen>
    );
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const input = editable.map((answer) => {
        const raw = (drafts[answer.fieldPath] ?? '').trim();
        const kind = answer.kind as EditableKind;
        switch (kind) {
          case 'NUMBER': {
            const parsed = raw === '' ? null : Number(raw);
            return { fieldPath: answer.fieldPath, status: 'PROVIDED' as const, number: Number.isFinite(parsed) ? parsed : null };
          }
          case 'MONEY':
            return { fieldPath: answer.fieldPath, status: 'PROVIDED' as const, moneyCents: raw === '' ? null : moneyToCents(raw) };
          case 'DATE':
            return { fieldPath: answer.fieldPath, status: 'PROVIDED' as const, date: raw === '' ? null : raw };
          case 'BOOLEAN':
            return {
              fieldPath: answer.fieldPath,
              status: 'PROVIDED' as const,
              bool: raw === '' ? null : raw.toLowerCase() === 'yes',
            };
          case 'TEXT':
          default:
            return { fieldPath: answer.fieldPath, status: 'PROVIDED' as const, text: raw === '' ? null : raw };
        }
      });
      await saveBenefitsAnswers(input);
      for (const applicationId of applicationIds) {
        await refillBenefitsApplication(applicationId);
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your answers.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollScreen>
      <AppHeader title="Edit answers" onBack={onClose} />
      {/* Saved answers: masked out of session replays. */}
      <SensitiveScreen style={styles.body}>
        <Text style={uiText.muted}>
          These answers are reused across your applications. Saving updates every application
          listed here and marks them as not yet reviewed, so you confirm the new details before
          downloading.
        </Text>

        {editable.length === 0 ? (
          <Card>
            <Text style={uiText.muted}>There are no editable profile answers right now.</Text>
          </Card>
        ) : (
          editable.map((answer) => {
            const spec = specByPath.get(answer.fieldPath);
            const label = spec?.label || spec?.question || prettyPath(answer.fieldPath);
            const value = drafts[answer.fieldPath] ?? '';
            if (answer.kind === 'BOOLEAN') {
              return (
                <View key={answer.fieldPath} style={styles.boolRow}>
                  <Text style={styles.boolLabel}>{label}</Text>
                  <View style={styles.boolChips}>
                    <Chip
                      label="Yes"
                      selected={value === 'Yes'}
                      onPress={() => setDrafts((current) => ({ ...current, [answer.fieldPath]: 'Yes' }))}
                    />
                    <Chip
                      label="No"
                      selected={value === 'No'}
                      onPress={() => setDrafts((current) => ({ ...current, [answer.fieldPath]: 'No' }))}
                    />
                  </View>
                </View>
              );
            }
            return (
              <AppTextField
                key={answer.fieldPath}
                label={label}
                value={value}
                onChangeText={(next) => setDrafts((current) => ({ ...current, [answer.fieldPath]: next }))}
                keyboardType={
                  answer.kind === 'NUMBER' || answer.kind === 'MONEY' ? 'decimal-pad' : 'default'
                }
                placeholder={answer.kind === 'MONEY' ? '0.00' : undefined}
              />
            );
          })
        )}

        {groupBuckets.map((bucket) => (
          <GroupQuestionEditor
            key={bucket.groupPath}
            bucket={bucket}
            profile={profile}
            vocabulary={specs ?? []}
            saving={groupSaving[bucket.groupPath] === true}
            saveError={groupSaveErrors[bucket.groupPath] ?? ''}
            onSave={(rows) => saveGroup(bucket, rows)}
            onDeclareNone={() => saveGroup(bucket, [])}
          />
        ))}

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton title={saving ? 'Saving…' : 'Save answers'} onPress={() => void save()} disabled={saving} />
        <AppButton title="Cancel" variant="plain" onPress={onClose} disabled={saving} />
      </SensitiveScreen>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  boolRow: { gap: Spacing.one },
  boolLabel: { color: HiveColors.text, fontSize: 14, fontWeight: '600' },
  boolChips: { flexDirection: 'row', gap: Spacing.one },
  error: { color: HiveColors.danger, fontSize: 13 },
});
