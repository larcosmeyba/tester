/**
 * The repeating-group editor for the benefits questionnaire.
 *
 * Groups like household members, jobs, or income sources cannot be asked as
 * single text questions: the server rejects scalar saves against a group
 * path, so these answers need their own editor. One card per row, add and
 * remove rows freely, "none of these" declares an empty group (which is a
 * real answer, not a skipped question), and Save writes the rows through
 * `saveBenefitsGroup`.
 *
 * The fields come from the server's vocabulary, never a hardcoded form, and
 * Social Security numbers are filtered out twice: rowSpecsFor() drops them
 * before this component ever sees them, and the server's NeverAsk policy
 * skips them at fill time. They are never rendered, collected, or saved.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  AppButton,
  AppTextField,
  Card,
  Chip,
  uiText,
} from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';

import type { BenefitsFieldSpec, BenefitsProfileData } from './benefits-types';
import {
  draftsFromProfileRows,
  emptyRowDraft,
  groupRowInputs,
  householdMemberNames,
  isEmptyDraft,
  isMemberRefField,
  profileGroup,
  rowLabelFor,
  rowSpecsFor,
  templatePath,
  type GroupBucket,
  type GroupRowDraft,
} from './benefits-groups';

function keyboardFor(kind: string) {
  switch (kind) {
    case 'MONEY':
      return 'decimal-pad' as const;
    case 'NUMBER':
      return 'number-pad' as const;
    default:
      return 'default' as const;
  }
}

function placeholderFor(kind: string) {
  switch (kind) {
    case 'DATE':
      return 'YYYY-MM-DD';
    case 'MONEY':
      return '0.00';
    default:
      return undefined;
  }
}

function humanise(choice: string): string {
  const spaced = choice.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function RowFieldInput({
  spec,
  value,
  needed,
  memberNames,
  onChange,
}: {
  spec: BenefitsFieldSpec;
  value: string;
  needed: boolean;
  memberNames: string[];
  onChange: (text: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={uiText.body}>{spec.question}</Text>
      {needed ? <Text style={styles.required}>Needed for this form</Text> : null}
      {spec.isSensitive ? (
        <Text style={styles.sensitive}>
          Kept encrypted on Help The Hive&apos;s server. We only ever show you the last four digits.
        </Text>
      ) : null}
      {spec.kind === 'BOOLEAN' ? (
        <View style={styles.chips}>
          <Chip label="Yes" selected={value === 'yes'} onPress={() => onChange('yes')} />
          <Chip label="No" selected={value === 'no'} onPress={() => onChange('no')} />
        </View>
      ) : isMemberRefField(spec.fieldPath) && memberNames.length > 0 ? (
        <View style={styles.chips}>
          {memberNames.map((name) => (
            <Chip key={name} label={name} selected={value === name} onPress={() => onChange(name)} />
          ))}
        </View>
      ) : spec.choices.length > 0 ? (
        <View style={styles.chips}>
          {spec.choices.map((choice) => (
            <Chip
              key={choice}
              label={humanise(choice)}
              selected={value === choice}
              onPress={() => onChange(choice)}
            />
          ))}
        </View>
      ) : (
        <AppTextField
          label={spec.label}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardFor(spec.kind)}
          placeholder={placeholderFor(spec.kind)}
        />
      )}
    </View>
  );
}

export function BenefitsGroupEditor({
  groupPath,
  title,
  required,
  sensitive,
  specs,
  initialDrafts,
  memberNames,
  missingRowPaths,
  saving,
  saveError,
  onSave,
  onDeclareNone,
}: {
  /** e.g. `household.members`. */
  groupPath: string;
  /** The group's own question, e.g. "Who else lives in your household?" */
  title: string;
  required: boolean;
  sensitive: boolean;
  /** Row field specs, ideally with still-missing fields first. */
  specs: BenefitsFieldSpec[];
  initialDrafts: GroupRowDraft[];
  /** Household member names, offered as the answer for `member_ref` fields. */
  memberNames: string[];
  /** Template row paths still missing, highlighted as "Needed for this form". */
  missingRowPaths: Set<string>;
  saving: boolean;
  saveError: string;
  onSave: (inputs: ReturnType<typeof groupRowInputs>) => void;
  onDeclareNone: () => void;
}) {
  const [drafts, setDrafts] = useState<GroupRowDraft[]>(initialDrafts);

  function setValue(rowIndex: number, fieldPath: string, text: string) {
    setDrafts((current) =>
      current.map((draft, index) =>
        index === rowIndex
          ? { ...draft, values: { ...draft.values, [fieldPath]: text } }
          : draft,
      ),
    );
  }

  function addRow() {
    setDrafts((current) => [...current, emptyRowDraft()]);
  }

  function removeRow(rowIndex: number) {
    setDrafts((current) => current.filter((_, index) => index !== rowIndex));
  }

  const filledRows = drafts.filter((draft) => !isEmptyDraft(draft)).length;

  return (
    <Card>
      <Text style={uiText.subtitle}>{title}</Text>
      {required ? <Text style={styles.required}>Needed for this form</Text> : null}
      {sensitive ? (
        <Text style={styles.sensitive}>
          Kept encrypted on Help The Hive&apos;s server. We only ever show you the last four digits.
        </Text>
      ) : null}

      {drafts.map((draft, rowIndex) => (
        <View key={draft.rowId !== '' ? draft.rowId : `new-${rowIndex}`} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>{rowLabelFor(groupPath, rowIndex)}</Text>
            <TouchableOpacity onPress={() => removeRow(rowIndex)} hitSlop={12}>
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
          {specs.map((spec) => (
            <RowFieldInput
              key={spec.fieldPath}
              spec={spec}
              value={draft.values[spec.fieldPath] ?? ''}
              needed={missingRowPaths.has(templatePath(spec.fieldPath))}
              memberNames={isMemberRefField(spec.fieldPath) ? memberNames : []}
              onChange={(text) => setValue(rowIndex, spec.fieldPath, text)}
            />
          ))}
        </View>
      ))}

      <TouchableOpacity onPress={addRow} style={styles.addRow}>
        <Text style={styles.addRowLabel}>
          + Add {rowLabelFor(groupPath, 0).replace(/ 1$/, '').toLowerCase()}
        </Text>
      </TouchableOpacity>

      {saveError !== '' ? <Text style={styles.saveError}>{saveError}</Text> : null}

      <View style={styles.actions}>
        <AppButton
          title={saving ? 'Saving…' : `Save${filledRows > 0 ? ` ${filledRows}` : ''}`}
          onPress={() => onSave(groupRowInputs(drafts, specs))}
          disabled={saving}
        />
        <Chip
          label="None of these"
          selected={false}
          onPress={onDeclareNone}
        />
      </View>
      <Text style={styles.hint}>
        {specs.length === 0
          ? 'No questions for this section right now.'
          : 'Leave anything blank you do not know — we will ask again only for what the form needs.'}
      </Text>
    </Card>
  );
}

