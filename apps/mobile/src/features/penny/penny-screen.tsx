// The Penny tab — rebuilt from Marcos's SwiftUI HiveAIView
// (12_-_HiveAIView__Penny_chat.swift) plus the approved Penny screenshot.
//
// Everything Penny says comes from the backend through
// features/penny/penny-service. The app holds no model, no prompt and no
// provider key. Safety rules are enforced server-side (model instructions +
// output guard); the client adds three pre-send checks it can do honestly:
// the SSN block (never transmit a Social Security number), the scope
// redirect (clearly out-of-scope questions get a graceful local reply), and
// the paywall gate (60 free turns/month on Hive Free, with safety-critical application
// help always exempt). If the backend is unreachable, the chat says so
// honestly — it never fakes a reply.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AppButton,
  Card,
  HiveIcon,
  ModalSheet,
  PennyImage,
  uiText,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import {
  PENNY_DISCLAIMER,
  pennyService,
  type PennyCitation,
  type PennyProposedAction,
} from '@/features/penny/penny-service';
import {
  consumePennyContext,
  PENNY_CONTEXT_LABELS,
  subscribePennyContext,
  type PennyScreenContext,
} from '@/features/penny/penny-context';
import {
  classifyPennyScope,
  containsSsn,
  isApplicationSafetyMessage,
  PENNY_SCOPE_REDIRECT,
  SSN_WARNING,
} from '@/features/penny/penny-guardrails';
import { getPennyUsage, hasPennyMessagesRemaining, recordPennyMessage } from '@/features/penny/penny-limits';
import { ApiError, describeError } from '@/services/api-error';
import { useAppState } from '@/state/app-state';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { FLOATING_TAB_BAR_HEIGHT } from '@/components/hive-navigation';

type ChatMessage = {
  id: string;
  text: string;
  isUser: boolean;
  /** Local send/arrival time; rendered as a small timestamp under the bubble. */
  at: number;
  citations?: PennyCitation[];
  proposedAction?: PennyProposedAction;
  actionConfirmed?: boolean;
};

const pennySource = require('@/assets/images/hive/penny.png');
const pennyChatAvatarSource = require('@/assets/images/hive/penny-chat-avatar.png');

type SuggestionAction =
  | { kind: 'tab'; tab: number }
  | { kind: 'route'; route: 'benefitsState' | 'cookWhatIHave' | 'addPantry' }
  | { kind: 'seed'; text: string };

type Suggestion = {
  icon: 'map' | 'doc' | 'fork' | 'plus' | 'bolt' | 'chat';
  title: string;
  tint: string;
  action: SuggestionAction;
};

// Matches the Swift suggestion cards (icon, title, tint).
const SUGGESTIONS: Suggestion[] = [
  { icon: 'map', title: 'Find resources near me', tint: '#2E7D32', action: { kind: 'seed', text: 'Find resources near me' } },
  { icon: 'doc', title: 'Start a benefits application', tint: '#472EAD', action: { kind: 'seed', text: 'I want to start a benefits application' } },
  { icon: 'fork', title: 'Create a meal from my pantry', tint: '#D98C0D', action: { kind: 'seed', text: 'Create a meal from my pantry' } },
  { icon: 'plus', title: 'Add items to my pantry', tint: '#D9772A', action: { kind: 'seed', text: 'I want to add items to my pantry' } },
  { icon: 'bolt', title: 'Help lower my utility bill', tint: '#0061EB', action: { kind: 'seed', text: 'Help lower my utility bill' } },
  { icon: 'chat', title: 'What can Help The Hive do?', tint: '#00857A', action: { kind: 'seed', text: 'What can Help The Hive do?' } },
];

