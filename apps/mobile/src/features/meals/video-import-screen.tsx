/**
 * Import from Social Media — rebuilt from Marcos's SwiftUI sandbox
 * (`SocialMediaImportView`).
 *
 * Swift-styled flow: URL field with platform detection, an "Add" queue of
 * links, "Import N Recipes" with a transcribing state, then a confirmation
 * step ("Are these all the recipes you want?") showing the REAL transcribed
 * recipes from the backend — never mock names — before continuing to the
 * grocery list.
 *
 * The import itself runs on the backend (`video-import-service`): each link is
 * started, polled until the draft is ready, reviewed (the user fills in what
 * the video never stated — servings, per-line quantity/unit), and accepted,
 * which saves it as one of the viewer's recipes. Pantry cross-check and
 * Kroger estimated pricing (always labeled Estimated) follow from the accepted
 * recipe ids.
 */
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AppButton,
  AppHeader,
  Card,
  AppTextField,
  HiveIcon,
  ModalSheet,
  ScrollScreen,
  uiText,
} from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { PRICING_NOTICE, PRICING_NOTICE_SHORT } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { usePantry } from '@/features/pantry/pantry-context';
import { recipeService } from '@/features/meals/recipe-service';
import {
  looksLikeVideoLink,
  videoImportFailureMessage,
  videoImportService,
} from '@/features/meals/video-import-service';
import {
  addSocialLink,
  canAddSocialLink,
  canContinueToGrocery,
  detectSocialPlatform,
  estimatedRecipeMinutes,
  removeSocialLink,
  truncateDisplayUrl,
  SOCIAL_PLATFORM_ACCENT,
  SOCIAL_PLATFORM_BADGES,
  SOCIAL_PLATFORM_LABEL,
  type SocialImportLink,
  type SocialPlatform,
} from '@/features/meals/social-import-model';
import {
  getAiUsage,
  hasAiUsageRemaining,
  recordAiUsage,
  type AiUsage,
} from '@/features/meals/ai-usage-limits';
import { AiLimitGate } from '@/features/meals/ai-limit-gate';
import { printAndShareGroceryList } from '@/features/meals/grocery-list-print';
import type { CostRange, GroceryItem, GroceryList } from '@/features/meals/meal-plan-model';
import type { IngredientLine, Recipe } from '@/features/meals/recipe-model';
import { describeError } from '@/services/api-error';

/** The Swift sandbox's "Import N Recipes" pink (0.82, 0.14, 0.44). */
const IMPORT_PINK = '#D12470';

declare function require(id: string): unknown;

type ClipboardLike = { getStringAsync: () => Promise<string> };
let clipboardModule: ClipboardLike | null | undefined;
/**
 * Lazily resolves expo-clipboard. The dependency is declared in package.json,
 * but the screen still builds in checkouts where `pnpm install` has not run
 * yet — the "Paste from Clipboard" button simply hides until it is.
 *
 * The nested try/catch guards the native proxy: on builds where the JS
 * package resolves but the native module is not linked (stale dev client,
 * mismatched Expo Go), property access on the module proxy throws
 * "Cannot find native module" — that must never crash the screen.
 */
function getClipboard(): ClipboardLike | null {
  if (clipboardModule !== undefined) return clipboardModule;
  clipboardModule = null;
  try {
    const mod = require('expo-clipboard') as Partial<ClipboardLike> | undefined;
    try {
      if (mod && typeof mod.getStringAsync === 'function') {
        clipboardModule = mod as ClipboardLike;
      }
    } catch {
      // Native module not linked in this build — clipboard stays unavailable.
    }
  } catch {
    // Package not installed — clipboard stays unavailable.
  }
  return clipboardModule;
}

type Phase = 'link' | 'review' | 'confirm' | 'pantry' | 'ownList';

type QueuedLink = SocialImportLink & {
  status: 'pending' | 'importing' | 'done' | 'failed';
  importPhase: 'queued' | 'running' | null;
  importId: string | null;
  draft: Recipe | null;
  error: string;
};

type AcceptedRecipe = {
  linkId: string;
  recipeId: string;
  title: string;
  platform: SocialPlatform;
  minutes: number | null;
  servings: number | null;
};

let linkIdCounter = 0;
const makeLinkId = () => `social-link-${Date.now()}-${++linkIdCounter}`;

