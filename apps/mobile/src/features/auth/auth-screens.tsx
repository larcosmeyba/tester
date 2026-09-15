// Sign-in, sign-up and account-verification screens.
//
// The login and signup screens follow the screenshot designs: a Log In /
// Sign Up segmented toggle, the money-bee hero, and the exact field labels,
// placeholders, and button copy from the designs. Password fields use a
// text Show/Hide toggle (the HiveIcon set has no eye glyph).
//
// Google / Apple sign-in is OUT for launch (Marcos, 2026-09-13): no social
// buttons render anywhere in the auth flow. The unused handlers remain on
// the auth context in case they return later.
//
// Verification is email-only (Marcos removed SMS, 2026-09-13): signup sends
// a 6-digit code to the signup email address. Signup establishes the session
// first, so the request/verify mutations go out on the authenticated client —
// the code is the credential for the verifyCode step. On success the screen
// routes into onboarding.

import { useMemo, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { PRIVACY_URL, PRIVACY_VERSION, TERMS_URL, TERMS_VERSION } from '@/constants/legal';
import { GraphQLAuthTokenError } from '@/auth/auth-client';
import { AuthFlowError, useAuth } from '@/auth/auth-context';
import {
  AppButton,
  AppHeader,
  AppLogo,
  AppTextField,
  HiveIcon,
  Screen,
  ScrollScreen,
  TextLink,
  uiText,
} from '@/components/hive-ui';
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { AuthHero, AuthModeToggle } from '@/features/auth/auth-hero';
import {
  InvalidVerificationCodeError,
  requestVerificationCode,
  verifyCode,
} from '@/features/onboarding/onboarding-repository';
import { updateProfile as updateProfileRemote } from '@/features/profile/profile-repository';
import { HiveColors } from '@/constants/theme';
import { useResponsive } from '@/constants/responsive';

const logoSource = require('@/assets/images/hive/logo.png');

export function WelcomeScreen({ nav }: { nav: Navigation }) {
  const styles = useAuthStyles();
  return (
    <Screen>
      <View style={styles.authShell}>
        <View style={styles.authCenter}>
          <View style={styles.welcomeLogoWrap}>
            <AppLogo source={logoSource} size={120} />
          </View>
          <Text style={styles.welcomeTitle}>Penny does the paperwork.{'\n'}You just sign.</Text>
        </View>
        <View style={styles.authActions}>
          <AppButton title="Get Started" onPress={() => nav.push('signup')} />
          <TextLink label="Already a member?" linkText="Login" onPress={() => nav.push('login')} />
        </View>
      </View>
    </Screen>
  );
}

function TermsCheckbox({ accepted, onToggle }: { accepted: boolean; onToggle: () => void }) {
  const styles = useAuthStyles();
  return (
    <Pressable
      onPress={onToggle}
      style={styles.consentRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: accepted }}>
      <View style={[styles.consentBox, accepted && styles.consentBoxChecked]}>
        {accepted ? <Text style={styles.consentCheck}>✓</Text> : null}
      </View>
      <Text style={styles.consentText}>
        I agree to Help The Hive{' '}
        <Text style={styles.consentLink} onPress={() => void Linking.openURL(TERMS_URL)}>
          Terms &amp; Conditions
        </Text>
        .
      </Text>
    </Pressable>
  );
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

// Marcos's SignUp/Login Xcode design: inline validation hints appear under a
// field once it is non-empty and invalid.
const EMAIL_REGEX = /^[A-Z0-9a-z._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function ValidatedField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  isValid,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  hint: string;
  isValid: boolean;
} & Partial<React.ComponentProps<typeof AppTextField>>) {
  const styles = useAuthStyles();
  const showHint = value.length > 0 && !isValid;
  return (
    <View style={styles.validatedField}>
      <AppTextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        {...rest}
      />
      {showHint ? (
        <View style={styles.hintRow}>
          <HiveIcon name="warning" size={12} color={HiveColors.danger} />
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SignUpScreen({ nav }: { nav: Navigation }) {
  const styles = useAuthStyles();
  const app = useAppState();
  const auth = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Validation mirrors Marcos's SignUpView: hints appear under non-empty
  // invalid fields; the button enables only when everything is valid.
  const isNameValid = fullName.trim().length >= 2;
  const isEmailValid = EMAIL_REGEX.test(email);
  const isPhoneValid = phone.replace(/\D/g, '').length >= 10;
  const isPasswordValid = password.length >= 8;

  const canSubmit =
    isNameValid &&
    isEmailValid &&
    isPhoneValid &&
    isPasswordValid &&
    termsAccepted &&
    !isSubmitting;

  async function submit() {
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const { firstName, lastName } = splitName(fullName);
      const result = await auth.signUp({ name: fullName.trim(), email: email.trim(), password });
      app.rememberPendingSignup({
        firstName,
        lastName,
        email: result.email,
        phone: phone.trim(),
        isNewAccount: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        emailMarketingOptIn: false,
      });
      // Sign in right away so verification runs on the user's own session:
      // better-auth no longer gates sign-in on its own email verification —
      // the API's one-time code is the single verification of record. The
      // password stays transient (in-memory only, never persisted).
      app.setTransientSignupPassword(password);
      try {
        await auth.signIn({ email: email.trim(), password });
      } catch (signInError) {
        // If the session didn't establish, the verify screen falls back to
        // its manual-login path rather than stranding the user.
        if (!(signInError instanceof AuthFlowError && signInError.code === 'verification_required')) {
          throw signInError;
        }
      }
      nav.reset('verify', { email: result.email, phone: phone.trim() });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader onBack={nav.back} hiddenTitle />
      <View style={sharedStyles.formScreen}>
        <AuthModeToggle mode="signup" onSelect={(next) => nav.replace(next)} />
        <AuthHero mode="signup" />
        <Text style={styles.formHeading}>Sign up</Text>
        <View style={styles.formStack}>
          <ValidatedField
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full Name"
            hint="Enter at least 2 characters"
            isValid={isNameValid}
          />
          <ValidatedField
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            hint="Enter a valid email address"
            isValid={isEmailValid}
            keyboardType="email-address"
          />
          <ValidatedField
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 000-0000"
            hint="Must be at least 10 digits"
            isValid={isPhoneValid}
            keyboardType="phone-pad"
          />
          <ValidatedField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            hint="Must be at least 8 characters"
            isValid={isPasswordValid}
            secureTextEntry
            showSecureToggle
          />
        </View>
        <TermsCheckbox accepted={termsAccepted} onToggle={() => setTermsAccepted((v) => !v)} />
        {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isSubmitting ? 'Creating account…' : 'Create an Account'}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
        <TextLink label="Already a member?" linkText="Login" onPress={() => nav.replace('login')} />
      </View>
    </ScrollScreen>
  );
}

export function LoginScreen({ nav }: { nav: Navigation }) {
  const styles = useAuthStyles();
  const app = useAppState();
  const auth = useAuth();
  const [email, setEmail] = useState(app.pendingSignupProfile?.email ?? '');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = email.includes('@') && password.length > 0 && !isSubmitting;

  async function submit() {
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await auth.signIn({ email: email.trim(), password });
      nav.reset('welcome');
    } catch (error) {
      if (error instanceof AuthFlowError && error.code === 'verification_required') {
        // Unverified account: send them through the code flow, carrying the
        // password transiently so a successful verify can sign them in.
        app.setTransientSignupPassword(password);
        nav.reset('verify', { email: email.trim().toLowerCase() });
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader onBack={nav.back} hiddenTitle />
      <View style={sharedStyles.formScreen}>
        <AuthModeToggle mode="login" onSelect={(next) => nav.replace(next)} />
        <AuthHero mode="login" />
        <Text style={styles.formHeading}>Login</Text>
        <View style={styles.formStack}>
          <AppTextField
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            keyboardType="email-address"
          />
          <AppTextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            showSecureToggle
          />
        </View>
        <Pressable onPress={() => nav.push('forgot', { email: email.trim() })} style={styles.alignStart}>
          <Text style={styles.forgotLink}>Forgot Password?</Text>
        </Pressable>
        {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
        <AppButton title={isSubmitting ? 'Logging in…' : 'Login'} disabled={!canSubmit} onPress={() => void submit()} />
        <TextLink label="Don't have an account?" linkText="Sign Up" onPress={() => nav.replace('signup')} />
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
            <TextLink label="Did not receive it?" linkText="Try again" onPress={() => setHasSubmitted(false)} />
          </>
        )}
      </View>
    </ScrollScreen>
  );
}

// ---------------------------------------------------------------------------
// Code verification (one-time, after signup).
//
// Verification is email-only (Marcos removed SMS/text verification): signup
// sends a 6-digit code to the signup email address and this screen collects
// it. Signup establishes the session first (better-auth no longer gates
// sign-in on its own email verification — the API codes are the single
// verification of record), so the request/verify mutations go out on the
// authenticated client — the code itself is the credential for the verifyCode
// step. recordConsent and the phone save are best-effort here (hydrateViewer
// repeats both at the first login).
// ---------------------------------------------------------------------------

const CODE_LENGTH = 6;

function CodeBoxes({
  digits,
  onChange,
  inputRefs,
}: {
  digits: string[];
  onChange: (index: number, value: string) => void;
  inputRefs: React.RefObject<Array<TextInput | null>>;
}) {
  const styles = useAuthStyles();
  return (
    <View style={styles.codeRow}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(element) => {
            if (inputRefs.current) {
              inputRefs.current[index] = element;
            }
          }}
          value={digit}
          onChangeText={(value) => onChange(index, value)}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
              inputRefs.current?.[index - 1]?.focus();
            }
          }}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
          style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}
          accessibilityLabel={`Digit ${index + 1} of ${CODE_LENGTH}`}
        />
      ))}
    </View>
  );
}