/**
 * One group editor, with its row fields and drafts derived from the server's
 * vocabulary and the stored profile. Missing-first field order puts the boxes
 * the forms are actually waiting on at the top of each row. Shared by the
 * multi-application questionnaire and the single-application questionnaire.
 */
export function GroupQuestionEditor({
  bucket,
  profile,
  vocabulary,
  saving,
  saveError,
  onSave,
  onDeclareNone,
}: {
  bucket: GroupBucket;
  profile: BenefitsProfileData | null;
  vocabulary: BenefitsFieldSpec[];
  saving: boolean;
  saveError: string;
  /** Resolves true when the rows were saved; false keeps the drafts in place. */
  onSave: (rows: import('@helpthehive/api-contract').BenefitsGroupRowInput[]) => Promise<boolean>;
  onDeclareNone: () => Promise<boolean>;
}) {
  const [saveCount, setSaveCount] = useState(0);

  const specs = useMemo(() => {
    const rows = rowSpecsFor(bucket.groupPath, vocabulary);
    return [...rows].sort((a, b) => {
      const aMissing = bucket.missingRowPaths.has(templatePath(a.fieldPath)) ? 0 : 1;
      const bMissing = bucket.missingRowPaths.has(templatePath(b.fieldPath)) ? 0 : 1;
      return aMissing - bMissing;
    });
  }, [bucket, vocabulary]);

  const group = profileGroup(profile, bucket.groupPath);
  const initialDrafts = useMemo(() => {
    const drafts = draftsFromProfileRows(group?.rows ?? []);
    if (drafts.length > 0) return drafts;
    // Declared "none" earlier: show no rows rather than a misleading blank.
    if (group?.collected === true) return [];
    return [emptyRowDraft()];
  }, [group]);

  const title =
    bucket.groupQuestion?.question ??
    vocabulary.find((spec) => spec.fieldPath === bucket.groupPath)?.question ??
    bucket.groupPath;

  // The inner editor owns its drafts once mounted. It remounts when the
  // profile first arrives and after this group's own successful save, so it
  // always restarts from server truth — including the row ids the server
  // assigns, which keeps a second save from duplicating rows. A failed save
  // leaves the drafts untouched so nothing the user typed is lost. Saves from
  // other groups leave it (and any in-progress edits) alone.
  async function handleSave(rows: import('@helpthehive/api-contract').BenefitsGroupRowInput[]) {
    const saved = await onSave(rows);
    if (saved) setSaveCount((count) => count + 1);
  }

  async function handleDeclareNone() {
    const saved = await onDeclareNone();
    if (saved) setSaveCount((count) => count + 1);
  }

  return (
    <BenefitsGroupEditor
      key={`${bucket.groupPath}:${profile === null ? 'loading' : 'ready'}:${saveCount}`}
      groupPath={bucket.groupPath}
      title={title}
      required={bucket.required}
      sensitive={bucket.sensitive}
      specs={specs}
      initialDrafts={initialDrafts}
      memberNames={bucket.groupPath === 'household.members' ? [] : householdMemberNames(profile)}
      missingRowPaths={bucket.missingRowPaths}
      saving={saving}
      saveError={saveError}
      onSave={handleSave}
      onDeclareNone={handleDeclareNone}
    />
  );
}

const styles = StyleSheet.create({
  required: { color: HiveColors.danger, fontSize: 12, fontWeight: '700' },
  sensitive: { color: HiveColors.textSecondary, fontSize: 12 },
  row: {
    marginTop: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: HiveColors.border,
    gap: Spacing.two,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: HiveColors.text },
  remove: { color: HiveColors.danger, fontSize: 13, fontWeight: '600' },
  field: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  addRow: { marginTop: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  addRowLabel: { color: HiveColors.green, fontSize: 14, fontWeight: '700' },
  actions: { marginTop: Spacing.two, gap: Spacing.two },
  saveError: { color: HiveColors.danger, fontSize: 13, marginTop: Spacing.one },
  hint: { color: HiveColors.textSecondary, fontSize: 12, marginTop: Spacing.two },
});
