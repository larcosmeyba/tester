// Sign-in, sign-up and account-recovery screens.
//
// Extracted verbatim from app-root.tsx: the markup is the Xcode-matched design
// and is unchanged here. Only the file boundary is new.

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthFlowError, useAuth } from '@/auth/auth-context';
import { AppButton, AppHeader, AppLogo, AppTextField, OrDivider, Screen, ScrollScreen, uiText } from '@/components/hive-ui';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { HiveColors, Radii } from '@/constants/theme';

const logoSource = require('@/assets/images/hive/logo.png');
const googleSource = require('@/assets/images/hive/google.png');

export function WelcomeScreen({ nav }: { nav: Navigation }) {
  return (
    <Screen>
      <View style={styles.authShell}>
        <View style={styles.authCenter}>
          <AppLogo source={logoSource} />
          <Text style={styles.welcomeTitle}>Feed Your Family{'\n'}Smarter.</Text>
        </View>
        <View style={styles.authActions}>
          <AppButton title="Get Started" onPress={() => nav.push('signup')} />
          <TextLinkLine label="Already a member?" action="Login" onPress={() => nav.push('login')} />
        </View>
      </View>
    </Screen>
  );
}

export function SignUpScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const auth = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppleSubmitting, setIsAppleSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = firstName.length > 0 && lastName.length > 0 && email.includes('@') && phone.length > 0 && password.length >= 8;

  async function submit() {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const result = await auth.signUp({ name: `${firstName} ${lastName}`.trim(), email: email.trim(), password });
      app.rememberPendingSignup({ firstName, lastName, email: result.email, phone });
      nav.reset('verify', { email: result.email });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithApple() {
    setIsAppleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithApple();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to continue with Apple.');
    } finally {
      setIsAppleSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setIsGoogleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithGoogle();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to continue with Google.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader onBack={nav.back} hiddenTitle />
      <View style={sharedStyles.formScreen}>
        <Text style={styles.authTitle}>Create your account</Text>
        <Text style={styles.authSubtitle}>Penny will use this profile to personalize meals, resources, and savings tips.</Text>
        <View style={styles.formStack}>
          <AppTextField label="First name" value={firstName} onChangeText={setFirstName} placeholder="Sam" />
          <AppTextField label="Last name" value={lastName} onChangeText={setLastName} placeholder="Chavez" />
          <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <AppTextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="(818) 555-0142" keyboardType="phone-pad" />
          <AppTextField label="Password" value={password} onChangeText={setPassword} placeholder="Create a password" secureTextEntry />
        </View>
        {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Creating account…' : 'Continue'}
          disabled={!canSubmit || isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void submit()}
        />
        <OrDivider />
        <SocialButton
          title={isGoogleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}
          source={googleSource}
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithGoogle()}
        />
        <AppButton
          title={isAppleSubmitting ? 'Connecting to Apple…' : 'Continue with Apple'}
          variant="dark"
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithApple()}
        />
        <TextLinkLine label="Already have an account?" action="Login" onPress={() => nav.replace('login')} />
      </View>
    </ScrollScreen>
  );
}