export function VideoImportScreen() {
  const router = useRouter();
  const { request, clearSelectedRecipes, toggleRecipe } = useMealPlan();
  const { activeItems } = usePantry();

  const [phase, setPhase] = useState<Phase>('link');
  const [urlText, setUrlText] = useState('');
  const [urlError, setUrlError] = useState('');
  const [links, setLinks] = useState<QueuedLink[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [servingsEdits, setServingsEdits] = useState<Record<string, string>>({});
  const [linePatches, setLinePatches] = useState<
    Record<string, Record<number, { quantity: string; unit: string }>>
  >({});
  const [acceptError, setAcceptError] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);

  const [accepted, setAccepted] = useState<AcceptedRecipe[]>([]);

  const [grocery, setGrocery] = useState<{ list: GroceryList; cost: CostRange } | null>(null);
  const [groceryError, setGroceryError] = useState('');
  const [isLoadingGrocery, setIsLoadingGrocery] = useState(false);

  const [checked, setChecked] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [instacartNote, setInstacartNote] = useState(false);

  const [limitGate, setLimitGate] = useState<AiUsage | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const updateLink = (id: string, patch: Partial<QueuedLink>) =>
    setLinks((prev) => prev.map((link) => (link.id === id ? { ...link, ...patch } : link)));

  /* ---------------- link queue ---------------- */

  const currentPlatform = detectSocialPlatform(urlText.trim());
  const canAdd = canAddSocialLink(links, urlText);

  const addLink = () => {
    setUrlError('');
    if (!looksLikeVideoLink(urlText) || !canAdd) {
      setUrlError('Paste a full video link, starting with https://');
      return;
    }
    const base = addSocialLink(links, urlText, makeLinkId);
    if (base === links) {
      setUrlError('That link is already in the queue.');
      return;
    }
    const added = base[base.length - 1]!;
    setLinks((prev) => [
      ...prev,
      {
        id: added.id,
        url: added.url,
        platform: added.platform,
        status: 'pending',
        importPhase: null,
        importId: null,
        draft: null,
        error: '',
      },
    ]);
    setUrlText('');
  };

  const removeLink = (id: string) => setLinks((prev) => removeSocialLink(prev, id));

  const pasteFromClipboard = async () => {
    const clipboard = getClipboard();
    if (!clipboard) return;
    try {
      const text = await clipboard.getStringAsync();
      if (text) setUrlText(text);
    } catch {
      // Reading the clipboard is best-effort; the field stays editable.
    }
  };

  /* ---------------- import run ---------------- */

  const startImportAll = async () => {
    if (isImporting || links.length === 0) return;
    setUrlError('');
    const controller = new AbortController();
    abortRef.current = controller;

    const queue = links.filter((link) => link.status === 'pending' || link.status === 'failed');
    const queueIds = queue.map((link) => link.id);
    const urls = new Map(queue.map((link) => [link.id, link.url]));
    setLinks((prev) =>
      prev.map((link) =>
        queueIds.includes(link.id)
          ? { ...link, status: 'pending' as const, importPhase: null, importId: null, draft: null, error: '' }
          : link
      )
    );

    setIsImporting(true);
    const finished: string[] = [];

    for (const id of queueIds) {
      if (controller.signal.aborted) break;
      const url = urls.get(id);
      if (!url) continue;
      updateLink(id, { status: 'importing', importPhase: 'queued', error: '' });

      // The gate fires AT the limit — this check runs before any AI work.
      if (!(await hasAiUsageRemaining('video_import'))) {
        setLimitGate(await getAiUsage('video_import'));
        updateLink(id, { status: 'pending', importPhase: null });
        break;
      }

      try {
        const started = await videoImportService.start(url);
        updateLink(id, { importId: started.importId });
        const done = await videoImportService.poll(started.importId, {
          signal: controller.signal,
          onStatus: (status) =>
            updateLink(id, {
              importPhase: status === 'queued' ? 'queued' : status === 'running' ? 'running' : null,
            }),
        });
        if (done.status === 'succeeded' && done.draft) {
          // The AI work succeeded — this is what consumes the allowance.
          await recordAiUsage('video_import');
          updateLink(id, { status: 'done', importPhase: null, draft: done.draft });
          finished.push(id);
        } else if (done.status === 'failed') {
          updateLink(id, {
            status: 'failed',
            importPhase: null,
            error: videoImportFailureMessage(done.errorCode, done.errorMessage),
          });
        } else {
          // cancelled server-side — back to pending so it can be retried.
          updateLink(id, { status: 'pending', importPhase: null, importId: null });
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          updateLink(id, { status: 'pending', importPhase: null, importId: null });
          break;
        }
        updateLink(id, { status: 'failed', importPhase: null, error: describeError(caught).message });
      }
    }

    abortRef.current = null;
    setIsImporting(false);

    if (finished.length > 0) {
      const edits: Record<string, string> = {};
      setLinks((prev) => {
        for (const link of prev) {
          if (finished.includes(link.id) && link.draft) {
            edits[link.id] = link.draft.servings != null ? String(link.draft.servings) : '';
          }
        }
        return prev;
      });
      setServingsEdits((prev) => ({ ...prev, ...edits }));
      setReviewIds(finished);
      setReviewIndex(0);
      setAcceptError('');
      setPhase('review');
    }
  };

  const cancelImport = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const inFlight = links.filter((link) => link.status === 'importing' && link.importId);
    for (const link of inFlight) {
      try {
        await videoImportService.cancel(link.importId!);
      } catch {
        // Best-effort: the import will finish or time out server-side.
      }
      updateLink(link.id, { status: 'pending', importPhase: null, importId: null });
    }
    setIsImporting(false);
  };

  /* ---------------- review + accept ---------------- */

  const currentReviewId = reviewIds[reviewIndex];
  const currentReviewLink = links.find((link) => link.id === currentReviewId) ?? null;

  const setLinePatch = (linkId: string, position: number, patch: Partial<{ quantity: string; unit: string }>) =>
    setLinePatches((current) => ({
      ...current,
      [linkId]: {
        ...(current[linkId] ?? {}),
        [position]: { ...(current[linkId]?.[position] ?? { quantity: '', unit: '' }), ...patch },
      },
    }));

  const advanceReview = () => {
    setAcceptError('');
    if (reviewIndex + 1 < reviewIds.length) {
      setReviewIndex(reviewIndex + 1);
    } else {
      setPhase('confirm');
    }
  };

  const acceptCurrentDraft = async () => {
    if (!currentReviewLink?.draft || !currentReviewLink.importId || isAccepting) return;
    const draft = currentReviewLink.draft;
    setAcceptError('');
    setIsAccepting(true);
    try {
      const servingsRaw = (servingsEdits[currentReviewLink.id] ?? '').trim();
      const servings = servingsRaw === '' ? null : Number(servingsRaw);
      const patches = linePatches[currentReviewLink.id] ?? {};
      const ingredients = Object.entries(patches)
        .filter(([, patch]) => patch.quantity.trim() !== '' || patch.unit.trim() !== '')
        .map(([position, patch]) => ({
          position: Number(position),
          quantity: patch.quantity.trim() === '' ? null : Number(patch.quantity),
          unit: patch.unit.trim() === '' ? null : patch.unit.trim(),
        }));
      const result = await videoImportService.accept(currentReviewLink.importId, {
        servings: servings != null && Number.isFinite(servings) ? servings : null,
        ingredients,
      });
      setAccepted((prev) => [
        ...prev,
        {
          linkId: currentReviewLink.id,
          recipeId: result.recipeId,
          title: result.title,
          platform: currentReviewLink.platform,
          minutes: estimatedRecipeMinutes({
            totalTimeMinutes: draft.totalTimeMinutes,
            steps: draft.instructions,
          }),
          servings: draft.servings,
        },
      ]);
      advanceReview();
    } catch (caught) {
      setAcceptError(describeError(caught).message);
    } finally {
      setIsAccepting(false);
    }
  };

  /* ---------------- confirm -> grocery ---------------- */

  const removeAccepted = (linkId: string) =>
    // The recipe itself stays in the viewer's saved library (the backend has
    // no delete for imports); this only drops it from this import batch.
    setAccepted((prev) => prev.filter((recipe) => recipe.linkId !== linkId));

  const addAnotherRecipe = () => {
    setLinks([]);
    setUrlText('');
    setUrlError('');
    setPhase('link');
  };

  const startOver = () => {
    setLinks([]);
    setUrlText('');
    setUrlError('');
    setReviewIds([]);
    setReviewIndex(0);
    setAccepted([]);
    setServingsEdits({});
    setLinePatches({});
    setGrocery(null);
    setGroceryError('');
    setChecked([]);
    setInstacartNote(false);
    setPhase('link');
  };

  const loadGrocery = async (recipeIds: string[]) => {
    setIsLoadingGrocery(true);
    setGroceryError('');
    try {
      // The mobile pantry query does not select the canonical ingredient ids
      // yet, so the server cannot mark inPantry for this flow. The cross-check
      // below matches pantry item names against the grocery list instead.
      const result = await recipeService.groceryListFromRecipes({
        recipeIds,
        householdSize: Math.max(1, request.household.size),
        pantryItems: [],
      });
      setGrocery({ list: result.list, cost: result.cost });
    } catch (caught) {
      setGroceryError(describeError(caught).message);
    } finally {
      setIsLoadingGrocery(false);
    }
  };

  const continueToGrocery = () => {
    if (!canContinueToGrocery(accepted.map((recipe) => recipe.recipeId))) return;
    setPhase('pantry');
    void loadGrocery(accepted.map((recipe) => recipe.recipeId));
  };

  const addToMealPlan = () => {
    if (accepted.length === 0) return;
    clearSelectedRecipes();
    for (const recipe of accepted) toggleRecipe(recipe.recipeId);
    router.push('/meals/assign');
  };

  /* ---------------- own list ---------------- */

  const toggleChecked = (ingredientId: string) => {
    setChecked((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId]
    );
  };

  const printOwnList = async () => {
    if (!grocery || isPrinting) return;
    setPrintError('');
    setIsPrinting(true);
    try {
      await printAndShareGroceryList(acceptedTitles, grocery.list, checked);
    } catch (caught) {
      setPrintError(describeError(caught).message);
    } finally {
      setIsPrinting(false);
    }
  };

  /* ---------------- derived ---------------- */

  const pantryNames = useMemo(() => activeItems.map((item) => item.name), [activeItems]);

  const toBuy = useMemo(
    () =>
      (grocery?.list ?? [])
        .flatMap((section) => section.items)
        .filter((item) => !pantryHasItem(pantryNames, item.displayName)),
    [grocery, pantryNames]
  );
  const alreadyHave = useMemo(
    () =>
      (grocery?.list ?? [])
        .flatMap((section) => section.items)
        .filter((item) => pantryHasItem(pantryNames, item.displayName)),
    [grocery, pantryNames]
  );

  const acceptedTitles =
    accepted.length <= 2
      ? accepted.map((recipe) => recipe.title).join(' and ')
      : `${accepted.length} recipes`;

  const headerTitle =
    phase === 'link'
      ? 'Import from Social Media'
      : phase === 'review'
        ? 'Review Recipe'
        : phase === 'confirm'
          ? 'Import Recipes'
          : 'Grocery List';

  const handleBack = () => {
    if (phase === 'link') {
      if (isImporting) void cancelImport();
      else router.back();
    } else if (phase === 'review') {
      setPhase(accepted.length > 0 ? 'confirm' : 'link');
    } else if (phase === 'confirm') {
      addAnotherRecipe();
    } else if (phase === 'pantry') {
      setPhase('confirm');
    } else {
      setPhase('pantry');
    }
  };

  return (
    <ScrollScreen>
      <AppHeader title={headerTitle} onBack={handleBack} />
      <View style={styles.body}>
        {phase === 'link' ? (
          <LinkPhase
            urlText={urlText}
            onChangeUrl={(value) => {
              setUrlText(value);
              if (urlError) setUrlError('');
            }}
            urlError={urlError}
            currentPlatform={currentPlatform}
            canAdd={canAdd}
            onAdd={addLink}
            onPaste={pasteFromClipboard}
            pasteAvailable={getClipboard() !== null}
            links={links}
            isImporting={isImporting}
            onRemoveLink={removeLink}
            onImportAll={() => void startImportAll()}
            onCancelImport={() => void cancelImport()}
          />
        ) : null}

        {phase === 'review' && currentReviewLink?.draft ? (
          <ReviewPhase
            draft={currentReviewLink.draft}
            caption={`Recipe ${reviewIndex + 1} of ${reviewIds.length}`}
            servingsEdit={servingsEdits[currentReviewLink.id] ?? ''}
            onChangeServings={(value) =>
              setServingsEdits((prev) => ({ ...prev, [currentReviewLink.id]: value }))
            }
            linePatches={linePatches[currentReviewLink.id] ?? {}}
            onPatchLine={(position, patch) => setLinePatch(currentReviewLink.id, position, patch)}
            acceptError={acceptError}
            isAccepting={isAccepting}
            onAccept={() => void acceptCurrentDraft()}
            onDiscard={advanceReview}
          />
        ) : null}

        {phase === 'confirm' ? (
          <ConfirmPhase
            accepted={accepted}
            onRemove={removeAccepted}
            onAddAnother={addAnotherRecipe}
            onContinue={() => continueToGrocery()}
            onStartOver={startOver}
          />
        ) : null}

        {phase === 'pantry' ? (
          <PantryPhase
            title={acceptedTitles}
            isLoading={isLoadingGrocery}
            error={groceryError}
            cost={grocery?.cost ?? null}
            toBuyCount={toBuy.length}
            alreadyHaveNames={alreadyHave.map((item) => item.displayName)}
            toBuy={toBuy}
            onRetryGrocery={() => {
              if (accepted.length > 0) void loadGrocery(accepted.map((recipe) => recipe.recipeId));
            }}
            instacartNote={instacartNote}
            onInstacart={() => setInstacartNote(true)}
            onShopOwn={() => setPhase('ownList')}
            onAddToPlan={addToMealPlan}
          />
        ) : null}

        {phase === 'ownList' && grocery ? (
          <OwnListPhase
            title={acceptedTitles}
            sections={grocery.list}
            checked={checked}
            onToggle={toggleChecked}
            isPrinting={isPrinting}
            printError={printError}
            onPrint={() => void printOwnList()}
          />
        ) : null}
      </View>

      <ModalSheet visible={limitGate !== null} onClose={() => setLimitGate(null)}>
        {limitGate ? <AiLimitGate usage={limitGate} onClose={() => setLimitGate(null)} /> : null}
      </ModalSheet>
    </ScrollScreen>
  );
}