export function VerifyScreen({
  nav,
  email = '',
  phone = '',
}: {
  nav: Navigation;
  email?: string;
  phone?: string;
}) {
  const styles = useAuthStyles();
  const app = useAppState();
  const auth = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const didInit = useRef(false);

  async function sendCode(isResend = false) {
    setIsRequesting(true);
    setErrorMessage('');
    try {
      await requestVerificationCode('SIGNUP');
      setDigits(Array(CODE_LENGTH).fill(''));
      setCanResend(false);
      setCodeSent(true);
      if (isResend) {
        setNotice('A new code is on its way.');
      }
      inputRefs.current?.[0]?.focus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send a verification code.');
    } finally {
      setIsRequesting(false);
    }
  }

  // Best-effort post-signup writes: consent + phone land on the API user row
  // now that the session exists (signup signs in immediately). Auth failures
  // here are unexpected and ignored; anything else surfaces. The email code
  // is requested once the session is up.
  const initVerification = useEffectEvent(() => {
    if (didInit.current) {
      return;
    }
    didInit.current = true;
    if (!auth.isAuthenticated) {
      return;
    }
    void (async () => {
      try {
        await app.recordSignupConsent();
      } catch (error) {
        if (!(error instanceof GraphQLAuthTokenError)) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to record your consent.');
        }
      }
      if (phone) {
        try {
          await updateProfileRemote({ phone });
        } catch {
          // hydrateViewer seeds the phone from the pending signup profile.
        }
      }
    })();
    void sendCode();
  });

  /* eslint-disable react-hooks/set-state-in-effect -- one-shot post-signup init:
     consent + phone + verification code are requested once the session exists.
     The setState calls below run a single time, not on every render. */
  useEffect(() => {
    initVerification();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!codeSent || canResend) {
      return;
    }
    const timer = setTimeout(() => setCanResend(true), 60_000);
    return () => clearTimeout(timer);
  }, [codeSent, canResend]);

  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, '');
    // Pasting a full code fills every box.
    if (clean.length > 1) {
      const next = Array(CODE_LENGTH).fill('');
      for (let i = 0; i < Math.min(clean.length, CODE_LENGTH); i += 1) {
        next[i] = clean[i];
      }
      setDigits(next);
      if (next.every((digit) => digit)) {
        void submitCode(next.join(''));
      } else {
        inputRefs.current?.[Math.min(clean.length, CODE_LENGTH - 1)]?.focus();
      }
      return;
    }
    const next = [...digits];
    next[index] = clean.slice(-1);
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) {
      inputRefs.current?.[index + 1]?.focus();
    }
    if (next.every((digit) => digit)) {
      void submitCode(next.join(''));
    }
  }

  async function submitCode(code: string) {
    if (isVerifying || code.length !== CODE_LENGTH) {
      return;
    }
    setIsVerifying(true);
    setErrorMessage('');
    try {
      await verifyCode(code);
      // The session was established at signup, so verification just flips
      // the verified flag — refresh the viewer and continue to onboarding.
      // (The transient password is cleared; it is never persisted.)
      app.consumeTransientSignupPassword();
      await auth.refreshSession().catch(() => undefined);
      nav.reset('onboarding');
    } catch (error) {
      if (error instanceof InvalidVerificationCodeError) {
        setErrorMessage(error.message);
        setDigits(Array(CODE_LENGTH).fill(''));
        inputRefs.current?.[0]?.focus();
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to verify the code.');
      }
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Verify your account" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <Text style={uiText.subtitle}>Enter your code</Text>
        <Text style={uiText.muted}>
          {codeSent ? `We sent a 6-digit code to ${email}. Enter it below.` : 'Sending your code…'}
        </Text>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <CodeBoxes digits={digits} onChange={handleDigitChange} inputRefs={inputRefs} />
        {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isVerifying ? 'Verifying…' : 'Verify'}
          disabled={isVerifying || digits.some((digit) => !digit)}
          onPress={() => void submitCode(digits.join(''))}
        />
        <AppButton
          title={isRequesting ? 'Sending…' : canResend ? 'Resend code' : 'Resend available in one minute'}
          variant="plain"
          disabled={isRequesting || !canResend}
          onPress={() => void sendCode(true)}
        />
        <TextLink label="Changed your mind?" linkText="Back to Login" onPress={() => nav.reset('login')} />
      </View>
    </ScrollScreen>
  );
}

