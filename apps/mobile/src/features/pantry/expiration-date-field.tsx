/**
 * ExpirationDateField — the Swift pantry design's required-expiration pattern.
 *
 * The date starts at a default (+7 days) but the form treats it as unset
 * until the user opens the editor and confirms it: tapping the field counts
 * as confirmation even if the date is unchanged. Until then a "Required"
 * badge and an orange hint stay visible, and the parent's save button stays
 * disabled.
 *
 * Pure React Native month/day/year steppers — no native date-picker
 * dependency — constrained so the picked date can never be in the past.
 * Dates are plain YYYY-MM-DD strings, the contract's wire format.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HiveIcon, ModalSheet, uiText } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Ymd = { y: number; m: number; d: number };

export function parseYmd(value: string): Ymd {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return { y: y || 1970, m: m || 1, d: d || 1 };
}

export function toYmd({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "2026-09-22" -> "Sep 22, 2026". Parsed from parts, never via Date. */
export function formatYmd(value: string): string {
  const { y, m, d } = parseYmd(value);
  return `${MONTHS[m - 1] ?? ''} ${d}, ${y}`;
}

const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();

function Stepper({
  label,
  display,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled: boolean;
  plusDisabled: boolean;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={minusDisabled}
          onPress={onMinus}
          style={[styles.stepButton, minusDisabled && styles.stepButtonDisabled]}>
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{display}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={plusDisabled}
          onPress={onPlus}
          style={[styles.stepButton, plusDisabled && styles.stepButtonDisabled]}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ExpirationDateField({
  value,
  confirmed,
  onConfirm,
  label = 'Expiration Date',
}: {
  value: string;
  confirmed: boolean;
  onConfirm: (date: string) => void;
  label?: string;
}) {
  const [editorOpen, setEditorOpen] = useState(false);

  const today = useMemo(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }, []);

  // Editor state starts from the current value whenever the editor opens.
  const [draft, setDraft] = useState<Ymd>(() => parseYmd(value));
  function openEditor() {
    setDraft(parseYmd(value));
    setEditorOpen(true);
  }

  const minMonth = draft.y === today.y ? today.m : 1;
  const minDay = draft.y === today.y && draft.m === today.m ? today.d : 1;
  const maxDay = daysInMonth(draft.y, draft.m);
  const maxYear = today.y + 5;

  function clamp(next: Ymd): Ymd {
    const y = Math.min(Math.max(next.y, today.y), maxYear);
    const m = Math.min(Math.max(next.m, y === today.y ? today.m : 1), 12);
    const d = Math.min(Math.max(next.d, y === today.y && m === today.m ? today.d : 1), daysInMonth(y, m));
    return { y, m, d };
  }

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {confirmed ? null : (
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>Required</Text>
          </View>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatYmd(value)}. Tap to confirm.`}
        onPress={openEditor}
        style={styles.dateCard}>
        <Text style={[uiText.body, !confirmed && styles.dateUnconfirmed]}>{formatYmd(value)}</Text>
        <HiveIcon name="next" size={16} color={HiveColors.textSecondary} />
      </Pressable>
      {confirmed ? null : (
        <View style={styles.hintRow}>
          <HiveIcon name="warning" size={14} color={HiveColors.orange} />
          <Text style={styles.hintText}>Tap the date above to confirm the expiration date</Text>
        </View>
      )}
      <ModalSheet visible={editorOpen} onClose={() => setEditorOpen(false)}>
        <View style={styles.editor}>
          <Text style={uiText.subtitle}>{label}</Text>
          <Stepper
            label="Month"
            display={MONTHS[draft.m - 1] ?? ''}
            minusDisabled={draft.m <= minMonth}
            plusDisabled={draft.m >= 12}
            onMinus={() => setDraft((prev) => clamp({ ...prev, m: prev.m - 1 }))}
            onPlus={() => setDraft((prev) => clamp({ ...prev, m: prev.m + 1 }))}
          />
          <Stepper
            label="Day"
            display={String(draft.d)}
            minusDisabled={draft.d <= minDay}
            plusDisabled={draft.d >= maxDay}
            onMinus={() => setDraft((prev) => clamp({ ...prev, d: prev.d - 1 }))}
            onPlus={() => setDraft((prev) => clamp({ ...prev, d: prev.d + 1 }))}
          />
          <Stepper
            label="Year"
            display={String(draft.y)}
            minusDisabled={draft.y <= today.y}
            plusDisabled={draft.y >= maxYear}
            onMinus={() => setDraft((prev) => clamp({ ...prev, y: prev.y - 1 }))}
            onPlus={() => setDraft((prev) => clamp({ ...prev, y: prev.y + 1 }))}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onConfirm(toYmd(draft));
              setEditorOpen(false);
            }}
            style={styles.confirmButton}>
            <Text style={styles.confirmText}>Confirm date</Text>
          </Pressable>
        </View>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  requiredBadge: {
    backgroundColor: HiveColors.danger,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  requiredText: {
    color: HiveColors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HiveColors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateUnconfirmed: {
    color: HiveColors.textSecondary,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  hintText: {
    color: HiveColors.orange,
    fontSize: 13,
  },
  editor: {
    gap: 16,
    padding: 20,
  },
  stepper: {
    gap: 6,
  },
  stepperLabel: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HiveColors.card,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stepperValue: {
    color: HiveColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.35,
  },
  stepButtonText: {
    color: HiveColors.green,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  confirmButton: {
    backgroundColor: HiveColors.green,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmText: {
    color: HiveColors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
