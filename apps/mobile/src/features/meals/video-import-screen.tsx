/**
 * Video import flow (Audit Section 4).
 *
 * Paste a TikTok, Instagram Reel, or YouTube link -- Penny transcribes it into
 * a recipe -- confirm/edit the draft -- pantry cross-check ("You already have
 * eggs...") -- Kroger estimated pricing (always labeled Estimated) -- Instacart
 * vs own list -- planner.
 *
 * The import itself runs on the backend (`video-import-service`); this screen
 * renders each phase and never invents a recipe. Prices shown are estimates --
 * the full pricing notice travels with every price.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  Card,
  AppTextField,
  HiveIcon,
  ModalSheet,
  PennyImage,
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
  type VideoImportStatus,
} from '@/features/meals/video-import-service';
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

// TODO(Marcos): replace with the Penny-cooking asset from the design ZIP --
// penny-money.png is a stand-in so the layout matches the approved flow.
const pennyCookingSource = require('@/assets/images/hive/penny-money.png');

type Phase = 'link' | 'working' | 'review' | 'pantry' | 'ownList';

const WORKING_MESSAGES = [
  'Fetching the video...',
  'Transcribing what Penny hears...',
  'Finding the recipe...',
  'Resolving the ingredients...',
];

const MESSAGE_INTERVAL_MS = 2800;

export function VideoImportScreen() {
  const router = useRouter();
  const { request, clearSelectedRecipes, toggleRecipe } = useMealPlan();
  const { activeItems } = usePantry();

  const [phase, setPhase] = useState<Phase>('link');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const [importId, setImportId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<VideoImportStatus>('queued');
  const [importError, setImportError] = useState('');
  const [messageIndex, setMessageIndex] = useState(0);

  const [draft, setDraft] = useState<Recipe | null>(null);
  const [servingsEdit, setServingsEdit] = useState('');
  const [linePatches, setLinePatches] = useState<Record<number, { quantity: string; unit: string }>>({});
  const [acceptError, setAcceptError] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);

  const [acceptedRecipeId, setAcceptedRecipeId] = useState<string | null>(null);
  const [acceptedTitle, setAcceptedTitle] = useState('');
  const [grocery, setGrocery] = useState<{ list: GroceryList; cost: CostRange } | null>(null);
  const [groceryError, setGroceryError] = useState('');
  const [isLoadingGrocery, setIsLoadingGrocery] = useState(false);

  const [checked, setChecked] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [instacartNote, setInstacartNote] = useState(false);

  const [limitGate, setLimitGate] = useState<AiUsage | null>(null);

  const pollAbort = useRef<AbortController | null>(null);

  // Rotating status lines while the import runs.
  useEffect(() => {
    if (phase !== 'working') return;
    const timer = setInterval(
      () => setMessageIndex((current) => (current + 1) % WORKING_MESSAGES.length),
      MESSAGE_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [phase]);

  // Poll the import once it starts.
  useEffect(() => {
    if (phase !== 'working' || !importId) return;
    const controller = new AbortController();
    pollAbort.current = controller;
    let cancelled = false;

    void (async () => {
      try {
        const done = await videoImportService.poll(importId, {
          signal: controller.signal,
          onStatus: (status) => {
            if (!cancelled) setImportStatus(status);
          },
        });
        if (cancelled) return;
        if (done.status === 'succeeded' && done.draft) {
          setDraft(done.draft);
          setServingsEdit(done.draft.servings != null ? String(done.draft.servings) : '');
          // The AI work succeeded -- this is what consumes the allowance.
          await recordAiUsage('video_import');
          setPhase('review');
        } else if (done.status === 'failed') {
          setImportError(videoImportFailureMessage(done.errorCode, done.errorMessage));
        } else if (done.status === 'cancelled') {
          setPhase('link');
        }
      } catch (caught) {
        if (!cancelled) setImportError(describeError(caught).message);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [phase, importId]);

  const startImport = async () => {
    setUrlError('');
    setImportError('');
    if (!looksLikeVideoLink(url)) {
      setUrlError('Paste a full video link, starting with https://');
      return;
    }
    // The gate fires AT the limit -- this check runs before any AI work.
    if (!(await hasAiUsageRemaining('video_import'))) {
      setLimitGate(await getAiUsage('video_import'));
      return;
    }
    try {
      const started = await videoImportService.start(url);
      setImportId(started.importId);
      setImportStatus('queued');
      setMessageIndex(0);
      setPhase('working');
    } catch (caught) {
      setUrlError(describeError(caught).message);
    }
  };

  const cancelImport = async () => {
    pollAbort.current?.abort();
    if (importId) {
      try {
        await videoImportService.cancel(importId);
      } catch {
        // Best-effort: the import will finish or time out server-side.
      }
    }
    setImportId(null);
    setPhase('link');
  };

  const setLinePatch = (position: number, patch: Partial<{ quantity: string; unit: string }>) => {
    setLinePatches((current) => ({
      ...current,
      [position]: { ...(current[position] ?? { quantity: '', unit: '' }), ...patch },
    }));
  };

  const acceptDraft = async () => {
    if (!draft || !importId || isAccepting) return;
    setAcceptError('');
    setIsAccepting(true);
    try {
      const servings = servingsEdit.trim() === '' ? null : Number(servingsEdit);
      const ingredients = Object.entries(linePatches)
        .filter(([, patch]) => patch.quantity.trim() !== '' || patch.unit.trim() !== '')
        .map(([position, patch]) => ({
          position: Number(position),
          quantity: patch.quantity.trim() === '' ? null : Number(patch.quantity),
          unit: patch.unit.trim() === '' ? null : patch.unit.trim(),
        }));
      const accepted = await videoImportService.accept(importId, {
        servings: servings != null && Number.isFinite(servings) ? servings : null,
        ingredients,
      });
      setAcceptedRecipeId(accepted.recipeId);
      setAcceptedTitle(accepted.title);
      await loadGrocery(accepted.recipeId);
      setPhase('pantry');
    } catch (caught) {
      setAcceptError(describeError(caught).message);
    } finally {
      setIsAccepting(false);
    }
  };

  const loadGrocery = async (recipeId: string) => {
    setIsLoadingGrocery(true);
    setGroceryError('');
    try {
      // The mobile pantry query does not select the canonical ingredient ids
      // yet (pantry files are outside this slice), so the server cannot mark
      // inPantry for this flow. The cross-check below matches pantry item
      // names against the grocery list instead. TODO: wire ingredientId
      // through the pantry query and pass real ids here.
      const result = await recipeService.groceryListFromRecipes({
        recipeIds: [recipeId],
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

  const addToMealPlan = () => {
    if (!acceptedRecipeId) return;
    clearSelectedRecipes();
    toggleRecipe(acceptedRecipeId);
    router.push('/meals/assign');
  };

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
      await printAndShareGroceryList(acceptedTitle, grocery.list, checked);
    } catch (caught) {
      setPrintError(describeError(caught).message);
    } finally {
      setIsPrinting(false);
    }
  };

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

  return (
    <ScrollScreen>
      <AppHeader
        title="Import from video"
        onBack={() => {
          if (phase === 'working') void cancelImport();
          else router.back();
        }}
      />
      <View style={styles.body}>
        {phase === 'link' ? (
          <LinkPhase url={url} onChangeUrl={setUrl} urlError={urlError} onStart={() => void startImport()} />
        ) : null}

        {phase === 'working' ? (
          <WorkingPhase
            status={importStatus}
            message={WORKING_MESSAGES[messageIndex] ?? 'Working...'}
            error={importError}
            onCancel={() => void cancelImport()}
            onRetry={() => {
              setImportError('');
              setPhase('link');
            }}
          />
        ) : null}

        {phase === 'review' && draft ? (
          <ReviewPhase
            draft={draft}
            servingsEdit={servingsEdit}
            onChangeServings={setServingsEdit}
            linePatches={linePatches}
            onPatchLine={setLinePatch}
            acceptError={acceptError}
            isAccepting={isAccepting}
            onAccept={() => void acceptDraft()}
            onDiscard={() => {
              setDraft(null);
              setLinePatches({});
              setPhase('link');
            }}
          />
        ) : null}

        {phase === 'pantry' ? (
          <PantryPhase
            title={acceptedTitle}
            isLoading={isLoadingGrocery}
            error={groceryError}
            cost={grocery?.cost ?? null}
            toBuyCount={toBuy.length}
            alreadyHaveNames={alreadyHave.map((item) => item.displayName)}
            toBuy={toBuy}
            onRetryGrocery={() => {
              if (acceptedRecipeId) void loadGrocery(acceptedRecipeId);
            }}
            instacartNote={instacartNote}
            onInstacart={() => setInstacartNote(true)}
            onShopOwn={() => setPhase('ownList')}
            onAddToPlan={addToMealPlan}
          />
        ) : null}

        {phase === 'ownList' && grocery ? (
          <OwnListPhase
            title={acceptedTitle}
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
 * canonical ingredient ids yet (pantry files are outside this slice), so the
 * cross-check matches whole words against pantry item names. "eggs" matches
 * "2 large eggs" but not "egg whites".
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
  url,
  onChangeUrl,
  urlError,
  onStart,
}: {
  url: string;
  onChangeUrl: (value: string) => void;
  urlError: string;
  onStart: () => void;
}) {
  return (
    <View style={styles.phase}>
      <PennyImage source={pennyCookingSource} size={96} />
      <Text style={uiText.subtitle}>Turn a video into a recipe</Text>
      <Text style={[uiText.muted, styles.centerText]}>
        Paste a TikTok, Instagram Reel, or YouTube link -- we&apos;ll transcribe it into a recipe.
      </Text>
      <AppTextField
        label="Video link"
        value={url}
        onChangeText={onChangeUrl}
        placeholder="https://..."
        keyboardType="url"
        autoCapitalize="none"
      />
      {urlError ? <Text style={styles.errorText}>{urlError}</Text> : null}
      <AppButton title="Import recipe" onPress={onStart} disabled={url.trim().length === 0} />
      <Text style={[uiText.small, styles.centerText]}>
        Penny watches the video and writes down the ingredients and steps she finds.
      </Text>
    </View>
  );
}

function WorkingPhase({
  status,
  message,
  error,
  onCancel,
  onRetry,
}: {
  status: VideoImportStatus;
  message: string;
  error: string;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <View style={styles.phase}>
        <Text style={uiText.subtitle}>We couldn&apos;t import that video</Text>
        <Text style={[uiText.muted, styles.centerText]}>{error}</Text>
        <AppButton title="Try another link" onPress={onRetry} />
      </View>
    );
  }
  return (
    <View style={styles.phase}>
      <PennyImage source={pennyCookingSource} size={110} />
      <Text style={uiText.subtitle}>Let Penny cook for a minute!</Text>
      <ActivityIndicator size="large" color={HiveColors.green} />
      <Text style={[uiText.body, styles.centerText]}>{message}</Text>
      <Text style={uiText.small}>
        {status === 'queued' ? 'Waiting in line...' : 'Working on your video...'}
      </Text>
      <AppButton title="Cancel" variant="plain" onPress={onCancel} />
    </View>
  );
}

function ReviewPhase({
  draft,
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
      <Text style={uiText.subtitle}>Here&apos;s what Penny found</Text>
      <Text style={[uiText.muted, styles.centerText]}>
        Check it over -- fill in anything the video didn&apos;t say out loud.
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
      <AppButton title={isAccepting ? 'Saving...' : 'Looks good -- save recipe'} onPress={onAccept} disabled={isAccepting} />
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
            {line.missingInformation ?? 'Amount not stated -- add it if you know it.'}
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
        <Text style={uiText.muted}>Checking your pantry and pricing...</Text>
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
            <Text style={uiText.body}>You already have {joinNames(haveNames)} -- no need to buy.</Text>
          </View>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={uiText.small}>Estimated total</Text>
        <Text style={styles.costRange}>
          {cost ? `$${cost.low.toFixed(2)} - $${cost.high.toFixed(2)}` : '--'}
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
        <Text style={uiText.small}>...and {toBuyCount - 8} more on the full list.</Text>
      ) : null}
      <Text style={uiText.small}>{PRICING_NOTICE}</Text>

      <Text style={uiText.subtitle}>How do you want to shop?</Text>
      <AppButton title="Add to my meal plan" onPress={onAddToPlan} />
      <AppButton title="Shop with Instacart" variant="secondary" onPress={onInstacart} />
      {instacartNote ? (
        <Card style={styles.card}>
          <Text style={uiText.body}>
            Instacart checkout is built from a full meal plan -- add this recipe to your plan first,
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
      <Text style={uiText.subtitle}>{title} -- grocery list</Text>
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
          Everything for this recipe is already in your pantry.
        </Text>
      ) : null}
      {printError ? <Text style={styles.errorText}>{printError}</Text> : null}
      <AppButton
        title={isPrinting ? 'Preparing PDF...' : 'Print / save as PDF'}
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
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  phase: { gap: Spacing.three, alignItems: 'stretch', paddingBottom: Spacing.four },
  centerText: { textAlign: 'center' },
  flexOne: { flex: 1 },
  card: { gap: Spacing.two },
  errorText: { color: HiveColors.danger, fontSize: 14, textAlign: 'center' },
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
  pressed: { opacity: 0.7 },
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
