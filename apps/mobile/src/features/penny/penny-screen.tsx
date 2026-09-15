// The Penny tab: AI chat with screen context, guardrails, and the daily
// free-message gate (Audit Section 7).
//
// Everything Penny says comes from the backend through
// features/penny/penny-service. The app holds no model, no prompt and no
// provider key. Safety rules are enforced server-side (model instructions +
// output guard); the client adds three pre-send checks it can do honestly:
// the SSN block (never transmit a Social Security number), the scope
// redirect (clearly out-of-scope questions get a graceful local reply), and
// the paywall gate (10 free questions/day, with safety-critical application
// help always exempt).
//
// TODO(backend): Penny was never deployed — run ./scripts/deploy-gcp.sh penny
// dev (then redeploy the API so it discovers PENNY_AGENT_URL) before this
// chat can reach a live agent. Until then sends fail gracefully with an
// honest "can't reach" message.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AppButton,
  AvatarButton,
  Card,
  HiveIcon,
  ModalSheet,
  PennyImage,
  uiText,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import {
  PENNY_DISCLAIMER,
  PENNY_SUGGESTIONS,
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
import { hasPennyMessagesRemaining, recordPennyMessage } from '@/features/penny/penny-limits';
import { describeError } from '@/services/api-error';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { FLOATING_TAB_BAR_HEIGHT } from '@/components/hive-navigation';

type ChatMessage = {
  id: string;
  text: string;
  isUser: boolean;
  citations?: PennyCitation[];
  proposedAction?: PennyProposedAction;
  actionConfirmed?: boolean;
};

const pennySource = require('@/assets/images/hive/penny.png');

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
    <View style={[styles.bubble, styles.bubblePenny, styles.typingRow]} accessibilityLabel="Penny is typing">
      {[0, 1, 2].map((index) => (
        <Animated.View key={index} style={[styles.typingDot, { opacity: dotOpacity(index) }]} />
      ))}
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
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
      setMessages((current) => [
        ...current,
        { id: `u-${stamp}`, text: trimmed, isUser: true },
        { id: `p-${stamp}`, text: PENNY_SCOPE_REDIRECT, isUser: false },
      ]);
      setMessageText('');
      return;
    }

    // Paywall gate: 10 free questions/day. Safety-critical help finishing an
    // existing government application is never blocked.
    if (!isApplicationSafetyMessage(trimmed, pennyContext) && !(await hasPennyMessagesRemaining())) {
      setShowPaywall(true);
      return;
    }

    setMessages((current) => [...current, { id: `u-${nextMessageStamp()}`, text: trimmed, isUser: true }]);
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
          citations: result.message.citations,
          proposedAction: result.message.proposedAction,
        },
      ]);
      // Only successful sends consume the allowance.
      await recordPennyMessage();
    } catch (error) {
      // describeError maps a dead backend to an honest "couldn't reach" message.
      setSendError(describeError(error).message);
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

  return (
    <View style={sharedStyles.tabScreen}>
      {/* Clean header: circular Penny avatar, name, status. */}
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <View style={styles.headerAvatarWrap}>
            <PennyImage source={pennySource} size={44} />
            <View style={styles.headerOnlineDot} />
          </View>
          <View>
            <Text style={styles.headerName}>Penny</Text>
            <Text style={styles.headerStatus}>{isTyping ? 'Typing…' : 'Online'}</Text>
          </View>
        </View>
        <AvatarButton
          imageUri={app.profile.profileImageUri}
          onPress={() => nav.push('account')}
          size={36}
          accessibilityLabel="View account"
        />
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
                  <View key={message.id} style={[styles.bubble, styles.bubbleUser]}>
                    <Text style={styles.bubbleUserText}>{message.text}</Text>
                  </View>
                ) : (
                  <View key={message.id} style={styles.pennyMessageWrap}>
                    <View style={[styles.bubble, styles.bubblePenny]}>
                      <Text style={styles.bubblePennyText}>{message.text}</Text>
                    </View>
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
              <View style={styles.pennyAvatarWrap}>
                <PennyImage source={pennySource} size={132} />
                <View style={styles.pennyOnlineDot} />
              </View>
              <Text style={styles.pennyGreeting}>Hi, I&apos;m Penny</Text>
              <Text style={styles.pennyPrompt}>How can I help you today?</Text>

              <View style={styles.pennySuggestions}>
                {PENNY_SUGGESTIONS.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    accessibilityRole="button"
                    accessibilityLabel={suggestion}
                    onPress={() => void sendMessage(suggestion)}
                    style={({ pressed }) => [styles.suggestionCard, pressed && sharedStyles.pressed]}>
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {sendError ? <Text style={styles.pennyError}>{sendError}</Text> : null}
        </ScrollView>

        {inlineWarning ? <Text style={styles.inlineWarning}>{inlineWarning}</Text> : null}

        <Text style={styles.pennyDisclaimer}>{PENNY_DISCLAIMER}</Text>

        <View style={styles.pennyComposer}>
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Ask Penny"
            placeholderTextColor={HiveColors.placeholder}
            style={styles.pennyInput}
            returnKeyType="send"
            multiline
            maxLength={2000}
            onSubmitEditing={() => void sendMessage(messageText)}
            accessibilityLabel="Ask Penny"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => void sendMessage(messageText)}
            disabled={messageText.trim().length === 0 || isTyping}
            style={({ pressed }) => [styles.pennySend, pressed && sharedStyles.pressed]}>
            <HiveIcon name="next" size={18} color={HiveColors.green} />
          </Pressable>
        </View>
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
      <Text style={uiText.subtitle}>You have used your free chats today</Text>
      <Text style={[uiText.muted, sharedStyles.centerText]}>
        Your free chats renew tomorrow. Upgrade to Hive Plus for unlimited Penny conversations,
        more AI meal plans, and an ad-free experience.
      </Text>
      <Card style={sharedStyles.fullWidth}>
        {['Unlimited Penny conversations', 'More AI meal plans every month', 'Ad-free experience', 'Priority resource matching'].map((benefit) => (
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
    padding: 12,
    borderRadius: 12,
    backgroundColor: HiveColors.card,
    gap: 10,
    maxWidth: '84%',
  },
  actionConfirmed: {
    marginTop: 6,
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
  bubble: { maxWidth: '84%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubblePenny: { alignSelf: 'flex-start', backgroundColor: HiveColors.card },
  bubblePennyText: { color: HiveColors.text, fontSize: 15, lineHeight: 21 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: HiveColors.green },
  bubbleUserText: { color: HiveColors.white, fontSize: 15, lineHeight: 21 },
  citations: {
    marginTop: 6,
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerAvatarWrap: { position: 'relative' },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerName: { color: HiveColors.text, fontSize: 20, fontWeight: '700' },
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
  headerStatus: { color: HiveColors.green, fontSize: 13, fontWeight: '500' },
  inlineWarning: {
    color: HiveColors.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  keyboardAvoid: { flex: 1 },
  pennyAvatarWrap: { position: 'relative', marginBottom: 14 },
  pennyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: FLOATING_TAB_BAR_HEIGHT + 46,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 28,
    backgroundColor: HiveColors.card,
  },
  pennyDisclaimer: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  pennyError: { color: HiveColors.danger, fontSize: 13, textAlign: 'center', marginTop: 14 },
  pennyGreeting: { color: HiveColors.text, fontSize: 32, fontWeight: '700' },
  pennyInput: { flex: 1, fontSize: 16, color: HiveColors.text, paddingVertical: 10, maxHeight: 120 },
  pennyIntro: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 28 },
  pennyMessageWrap: { alignSelf: 'flex-start', maxWidth: '100%' },
  pennyOnlineDot: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: HiveColors.green,
    borderWidth: 2,
    borderColor: HiveColors.white,
  },
  pennyPrompt: { color: HiveColors.textSecondary, fontSize: 18, marginTop: 4 },
  pennySend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.greenLight,
  },
  pennySuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 28,
    alignSelf: 'stretch',
  },
  pennyThread: { paddingHorizontal: 20, paddingTop: 16, gap: 10, paddingBottom: 12 },
  sheetStack: {
    alignItems: 'center',
    gap: 14,
  },
  suggestionCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 96,
    padding: 16,
    borderRadius: 16,
    backgroundColor: HiveColors.ink,
  },
  suggestionText: { color: HiveColors.white, fontSize: 15, fontWeight: '500', lineHeight: 21 },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HiveColors.textSecondary,
  },
  typingRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