export function LoginScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  const auth = useAuth();
  const [email, setEmail] = useState(app.pendingSignupProfile?.email ?? '');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppleSubmitting, setIsAppleSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit() {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signIn({ email: email.trim(), password });
      nav.reset('welcome');
    } catch (error) {
      if (error instanceof AuthFlowError && error.code === 'verification_required') {
        nav.reset('verify', { email: email.trim().toLowerCase() });
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signInWithApple() {
    setIsAppleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithApple();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in with Apple.');
    } finally {
      setIsAppleSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setIsGoogleSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signInWithGoogle();
      nav.reset('welcome');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in with Google.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader onBack={nav.back} hiddenTitle />
      <View style={sharedStyles.formScreen}>
        <Text style={styles.authTitle}>Welcome back</Text>
        <Text style={styles.authSubtitle}>Log in to continue to Help The Hive.</Text>
        <View style={styles.formStack}>
          <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <AppTextField label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
        </View>
        <Pressable onPress={() => nav.push('forgot', { email: email.trim() })} style={styles.alignEnd}>
          <Text style={sharedStyles.greenLink}>Forgot password?</Text>
        </Pressable>
        {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Logging in…' : 'Login'}
          disabled={!email.includes('@') || password.length === 0 || isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void submit()}
        />
        <OrDivider />
        <SocialButton
          title={isGoogleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}
          source={googleSource}
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithGoogle()}
        />
        <AppButton
          title={isAppleSubmitting ? 'Connecting to Apple…' : 'Continue with Apple'}
          variant="dark"
          disabled={isSubmitting || isAppleSubmitting || isGoogleSubmitting}
          onPress={() => void signInWithApple()}
        />
        <TextLinkLine label="New to Help The Hive?" action="Create account" onPress={() => nav.replace('signup')} />
      </View>
    </ScrollScreen>
  );
}

export function ForgotPasswordScreen({ nav, initialEmail = '' }: { nav: Navigation; initialEmail?: string }) {
  const auth = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit() {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await auth.requestPasswordReset(email);
      setHasSubmitted(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to request a password reset.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Forgot Password" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>Reset your password</Text>
        <Text style={uiText.muted}>
          {hasSubmitted
            ? 'If an account exists for that address, a password reset link is on its way.'
            : 'Enter your email and we will send a secure password reset link.'}
        </Text>
        {!hasSubmitted ? (
          <>
            <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
            <AppButton
              title={isSubmitting ? 'Sending…' : 'Send reset link'}
              disabled={!email.includes('@') || isSubmitting}
              onPress={() => void submit()}
            />
          </>
        ) : (
          <>
            <AppButton title="Back to Login" onPress={() => nav.reset('login')} />
            <TextLinkLine label="Did not receive it?" action="Try again" onPress={() => setHasSubmitted(false)} />
          </>
        )}
      </View>
    </ScrollScreen>
  );
}

export function VerifyScreen({ nav, email = '' }: { nav: Navigation; email?: string }) {
  const auth = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (canResend) return;
    const timer = setTimeout(() => setCanResend(true), 60_000);
    return () => clearTimeout(timer);
  }, [canResend]);

  async function resend() {
    if (!email) {
      nav.reset('login');
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    try {
      await auth.sendVerificationEmail(email);
      setMessage('A new verification link has been sent.');
      setCanResend(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to resend verification email.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Verify Email" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>Check your inbox</Text>
        <Text style={uiText.muted}>Open the link in your verification email, then return here to log in.</Text>
        {message ? <Text style={sharedStyles.authError}>{message}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Sending…' : canResend ? 'Resend verification email' : 'Resend available in one minute'}
          disabled={isSubmitting || !canResend}
          onPress={() => void resend()}
        />
        <TextLinkLine label="Already verified?" action="Back to Login" onPress={() => nav.reset('login')} />
        <TextLinkLine label="Wrong email?" action="Create account" onPress={() => nav.reset('signup')} />
      </View>
    </ScrollScreen>
  );
}

export function SocialButton({
  title,
  source,
  disabled = false,
  onPress,
}: {
  title: string;
  source: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.socialButton, (pressed || disabled) && sharedStyles.pressed]}
    >
      <AppLogo source={source} size={22} />
      <Text style={styles.socialButtonText}>{title}</Text>
    </Pressable>
  );
}

export function TextLinkLine({ label, action, onPress }: { label: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.textLinkLine}>
      <Text style={styles.linkLabel}>{label}</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.textLinkAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  alignEnd: {
    alignSelf: 'flex-end',
  },
  authActions: {
    gap: 14,
  },
  authCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  authShell: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 52,
  },
  authSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  authTitle: {
    color: HiveColors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
  },
  formStack: {
    gap: 14,
  },
  linkLabel: {
    color: HiveColors.textSecondary,
    fontSize: 15,
  },
  socialButton: {
    minHeight: 56,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  socialButtonText: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  textLinkAction: {
    color: HiveColors.green,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  textLinkLine: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  welcomeTitle: {
    color: '#1F471F',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0,
  },
});
