// The Penny tab and the paywall sheet.
//
// Extracted verbatim from app-root.tsx; markup unchanged. The chat itself talks
// to the backend through features/penny/penny-service.

import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton, AvatarButton, Card, HiveIcon, PennyImage, uiText } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { PENNY_DISCLAIMER, PENNY_SUGGESTIONS, pennyService } from '@/features/penny/penny-service';
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
};

const pennySource = require('@/assets/images/hive/penny.png');

export function PennyScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sendError, setSendError] = useState('');

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    setMessages((current) => [...current, { id: `u-${current.length}`, text: trimmed, isUser: true }]);
    setMessageText('');
    setSendError('');
    setIsTyping(true);

    try {
      // Everything Penny says comes from the backend. The app holds no model,
      // no prompt and no provider key.
      const result = await pennyService.send({ conversationId: null, text: trimmed });
      setMessages((current) => [
        ...current,
        { id: result.message.id, text: result.message.text, isUser: false },
      ]);
    } catch (error) {
      setSendError(describeError(error).message);
    } finally {
      setIsTyping(false);
    }
  }

  const hasConversation = messages.length > 0;

  return (
    <View style={sharedStyles.tabScreen}>
      <View style={sharedStyles.centeredHeader}>
        <View style={sharedStyles.headerSpacer} />
        <Text style={sharedStyles.centeredHeaderTitle}>Penny AI</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => nav.push('account')} />
      </View>

      <ScrollView
        contentContainerStyle={hasConversation ? styles.pennyThread : styles.pennyIntro}
        showsVerticalScrollIndicator={false}>
        {hasConversation ? (
          <>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[styles.bubble, message.isUser ? styles.bubbleUser : styles.bubblePenny]}>
                <Text style={message.isUser ? styles.bubbleUserText : styles.bubblePennyText}>
                  {message.text}
                </Text>
              </View>
            ))}
            {isTyping ? (
              <View style={[styles.bubble, styles.bubblePenny]}>
                <Text style={styles.bubblePennyText}>Penny is thinking…</Text>
              </View>
            ) : null}
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

      <Text style={styles.pennyDisclaimer}>{PENNY_DISCLAIMER}</Text>

      <View style={styles.pennyComposer}>
        <TextInput
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Ask Penny"
          placeholderTextColor="#9AA0A6"
          style={styles.pennyInput}
          returnKeyType="send"
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
    </View>
  );
}

export function PaywallContent({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.sheetStack}>
      <PennyImage source={pennySource} size={78} />
      <Text style={uiText.subtitle}>You have used your free chats</Text>
      <Text style={[uiText.muted, sharedStyles.centerText]}>
        Upgrade to Penny Premium for unlimited AI conversations, ad-free experience, and priority resource matching.
      </Text>
      <Card style={sharedStyles.fullWidth}>
        {['Unlimited AI chats', 'Ad-free experience', 'Priority resource matching', 'Supports greener AI infrastructure'].map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <HiveIcon name="check" size={14} color={HiveColors.green} />
            <Text style={sharedStyles.cardBody}>{benefit}</Text>
          </View>
        ))}
      </Card>
      <AppButton title="Upgrade to Premium" onPress={onClose} style={sharedStyles.fullWidth} />
      <AppButton title="Maybe later" variant="plain" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  pennyInput: { flex: 1, fontSize: 16, color: HiveColors.text, paddingVertical: 10 },
  pennyIntro: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 28 },
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
  pennyThread: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
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
    backgroundColor: '#232629',
  },
  suggestionText: { color: HiveColors.white, fontSize: 15, fontWeight: '500', lineHeight: 21 },
});
