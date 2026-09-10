/**
 * Import from Social Media (iOS copy verbatim).
 *
 * Collects one or more video links — each tagged with its platform and with
 * provenance (typed/pasted vs read from the clipboard) — and hands them to the
 * assignment flow. Transcription itself is a backend seam: the links are stored
 * in context as `importedLinks` so the assign screen can show them as pending
 * until the server turns them into recipes.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton, AppHeader, Chip, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { useMealPlan, type ImportedVideoLink } from '@/features/meals/meal-plan-context';

const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
] as const;

type PlatformKey = (typeof PLATFORMS)[number]['key'];

function detectPlatform(url: string): ImportedVideoLink['platform'] {
  const lower = url.toLowerCase();
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  return 'other';
}

function platformLabel(platform: ImportedVideoLink['platform']): string {
  const found = PLATFORMS.find((entry) => entry.key === platform);
  return found ? found.label : 'Video';
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && (trimmed.includes('.') || trimmed.includes('/'));
}

/**
 * Reads the clipboard without adding a dependency. `expo-clipboard` is the
 * supported path when the app adds it; until then we return null and let the
 * caller fall back to the native long-press paste in the text field.
 */
async function readClipboardText(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clipboard = require('expo-clipboard') as {
      getStringAsync?: () => Promise<string>;
    };
    if (typeof clipboard.getStringAsync === 'function') {
      const text = await clipboard.getStringAsync();
      return text.trim().length > 0 ? text.trim() : null;
    }
  } catch {
    // expo-clipboard is not installed — native paste still works in the field.
  }
  return null;
}

export function SocialImportScreen() {
  const router = useRouter();
  const { importedLinks, addImportedLinks, removeImportedLink } = useMealPlan();

  const [draft, setDraft] = useState('');
  const [activePlatform, setActivePlatform] = useState<PlatformKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const addLink = (url: string, provenance: ImportedVideoLink['provenance']) => {
    const trimmed = url.trim();
    if (!looksLikeUrl(trimmed)) {
      setNotice('That doesn\u2019t look like a video link — check it and try again.');
      return;
    }
    if (importedLinks.some((link) => link.url === trimmed)) {
      setNotice('That link is already in your list.');
      return;
    }
    const platform = activePlatform ?? detectPlatform(trimmed);
    addImportedLinks([{ url: trimmed, platform, provenance }]);
    setDraft('');
    setActivePlatform(null);
    setNotice(null);
  };

  const pasteFromClipboard = async () => {
    const text = await readClipboardText();
    if (text) {
      addLink(text, 'clipboard');
      return;
    }
    // No clipboard module: focus the field so the OS paste menu appears.
    setNotice('Clipboard access isn\u2019t set up — long-press the field to paste.');
    inputRef.current?.focus();
  };

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Import from Social Media" onBack={router.back} />
      <View style={styles.body}>
        <Text style={uiText.muted}>
          Add one or more video links — we&apos;ll extract each recipe for your meal plan.
        </Text>

        <View style={styles.chipRow}>
          {PLATFORMS.map((platform) => (
            <Chip
              key={platform.key}
              label={platform.label}
              selected={activePlatform === platform.key}
              onPress={() =>
                setActivePlatform((current) => (current === platform.key ? null : platform.key))
              }
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Paste a video link</Text>
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <HiveIcon name="send" size={20} color={HiveColors.textSecondary} />
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Paste video URL here..."
              placeholderTextColor={HiveColors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={() => addLink(draft, 'pasted')}
              style={styles.input}
              accessibilityLabel="Paste a video link"
            />
          </View>
          <AppButton
            title="Add"
            variant="secondary"
            disabled={draft.trim().length === 0}
            onPress={() => addLink(draft, 'pasted')}
            style={styles.addButton}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paste from Clipboard"
          onPress={() => void pasteFromClipboard()}
          style={({ pressed }) => [styles.clipboardButton, pressed && styles.pressed]}>
          <HiveIcon name="card" size={22} color={HiveColors.greenDark} />
          <Text style={styles.clipboardLabel}>Paste from Clipboard</Text>
        </Pressable>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {importedLinks.length > 0 ? (
          <View style={styles.list}>
            {importedLinks.map((link) => (
              <View key={link.url} style={styles.linkCard}>
                <View style={styles.linkText}>
                  <Text style={styles.linkPlatform}>
                    {platformLabel(link.platform)}
                    <Text style={styles.linkProvenance}>
                      {'  ·  '}
                      {link.provenance === 'clipboard' ? 'From clipboard' : 'Pasted'}
                    </Text>
                  </Text>
                  <Text style={styles.linkUrl} numberOfLines={1}>
                    {link.url}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${link.url}`}
                  onPress={() => removeImportedLink(link.url)}
                  style={styles.removeButton}>
                  <HiveIcon name="close" size={16} color={HiveColors.textSecondary} />
                </Pressable>
              </View>
            ))}

            <AppButton
              title={`Continue with ${importedLinks.length} link${importedLinks.length === 1 ? '' : 's'}`}
              onPress={() => router.push('/meals/assign')}
            />
          </View>
        ) : null}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  fieldLabel: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    minHeight: 56,
  },
  input: {
    flex: 1,
    color: HiveColors.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  addButton: {
    minWidth: 84,
  },
  clipboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: HiveColors.greenLight,
    borderRadius: Radii.xl,
    paddingVertical: 18,
  },
  clipboardLabel: {
    color: HiveColors.greenDark,
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: { opacity: 0.7 },
  notice: {
    color: HiveColors.warningText,
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: HiveColors.white,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    borderRadius: Radii.lg,
    padding: Spacing.three,
  },
  linkText: {
    flex: 1,
    gap: 4,
  },
  linkPlatform: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  linkProvenance: {
    color: HiveColors.textSecondary,
    fontWeight: '500',
  },
  linkUrl: {
    color: HiveColors.textSecondary,
    fontSize: 13,
  },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