function useAuthStyles() {
  const { s, vs, ms } = useResponsive();
  return useMemo(
    () =>
      StyleSheet.create({
      alignStart: {
      alignSelf: 'flex-start',
      },
      authActions: {
      gap: s(14),
      },
      authCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: s(24),
      },
      authShell: {
      flex: 1,
      paddingHorizontal: s(24),
      paddingBottom: vs(52),
      },
      codeBox: {
      width: s(48),
      height: vs(56),
      borderRadius: s(14),
      borderWidth: s(1.5),
      borderColor: HiveColors.border,
      backgroundColor: HiveColors.white,
      textAlign: 'center',
      fontSize: ms(24),
      fontWeight: '800',
      color: HiveColors.text,
      },
      codeBoxFilled: {
      borderColor: HiveColors.green,
      },
      codeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: vs(8),
      },
      consentBlock: {
      gap: s(12),
      marginTop: vs(4),
      },
      consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: s(10),
      },
      consentBox: {
      width: s(22),
      height: vs(22),
      borderRadius: s(6),
      borderWidth: s(1.5),
      borderColor: HiveColors.border,
      backgroundColor: HiveColors.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: vs(1),
      },
      consentBoxChecked: {
      backgroundColor: HiveColors.green,
      borderColor: HiveColors.green,
      },
      consentCheck: {
      color: '#fff',
      fontSize: ms(13),
      fontWeight: '800',
      },
      consentText: {
      flex: 1,
      color: HiveColors.textSecondary,
      fontSize: ms(13),
      lineHeight: ms(19),
      },
      consentLink: {
      color: HiveColors.greenDark,
      fontWeight: '600',
      textDecorationLine: 'underline',
      },
      flexOne: {
      flex: 1,
      },
      forgotLink: {
      color: HiveColors.greenDark,
      fontSize: ms(14),
      fontWeight: '600',
      textDecorationLine: 'underline',
      },
      formHeading: {
      color: HiveColors.text,
      fontSize: ms(30),
      fontWeight: '800',
      letterSpacing: -0.3,
      },
      formStack: {
      gap: s(14),
      },
      validatedField: {
      gap: s(4),
      },
      hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(4),
      paddingLeft: s(4),
      },
      hintText: {
      color: HiveColors.danger,
      fontSize: ms(12),
      },
      notice: {
      color: HiveColors.greenDark,
      fontSize: ms(14),
      lineHeight: ms(20),
      backgroundColor: HiveColors.greenLight,
      borderRadius: s(12),
      padding: 12,
      },
      welcomeTitle: {
      color: HiveColors.greenDark,
      fontSize: ms(28),
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: -0.5,
      },
      welcomeLogoWrap: {
      borderRadius: s(44),
      overflow: 'hidden',
      },
      }),
    [s, vs, ms],
  );
}
