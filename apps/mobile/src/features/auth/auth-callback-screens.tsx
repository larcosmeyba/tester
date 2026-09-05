import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { AppButton, AppHeader, AppTextField, HiveIcon, Screen, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';

function singleParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

function validToken(value: string | undefined) {
  return Boolean(value && value.length >= 16 && value.length <= 4096 && /^[A-Za-z0-9._~-]+$/.test(value));
}

export function VerificationResultScreen() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ error?: string | string[]; flow?: string | string[] }>();
  const error = singleParam(params.error);
  const isEmailChange = singleParam(params.flow) === 'email-change';
  const succeeded = !error;
  const refreshed = useRef(false);

  useEffect(() => {
    if (succeeded && !refreshed.current) {
      refreshed.current = true;
      void auth.refreshSession();
    }
  }, [auth, succeeded]);

  return (
    <Screen>
      <View style={styles.resultScreen}>
        <View style={styles.iconCircle}>
          <HiveIcon name={succeeded ? 'check' : 'close'} size={32} color={succeeded ? HiveColors.green : HiveColors.orange} />
        </View>
        <Text style={uiText.title}>{succeeded ? 'Email link processed' : 'Link unavailable'}</Text>
        <Text style={[uiText.muted, styles.centerText]}>
          {succeeded
            ? isEmailChange
              ? 'If the link was valid, your login email has been updated. Continue to log in with your new address.'
              : 'If the link was valid, your email is verified. Return to Help The Hive and log in to continue.'
            : 'This verification link is invalid or has expired. Request a new link from the login screen.'}
        </Text>
        <AppButton title="Continue to Login" onPress={() => router.replace({ pathname: '/', params: { screen: 'login' } })} style={styles.fullWidth} />
      </View>
    </Screen>
  );
}

export function ResetPasswordCallbackScreen() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>();
  const token = singleParam(params.token);
  const callbackError = singleParam(params.error);
  const canUseToken = !callbackError && validToken(token);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit() {
    if (!token || !canUseToken) return;
    if (password !== confirmation) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await auth.resetPassword(token, password);
      setPassword('');
      setConfirmation('');
      setIsComplete(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reset your password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canUseToken) {
    return (
      <Screen>
        <View style={styles.resultScreen}>
          <View style={styles.iconCircle}>
            <HiveIcon name="close" size={32} color={HiveColors.orange} />
          </View>
          <Text style={uiText.title}>Link unavailable</Text>
          <Text style={[uiText.muted, styles.centerText]}>This password reset link is invalid or has expired.</Text>
          <AppButton title="Request another link" onPress={() => router.replace({ pathname: '/', params: { screen: 'forgot' } })} style={styles.fullWidth} />
        </View>
      </Screen>
    );
  }

  if (isComplete) {
    return (
      <Screen>
        <View style={styles.resultScreen}>
          <View style={styles.iconCircle}>
            <HiveIcon name="check" size={32} color={HiveColors.green} />
          </View>
          <Text style={uiText.title}>Password changed</Text>
          <Text style={[uiText.muted, styles.centerText]}>Log in again with your new password.</Text>
          <AppButton title="Continue to Login" onPress={() => router.replace({ pathname: '/', params: { screen: 'login' } })} style={styles.fullWidth} />
        </View>
      </Screen>
    );
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Reset Password" onBack={() => router.replace('/')} />
      <View style={styles.formScreen}>
        <Text style={uiText.subtitle}>Choose a new password</Text>
        <Text style={uiText.muted}>Use at least eight characters.</Text>
        <AppTextField label="New password" value={password} onChangeText={setPassword} secureTextEntry />
        <AppTextField label="Confirm password" value={confirmation} onChangeText={setConfirmation} secureTextEntry />
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Updating…' : 'Update password'}
          disabled={password.length < 8 || confirmation.length < 8 || isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  resultScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 },
  formScreen: { gap: 18, padding: 24 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F7FB' },
  centerText: { textAlign: 'center' },
  fullWidth: { width: '100%' },
  error: { color: HiveColors.danger, fontSize: 14 },
});