/* ---------------- Pure helpers ---------------- */

/**
 * Conservative pantry matching: the mobile pantry query does not select the
 * canonical ingredient ids yet, so the cross-check matches whole words against
 * pantry item names. "eggs" matches "2 large eggs" but not "egg whites".
 */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pantryHasItem(pantryNames: string[], displayName: string): boolean {
  const words = new Set(normalizeName(displayName).split(' '));
  return pantryNames.some((name) => {
    const needles = normalizeName(name).split(' ').filter(Boolean);
    return needles.length > 0 && needles.every((needle) => words.has(needle));
  });
}

/* ---------------- Phase components ---------------- */

function LinkPhase({
  urlText,
  onChangeUrl,
  urlError,
  currentPlatform,
  canAdd,
  onAdd,
  onPaste,
  pasteAvailable,
  links,
  isImporting,
  onRemoveLink,
  onImportAll,
  onCancelImport,
}: {
  urlText: string;
  onChangeUrl: (value: string) => void;
  urlError: string;
  currentPlatform: SocialPlatform | null;
  canAdd: boolean;
  onAdd: () => void;
  onPaste: () => void;
  pasteAvailable: boolean;
  links: QueuedLink[];
  isImporting: boolean;
  onRemoveLink: (id: string) => void;
  onImportAll: () => void;
  onCancelImport: () => void;
}) {
  return (
    <View style={styles.phase}>
      <View style={styles.heading}>
        <Text style={styles.headingTitle}>Import from Social Media</Text>
        <Text style={uiText.muted}>
          Add one or more video links — we&apos;ll extract each recipe for your meal plan.
        </Text>
      </View>

      <View style={styles.badgeRow}>
        {SOCIAL_PLATFORM_BADGES.map((platform) => (
          <View key={platform} style={styles.platformBadge}>
            <Text style={styles.platformBadgeText}>{SOCIAL_PLATFORM_LABEL[platform]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Paste a video link</Text>
        <View style={styles.inputRow}>
          <View
            style={[
              styles.urlField,
              currentPlatform ? styles.urlFieldDetected : null,
            ]}>
            <HiveIcon
              name="link"
              size={15}
              color={currentPlatform ? HiveColors.green : HiveColors.textSecondary}
            />
            <TextInput
              style={styles.urlInput}
              value={urlText}
              onChangeText={onChangeUrl}
              placeholder="Paste video URL here…"
              placeholderTextColor={HiveColors.placeholder}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isImporting}
            />
            {urlText.length > 0 && !isImporting ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear link"
                onPress={() => onChangeUrl('')}
                hitSlop={8}>
                <HiveIcon name="xCircle" size={18} color={HiveColors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add link"
            onPress={onAdd}
            disabled={!canAdd || isImporting}
            style={[styles.addButton, canAdd && !isImporting ? styles.addButtonActive : null]}>
            <Text style={[styles.addButtonText, canAdd && !isImporting ? styles.addButtonTextActive : null]}>
              Add
            </Text>
          </Pressable>
        </View>
        {currentPlatform && urlText.trim().length > 0 ? (
          <View style={styles.detectedRow}>
            <HiveIcon name="checkCircle" size={12} color={HiveColors.green} />
            <Text style={styles.detectedText}>{SOCIAL_PLATFORM_LABEL[currentPlatform]} link detected</Text>
          </View>
        ) : null}
        {urlError ? <Text style={styles.errorText}>{urlError}</Text> : null}
      </View>

      {pasteAvailable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paste from clipboard"
          onPress={onPaste}
          disabled={isImporting}
          style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}>
          <HiveIcon name="clipboard" size={14} color={HiveColors.green} />
          <Text style={styles.pasteButtonText}>Paste from Clipboard</Text>
        </Pressable>
      ) : null}

      {links.length > 0 ? (
        <View style={styles.queueBlock}>
          <Text style={styles.fieldLabel}>Links Added ({links.length})</Text>
          <View style={styles.queueList}>
            {links.map((link) => (
              <LinkRow key={link.id} link={link} isImporting={isImporting} onRemove={() => onRemoveLink(link.id)} />
            ))}
          </View>
        </View>
      ) : null}

      {links.length > 0 ? (
        <View style={styles.importBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isImporting ? 'Transcribing' : `Import ${links.length} recipes`}
            onPress={onImportAll}
            disabled={isImporting}
            style={[styles.importButton, isImporting ? styles.importButtonBusy : null]}>
            {isImporting ? (
              <ActivityIndicator size="small" color={HiveColors.white} />
            ) : (
              <HiveIcon name="play" size={16} color={HiveColors.white} />
            )}
            <Text style={styles.importButtonText}>
              {isImporting
                ? 'Transcribing…'
                : `Import ${links.length} Recipe${links.length === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
          {isImporting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel import"
              onPress={onCancelImport}
              style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LinkRow({
  link,
  isImporting,
  onRemove,
}: {
  link: QueuedLink;
  isImporting: boolean;
  onRemove: () => void;
}) {
  const accent = SOCIAL_PLATFORM_ACCENT[link.platform];
  return (
    <View style={[styles.linkRow, link.status === 'done' ? styles.linkRowDone : null]}>
      <View style={[styles.linkIcon, { backgroundColor: `${accent}1F` }]}>
        <HiveIcon name="link" size={14} color={accent} />
      </View>
      <View style={styles.linkText}>
        <Text style={[styles.linkPlatform, { color: accent }]}>{SOCIAL_PLATFORM_LABEL[link.platform]}</Text>
        <Text style={styles.linkUrl} numberOfLines={1}>
          {truncateDisplayUrl(link.url)}
        </Text>
        {link.status === 'importing' && link.importPhase ? (
          <Text style={uiText.small}>
            {link.importPhase === 'queued' ? 'Waiting in line…' : 'Transcribing…'}
          </Text>
        ) : null}
        {link.status === 'failed' && link.error ? (
          <Text style={styles.linkError}>{link.error}</Text>
        ) : null}
      </View>
      {link.status === 'importing' ? (
        <ActivityIndicator size="small" color={HiveColors.green} />
      ) : link.status === 'done' ? (
        <HiveIcon name="checkCircle" size={18} color={HiveColors.green} />
      ) : link.status === 'failed' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove failed link"
          onPress={onRemove}
          disabled={isImporting}
          hitSlop={8}>
          <HiveIcon name="xCircle" size={20} color={HiveColors.danger} />
        </Pressable>
      ) : isImporting ? (
        <Text style={styles.queuedLabel}>Queued</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove link"
          onPress={onRemove}
          hitSlop={8}>
          <HiveIcon name="xCircle" size={20} color="rgba(0,0,0,0.25)" />
        </Pressable>
      )}
    </View>
  );
}

function ReviewPhase({
  draft,
  caption,
  servingsEdit,
  onChangeServings,
  linePatches,
  onPatchLine,
  acceptError,
  isAccepting,
  onAccept,
  onDiscard,
}: {
  draft: Recipe;
  caption: string;
  servingsEdit: string;
  onChangeServings: (value: string) => void;
  linePatches: Record<number, { quantity: string; unit: string }>;
  onPatchLine: (position: number, patch: Partial<{ quantity: string; unit: string }>) => void;
  acceptError: string;
  isAccepting: boolean;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={styles.phase}>
      <Text style={styles.fieldLabel}>{caption}</Text>
      <Text style={uiText.subtitle}>Here&apos;s what Penny found</Text>
      <Text style={[uiText.muted, styles.centerText]}>
        Check it over — fill in anything the video didn&apos;t say out loud.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.recipeTitle}>{draft.title}</Text>
        {draft.missingInformation.length > 0 ? (
          <View style={styles.missingBox}>
            <Text style={styles.missingTitle}>The video didn&apos;t mention:</Text>
            {draft.missingInformation.map((note) => (
              <Text key={note} style={uiText.small}>
                - {note}
              </Text>
            ))}
          </View>
        ) : null}
        <AppTextField
          label="Servings"
          value={servingsEdit}
          onChangeText={onChangeServings}
          placeholder={draft.servings != null ? String(draft.servings) : 'Not stated'}
          keyboardType="numeric"
        />
      </Card>

      <Text style={uiText.subtitle}>Ingredients</Text>
      {draft.ingredients.map((line) => (
        <IngredientEditRow
          key={line.position}
          line={line}
          patch={linePatches[line.position]}
          onPatch={(patch) => onPatchLine(line.position, patch)}
        />
      ))}

      <Text style={uiText.subtitle}>Steps</Text>
      {draft.instructions.map((step) => (
        <View key={step.step} style={styles.stepRow}>
          <Text style={styles.stepNumber}>{step.step}</Text>
          <Text style={[uiText.body, styles.flexOne]}>{step.text}</Text>
        </View>
      ))}

      {acceptError ? <Text style={styles.errorText}>{acceptError}</Text> : null}
      <AppButton title={isAccepting ? 'Saving…' : 'Looks good — save recipe'} onPress={onAccept} disabled={isAccepting} />
      <AppButton title="Discard" variant="plain" onPress={onDiscard} />
    </View>
  );
}

function IngredientEditRow({
  line,
  patch,
  onPatch,
}: {
  line: IngredientLine;
  patch: { quantity: string; unit: string } | undefined;
  onPatch: (patch: Partial<{ quantity: string; unit: string }>) => void;
}) {
  const needsAmount = line.quantity == null;
  return (
    <View style={styles.ingredientRow}>
      <View style={styles.flexOne}>
        <Text style={uiText.body}>{line.displayName ?? line.rawText}</Text>
        {line.quantity != null ? (
          <Text style={uiText.small}>
            {line.quantity} {line.unit ?? ''}
          </Text>
        ) : (
          <Text style={styles.missingLine}>
            {line.missingInformation ?? 'Amount not stated — add it if you know it.'}
          </Text>
        )}
      </View>
      {needsAmount ? (
        <View style={styles.amountEdits}>
          <AppTextField label="Qty" value={patch?.quantity ?? ''} onChangeText={(v) => onPatch({ quantity: v })} keyboardType="numeric" />
          <AppTextField label="Unit" value={patch?.unit ?? ''} onChangeText={(v) => onPatch({ unit: v })} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Confirmation step — the user approves the REAL transcribed recipes before
 * anything moves forward. Cards show the backend draft title, platform, and
 * real time (or servings when the backend gave no time).
 */
function ConfirmPhase({
  accepted,
  onRemove,
  onAddAnother,
  onContinue,
  onStartOver,
}: {
  accepted: AcceptedRecipe[];
  onRemove: (linkId: string) => void;
  onAddAnother: () => void;
  onContinue: () => void;
  onStartOver: () => void;
}) {
  return (
    <View style={styles.phase}>
      <View style={styles.confirmHeading}>
        <HiveIcon name="checkCircle" size={16} color={HiveColors.green} />
        <Text style={styles.confirmTitle}>Are these all the recipes you want?</Text>
      </View>
      <Text style={uiText.muted}>Remove any you don&apos;t want, or add more links before continuing.</Text>

      <View style={styles.queueList}>
        {accepted.map((recipe) => {
          const accent = SOCIAL_PLATFORM_ACCENT[recipe.platform];
          return (
            <View key={recipe.linkId} style={[styles.linkRow, styles.linkRowDone]}>
              <View style={[styles.recipeThumb, { backgroundColor: `${accent}1F` }]}>
                <HiveIcon name="fork" size={20} color={`${accent}80`} />
              </View>
              <View style={styles.linkText}>
                <Text style={styles.recipeCardTitle}>{recipe.title}</Text>
                <View style={styles.recipeMeta}>
                  <Text style={[styles.linkPlatform, { color: accent }]}>
                    {SOCIAL_PLATFORM_LABEL[recipe.platform]}
                  </Text>
                  {recipe.minutes != null ? (
                    <View style={styles.metaInline}>
                      <HiveIcon name="clock" size={11} color={HiveColors.textSecondary} />
                      <Text style={uiText.small}>~{recipe.minutes} min</Text>
                    </View>
                  ) : recipe.servings != null ? (
                    <Text style={uiText.small}>Serves {recipe.servings}</Text>
                  ) : null}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${recipe.title}`}
                onPress={() => onRemove(recipe.linkId)}
                hitSlop={8}>
                <HiveIcon name="xCircle" size={20} color="rgba(0,0,0,0.25)" />
              </Pressable>
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add another recipe"
        onPress={onAddAnother}
        style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}>
        <HiveIcon name="plus" size={14} color={HiveColors.green} />
        <Text style={styles.pasteButtonText}>Add Another Recipe</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue to grocery list"
        onPress={onContinue}
        disabled={!canContinueToGrocery(accepted.map((recipe) => recipe.recipeId))}
        style={[
          styles.continueButton,
          !canContinueToGrocery(accepted.map((recipe) => recipe.recipeId)) ? styles.continueButtonDisabled : null,
        ]}>
        <Text style={styles.continueButtonText}>Yes — Continue to Grocery List →</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start over"
        onPress={onStartOver}
        style={({ pressed }) => [styles.startOverButton, pressed && styles.pressed]}>
        <Text style={styles.startOverText}>Start Over</Text>
      </Pressable>
    </View>
  );
}

function PantryPhase({
  title,
  isLoading,
  error,
  cost,
  toBuyCount,
  alreadyHaveNames,
  toBuy,
  onRetryGrocery,
  instacartNote,
  onInstacart,
  onShopOwn,
  onAddToPlan,
}: {
  title: string;
  isLoading: boolean;
  error: string;
  cost: CostRange | null;
  toBuyCount: number;
  alreadyHaveNames: (string | null)[];
  toBuy: GroceryItem[];
  onRetryGrocery: () => void;
  instacartNote: boolean;
  onInstacart: () => void;
  onShopOwn: () => void;
  onAddToPlan: () => void;
}) {
  if (isLoading) {
    return (
      <View style={styles.phase}>
        <ActivityIndicator size="large" color={HiveColors.green} />
        <Text style={uiText.muted}>Checking your pantry and pricing…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.phase}>
        <Text style={uiText.subtitle}>We couldn&apos;t build the grocery list</Text>
        <Text style={[uiText.muted, styles.centerText]}>{error}</Text>
        <AppButton title="Try again" onPress={onRetryGrocery} />
      </View>
    );
  }
  const haveNames = alreadyHaveNames.filter((name): name is string => !!name);
  return (
    <View style={styles.phase}>
      <Text style={uiText.subtitle}>{title}</Text>

      {haveNames.length > 0 ? (
        <Card style={styles.haveCard}>
          <View style={styles.haveRow}>
            <HiveIcon name="check" size={16} color={HiveColors.green} />
            <Text style={uiText.body}>You already have {joinNames(haveNames)} — no need to buy.</Text>
          </View>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={uiText.small}>Estimated total</Text>
        <Text style={styles.costRange}>
          {cost ? `$${cost.low.toFixed(2)} – $${cost.high.toFixed(2)}` : '—'}
        </Text>
        <Text style={uiText.small}>{PRICING_NOTICE_SHORT}</Text>
      </Card>

      <Text style={uiText.subtitle}>
        {toBuyCount} {toBuyCount === 1 ? 'item' : 'items'} to buy
      </Text>
      {toBuy.slice(0, 8).map((item) => (
        <View key={item.ingredientId} style={styles.groceryRow}>
          <Text style={[uiText.body, styles.flexOne]}>{item.displayName}</Text>
          <Text style={uiText.small}>Estimated ${item.estimatedPrice.toFixed(2)}</Text>
        </View>
      ))}
      {toBuyCount > 8 ? (
        <Text style={uiText.small}>…and {toBuyCount - 8} more on the full list.</Text>
      ) : null}
      <Text style={uiText.small}>{PRICING_NOTICE}</Text>

      <Text style={uiText.subtitle}>How do you want to shop?</Text>
      <AppButton title="Add to my meal plan" onPress={onAddToPlan} />
      <AppButton title="Shop with Instacart" variant="secondary" onPress={onInstacart} />
      {instacartNote ? (
        <Card style={styles.card}>
          <Text style={uiText.body}>
            Instacart checkout is built from a full meal plan — add these recipes to your plan first,
            then send the whole list to Instacart from there.
          </Text>
        </Card>
      ) : null}
      <AppButton title="Shop on my own" variant="secondary" onPress={onShopOwn} />
    </View>
  );
}

function OwnListPhase({
  title,
  sections,
  checked,
  onToggle,
  isPrinting,
  printError,
  onPrint,
}: {
  title: string;
  sections: GroceryList;
  checked: string[];
  onToggle: (ingredientId: string) => void;
  isPrinting: boolean;
  printError: string;
  onPrint: () => void;
}) {
  const items = sections.flatMap((section) => section.items).filter((item) => !item.inPantry);
  return (
    <View style={styles.phase}>
      <Text style={uiText.subtitle}>{title} — grocery list</Text>
      <Text style={uiText.small}>{PRICING_NOTICE_SHORT}</Text>
      {sections.map((section) => {
        const buyable = section.items.filter((item) => !item.inPantry);
        if (buyable.length === 0) return null;
        return (
          <View key={section.aisleLabel} style={styles.section}>
            <Text style={styles.aisleTitle}>{section.aisleLabel}</Text>
            {buyable.map((item) => {
              const isChecked = checked.includes(item.ingredientId);
              return (
                <Pressable
                  key={item.ingredientId}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={item.displayName}
                  onPress={() => onToggle(item.ingredientId)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                    {isChecked ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={[uiText.body, isChecked && styles.checkedText]}>{item.displayName}</Text>
                    <Text style={uiText.small}>
                      {item.packageLabel ?? `${item.neededQty} ${item.unit}`}
                    </Text>
                  </View>
                  <Text style={uiText.body}>${item.estimatedPrice.toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
      {items.length === 0 ? (
        <Text style={[uiText.muted, styles.centerText]}>
          Everything for these recipes is already in your pantry.
        </Text>
      ) : null}
      {printError ? <Text style={styles.errorText}>{printError}</Text> : null}
      <AppButton
        title={isPrinting ? 'Preparing PDF…' : 'Print / save as PDF'}
        onPress={onPrint}
        disabled={isPrinting || items.length === 0}
      />
      <Text style={uiText.small}>{PRICING_NOTICE}</Text>
    </View>
  );
}

/* ---------------- helpers ---------------- */

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: Spacing.three },
  phase: { gap: Spacing.three, alignItems: 'stretch', paddingBottom: Spacing.four },
  centerText: { textAlign: 'center' },
  flexOne: { flex: 1 },
  pressed: { opacity: 0.7 },
  card: { gap: Spacing.two },

  // Link phase
  heading: { gap: 6 },
  headingTitle: { color: HiveColors.text, fontSize: 22, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 8 },
  platformBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: HiveColors.card,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  platformBadgeText: { color: HiveColors.textSecondary, fontSize: 12, fontWeight: '600' },
  fieldBlock: { gap: 8 },
  fieldLabel: { color: HiveColors.textSecondary, fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: 8 },
  urlField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  urlFieldDetected: { borderColor: 'rgba(47,158,68,0.5)' },
  urlInput: { flex: 1, color: HiveColors.text, fontSize: 15 },
  addButton: {
    width: 56,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: HiveColors.card,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  addButtonActive: { backgroundColor: HiveColors.green, borderColor: HiveColors.green },
  addButtonText: { color: HiveColors.textSecondary, fontSize: 14, fontWeight: '600' },
  addButtonTextActive: { color: HiveColors.white },
  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detectedText: { color: HiveColors.green, fontSize: 12 },
  errorText: { color: HiveColors.danger, fontSize: 14 },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: HiveColors.greenLight,
  },
  pasteButtonText: { color: HiveColors.green, fontSize: 14, fontWeight: '500' },

  // Link queue
  queueBlock: { gap: 8 },
  queueList: { gap: 8 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  linkRowDone: { borderColor: 'rgba(47,158,68,0.3)' },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { flex: 1, gap: 2 },
  linkPlatform: { fontSize: 12, fontWeight: '600' },
  linkUrl: { color: HiveColors.textSecondary, fontSize: 12 },
  linkError: { color: HiveColors.danger, fontSize: 12 },
  queuedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: HiveColors.textSecondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: HiveColors.card,
    overflow: 'hidden',
  },

  // Import button
  importBlock: { gap: Spacing.two, alignItems: 'stretch' },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: IMPORT_PINK,
  },
  importButtonBusy: { opacity: 0.9 },
  importButtonText: { color: HiveColors.white, fontSize: 16, fontWeight: '600' },
  cancelLink: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  cancelLinkText: { color: HiveColors.textSecondary, fontSize: 14, fontWeight: '500' },

  // Review
  recipeTitle: { color: HiveColors.text, fontSize: 20, fontWeight: '700' },
  missingBox: {
    gap: 4,
    padding: Spacing.three,
    borderRadius: Radii.md,
    backgroundColor: HiveColors.warningBg,
  },
  missingTitle: { color: HiveColors.text, fontSize: 13, fontWeight: '700' },
  missingLine: { color: HiveColors.warningText, fontSize: 12 },
  stepRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: HiveColors.greenLight,
    color: HiveColors.green,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 26,
  },
  ingredientRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  amountEdits: { flexDirection: 'row', gap: Spacing.two, flex: 1 },

  // Confirm
  confirmHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmTitle: { color: HiveColors.text, fontSize: 17, fontWeight: '700' },
  recipeThumb: {
    width: 50,
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCardTitle: { color: HiveColors.text, fontSize: 14, fontWeight: '600' },
  recipeMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  continueButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: HiveColors.green,
  },
  continueButtonDisabled: { opacity: 0.5 },
  continueButtonText: { color: HiveColors.white, fontSize: 16, fontWeight: '600' },
  startOverButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
  },
  startOverText: { color: HiveColors.textSecondary, fontSize: 14, fontWeight: '500' },

  // Pantry / grocery
  haveCard: { backgroundColor: HiveColors.greenLight, borderColor: HiveColors.greenLight },
  haveRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  costRange: { color: HiveColors.text, fontSize: 26, fontWeight: '800' },
  groceryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HiveColors.border,
  },

  // Own list
  section: { gap: Spacing.one },
  aisleTitle: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 56,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radii.sm,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: HiveColors.green, borderColor: HiveColors.green },
  checkedText: { textDecorationLine: 'line-through', color: HiveColors.textSecondary },
});