function formatTimestamp(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Three-dot typing indicator, rendered on the left while Penny responds. */
function TypingIndicator() {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const dotOpacity = (index: number) =>
    progress.interpolate({
      inputRange: [index * 0.25, index * 0.25 + 0.25, index * 0.25 + 0.5, 1],
      outputRange: [0.25, 1, 0.25, 0.25],
      extrapolate: 'clamp',
    });

  return (
    <View style={styles.pennyRow} accessibilityLabel="Penny is typing">
      <PennyImage source={pennySource} size={28} />
      <View style={[styles.bubble, styles.bubblePenny, styles.typingRow]}>
        {[0, 1, 2].map((index) => (
          <Animated.View key={index} style={[styles.typingDot, { opacity: dotOpacity(index) }]} />
        ))}
      </View>
    </View>
  );
}

export function PennyScreen({ nav, context: propContext }: { nav: Navigation; context?: PennyScreenContext }) {
  const app = useAppState();
  const [initialContext] = useState<PennyScreenContext | null>(() => propContext ?? consumePennyContext());
  const [pennyContext, setPennyContext] = useState<PennyScreenContext | null>(initialContext);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState(initialContext?.suggestedOpener ?? '');
  const [isTyping, setIsTyping] = useState(false);
  const [sendError, setSendError] = useState('');
  const [inlineWarning, setInlineWarning] = useState('');
  const [micNote, setMicNote] = useState(false);
  const [messagesRemaining, setMessagesRemaining] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  // Monotonic local id suffix for optimistic messages (no Date.now: the
  // React Compiler's purity rule forbids impure calls in the render scope,
  // and a counter is collision-free within a session).
  const messageSeq = useRef(0);
  const nextMessageStamp = () => {
    messageSeq.current += 1;
    return messageSeq.current;
  };

  // Warm arrivals: another screen set context while Penny was already open.
  useEffect(() => {
    const unsubscribe = subscribePennyContext((context) => {
      setPennyContext(context);
      if (context.suggestedOpener) {
        setMessageText((current) => current || context.suggestedOpener || '');
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, isTyping]);

  useEffect(() => {
    let cancelled = false;
    void getPennyUsage().then((usage) => {
      if (!cancelled) setMessagesRemaining(usage.remaining);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSuggestion(suggestion: Suggestion) {
    const { action } = suggestion;
    if (action.kind === 'tab') {
      app.setSelectedTab(action.tab);
      return;
    }
    if (action.kind === 'route') {
      nav.push(action.route);
      return;
    }
    // Tapping a suggestion sends it to Penny straight away — Penny figures
    // out the intent and points the user in the right direction.
    void sendMessage(action.text);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    // SSN guard: block the send; never transmit.
    if (containsSsn(trimmed)) {
      setInlineWarning(SSN_WARNING);
      return;
    }
    setInlineWarning('');
    setSendError('');

    // Scope: graceful local redirect — no backend call, no usage consumed.
    if (classifyPennyScope(trimmed) === 'out-of-scope') {
      const stamp = nextMessageStamp();
      // react-hooks/purity false positive: sendMessage only runs from event
      // handlers (composer submit, suggestion tap), never during render.
      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();
      setMessages((current) => [
        ...current,
        { id: `u-${stamp}`, text: trimmed, isUser: true, at: now },
        { id: `p-${stamp}`, text: PENNY_SCOPE_REDIRECT, isUser: false, at: now },
      ]);
      setMessageText('');
      return;
    }

    // Paywall gate: 60 free turns/month on Hive Free. Safety-critical help
    // finishing an existing government application is never blocked.
    if (!isApplicationSafetyMessage(trimmed, pennyContext) && !(await hasPennyMessagesRemaining())) {
      setShowPaywall(true);
      return;
    }

    // react-hooks/purity false positive: sendMessage only runs from event
    // handlers (composer submit, suggestion tap), never during render.
    // eslint-disable-next-line react-hooks/purity
    const sentAt = Date.now();
    setMessages((current) => [...current, { id: `u-${nextMessageStamp()}`, text: trimmed, isUser: true, at: sentAt }]);
    setMessageText('');
    setIsTyping(true);

    try {
      const result = await pennyService.send({
        conversationId,
        text: trimmed,
        context: pennyContext ?? undefined,
      });
      setConversationId(result.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: result.message.id,
          text: result.message.text,
          isUser: false,
          at: Date.now(),
          citations: result.message.citations,
          proposedAction: result.message.proposedAction,
        },
      ]);
      // Only successful sends consume the allowance.
      const usage = await recordPennyMessage();
      setMessagesRemaining(usage.remaining);
    } catch (error) {
      // A dead backend is an honest "unavailable" state — never a faked reply.
      const kind = error instanceof ApiError ? error.kind : null;
      setSendError(
        kind === 'network' || kind === 'server' || kind === 'timeout'
          ? 'Penny is unavailable right now. Please check your connection and try again.'
          : describeError(error).message,
      );
    } finally {
      setIsTyping(false);
    }
  }

  async function confirmAction(message: ChatMessage) {
    const action = message.proposedAction;
    if (!action) return;
    try {
      await pennyService.confirmAction(action.id);
      setMessages((current) =>
        current.map((entry) =>
          entry.id === message.id ? { ...entry, proposedAction: undefined, actionConfirmed: true } : entry,
        ),
      );
    } catch (error) {
      setSendError(describeError(error).message);
    }
  }

  function dismissAction(message: ChatMessage) {
    setMessages((current) =>
      current.map((entry) =>
        entry.id === message.id ? { ...entry, proposedAction: undefined } : entry,
      ),
    );
  }

  const hasConversation = messages.length > 0;
  // The free-message gate applies to everyone (no premium state in the app
  // yet); warn while 3 or fewer free messages remain, mirroring the Swift tab.
  const showLowMessageWarning =
    messagesRemaining !== null && messagesRemaining <= 3 && messagesRemaining > 0;

  return (
    <View style={sharedStyles.tabScreen}>
      {/* Header: Penny avatar with online dot, name, status. */}
      <View style={styles.header}>
        <View style={styles.headerAvatarWrap}>
          <PennyImage source={pennyChatAvatarSource} size={40} />
          <View style={styles.headerOnlineDot} />
        </View>
        <View>
          <Text style={styles.headerName}>Penny</Text>
          <Text style={styles.headerStatus}>{isTyping ? 'Typing…' : 'Here to help'}</Text>
        </View>
      </View>

      {pennyContext ? (
        <View style={styles.contextChip}>
          <HiveIcon name="chat" size={14} color={HiveColors.green} />
          <Text style={styles.contextChipText} numberOfLines={1}>
            Helping with: {PENNY_CONTEXT_LABELS[pennyContext.source]}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear context"
            onPress={() => setPennyContext(null)}
            style={({ pressed }) => [pressed && sharedStyles.pressed]}>
            <HiveIcon name="close" size={14} color={HiveColors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={FLOATING_TAB_BAR_HEIGHT}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={hasConversation ? styles.pennyThread : styles.pennyIntro}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {hasConversation ? (
            <>
              {messages.map((message) =>
                message.isUser ? (
                  <View key={message.id} style={styles.userMessageWrap}>
                    <View style={[styles.bubble, styles.bubbleUser]}>
                      <Text style={styles.bubbleUserText}>{message.text}</Text>
                    </View>
                    <Text style={styles.timestamp}>{formatTimestamp(message.at)}</Text>
                  </View>
                ) : (
                  <View key={message.id} style={styles.pennyMessageWrap}>
                    <View style={styles.pennyRow}>
                      <PennyImage source={pennySource} size={28} />
                      <View style={[styles.bubble, styles.bubblePenny]}>
                        <Text style={styles.bubblePennyText}>{message.text}</Text>
                      </View>
                    </View>
                    <Text style={[styles.timestamp, styles.timestampLeft]}>{formatTimestamp(message.at)}</Text>
                    {message.citations && message.citations.length > 0 ? (
                      <Text style={styles.citations}>
                        Sources: {message.citations.map((citation) => citation.title).join(' · ')}
                        {message.citations.some((citation) => citation.stale) ? ' (a source may be out of date)' : ''}
                      </Text>
                    ) : null}
                    {message.proposedAction ? (
                      <View style={styles.actionCard}>
                        <Text style={styles.actionSummary}>{message.proposedAction.summary}</Text>
                        <View style={styles.actionRow}>
                          <AppButton title="Confirm" onPress={() => void confirmAction(message)} />
                          <AppButton title="Not now" variant="plain" onPress={() => dismissAction(message)} />
                        </View>
                      </View>
                    ) : null}
                    {message.actionConfirmed ? (
                      <Text style={styles.actionConfirmed}>Confirmed ✓</Text>
                    ) : null}
                  </View>
                ),
              )}
              {isTyping ? <TypingIndicator /> : null}
            </>
          ) : (
            <>
              <PennyImage source={pennySource} size={72} />
              <Text style={styles.pennyGreeting}>Hi, I&apos;m Penny</Text>
              <Text style={styles.pennyPrompt}>How can I help today?</Text>

              <View style={styles.suggestionGrid}>
                {SUGGESTIONS.map((suggestion) => (
                  <Pressable
                    key={suggestion.title}
                    accessibilityRole="button"
                    accessibilityLabel={suggestion.title}
                    onPress={() => handleSuggestion(suggestion)}
                    style={({ pressed }) => [
                      styles.suggestionCard,
                      { backgroundColor: `${suggestion.tint}12`, borderColor: `${suggestion.tint}38` },
                      pressed && sharedStyles.pressed,
                    ]}>
                    <View style={[styles.suggestionIcon, { backgroundColor: `${suggestion.tint}26` }]}>
                      <HiveIcon name={suggestion.icon} size={18} color={suggestion.tint} />
                    </View>
                    <Text style={styles.suggestionText}>{suggestion.title}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {sendError ? <Text style={styles.pennyError}>{sendError}</Text> : null}
        </ScrollView>

        {showLowMessageWarning ? (
          <Text style={styles.lowMessageWarning}>
            {messagesRemaining} free message{messagesRemaining === 1 ? '' : 's'} left today
          </Text>
        ) : null}

        {inlineWarning ? <Text style={styles.inlineWarning}>{inlineWarning}</Text> : null}
        {micNote ? <Text style={styles.micNote}>Voice input is coming soon.</Text> : null}

        {/* Composer: Penny avatar, input, mic (empty) / send (typing). */}
        <View style={styles.pennyComposer}>
          <PennyImage source={pennyChatAvatarSource} size={26} />
          <TextInput
            ref={inputRef}
            value={messageText}
            onChangeText={setMessageText}
            style={styles.pennyInput}
            returnKeyType="send"
            multiline
            maxLength={2000}
            onSubmitEditing={() => void sendMessage(messageText)}
            accessibilityLabel="Ask Penny"
          />
          {messageText.trim().length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voice input (coming soon)"
              onPress={() => {
                setMicNote(true);
                setTimeout(() => setMicNote(false), 2500);
              }}
              style={({ pressed }) => [pressed && sharedStyles.pressed]}>
              <HiveIcon name="mic" size={18} color={HiveColors.textSecondary} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              onPress={() => void sendMessage(messageText)}
              disabled={isTyping}
              style={({ pressed }) => [styles.pennySend, pressed && sharedStyles.pressed]}>
              <HiveIcon name="next" size={18} color={HiveColors.white} />
            </Pressable>
          )}
        </View>

        <Text style={styles.pennyDisclaimer}>{PENNY_DISCLAIMER}</Text>
      </KeyboardAvoidingView>

      <ModalSheet visible={showPaywall} onClose={() => setShowPaywall(false)}>
        <PaywallContent onClose={() => setShowPaywall(false)} />
      </ModalSheet>
    </View>
  );
}

export function PaywallContent({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.sheetStack}>
      <PennyImage source={pennySource} size={78} />
      <Text style={uiText.subtitle}>You have used your free Penny chats this month</Text>
      <Text style={[uiText.muted, sharedStyles.centerText]}>
        Your free chats renew on the 1st. Hive Plus gives you unlimited Penny conversations,
        unlimited AI meal plans, and unlimited recipe imports.
      </Text>
      <Card style={sharedStyles.fullWidth}>
        {['Unlimited Penny conversations', 'Unlimited AI meal plans', 'Unlimited recipe imports'].map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <HiveIcon name="check" size={14} color={HiveColors.green} />
            <Text style={sharedStyles.cardBody}>{benefit}</Text>
          </View>
        ))}
      </Card>
      <AppButton
        title="Upgrade to Hive Plus"
        // TODO(Section 9): route to the Hive Plus purchase flow (subscription info
        // in Settings). Purchase is scaffolded only — do not invent a checkout.
        onPress={onClose}
        style={sharedStyles.fullWidth}
      />
      <AppButton title="Maybe later" variant="plain" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  actionCard: {
    marginTop: 8,
    marginLeft: 36,
    padding: 12,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
    gap: 10,
    maxWidth: '84%',
  },
  actionConfirmed: {
    marginTop: 6,
    marginLeft: 36,
    fontSize: 13,
    color: HiveColors.green,
    fontWeight: '600',
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionSummary: { color: HiveColors.text, fontSize: 14, lineHeight: 20 },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubblePenny: { backgroundColor: HiveColors.card },
  bubblePennyText: { color: HiveColors.text, fontSize: 15, lineHeight: 21 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: HiveColors.green },
  bubbleUserText: { color: HiveColors.white, fontSize: 15, lineHeight: 21 },
  citations: {
    marginTop: 6,
    marginLeft: 36,
    fontSize: 12,
    lineHeight: 16,
    color: HiveColors.textSecondary,
    maxWidth: '84%',
  },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HiveColors.greenLight,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  contextChipText: { flex: 1, fontSize: 13, color: HiveColors.text, fontWeight: '500' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerAvatarWrap: { position: 'relative' },
  headerName: { color: HiveColors.text, fontSize: 18, fontWeight: '800' },
  headerOnlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: HiveColors.green,
    borderWidth: 2,
    borderColor: HiveColors.white,
  },
  headerStatus: { color: HiveColors.textSecondary, fontSize: 13, fontWeight: '500' },
  inlineWarning: {
    color: HiveColors.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  keyboardAvoid: { flex: 1 },
  lowMessageWarning: {
    color: '#CC7A00',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 6,
  },
  micNote: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 6,
  },
  pennyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 28,
    backgroundColor: '#F2F9F0',
    borderWidth: 1,
    borderColor: 'rgba(46,125,50,0.30)',
  },
  pennyDisclaimer: {
    color: HiveColors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + 12,
  },
  pennyError: { color: HiveColors.danger, fontSize: 13, textAlign: 'center', marginTop: 14 },
  pennyGreeting: { color: HiveColors.text, fontSize: 26, fontWeight: '800', marginTop: 12 },
  pennyInput: { flex: 1, fontSize: 15, color: HiveColors.text, paddingVertical: 10, maxHeight: 120 },
  pennyIntro: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 20 },
  pennyMessageWrap: { alignSelf: 'stretch' },
  pennyPrompt: { color: HiveColors.textSecondary, fontSize: 15, marginTop: 4 },
  pennyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pennySend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.green,
  },
  pennyThread: { paddingHorizontal: 16, paddingTop: 16, gap: 12, paddingBottom: 12 },
  sheetStack: {
    alignItems: 'center',
    gap: 14,
  },
  suggestionCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 96,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  suggestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 22,
    alignSelf: 'stretch',
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: { color: HiveColors.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  timestamp: {
    alignSelf: 'flex-end',
    fontSize: 10,
    color: HiveColors.textSecondary,
    marginTop: 3,
    marginRight: 4,
  },
  timestampLeft: { alignSelf: 'flex-start', marginLeft: 36, marginRight: 0 },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: HiveColors.textSecondary,
  },
  typingRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  userMessageWrap: { alignSelf: 'stretch' },
});
