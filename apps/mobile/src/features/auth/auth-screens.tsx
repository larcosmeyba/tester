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
// Verification is email-only (Marcos removed SMS, 2026-09-13) and magic-link
// based (September 2026 redesign): signup sends a verification email with a
// Verify button. Signup establishes the session first, so requestVerificationLink
// goes out on the authenticated client; tapping the button in the email hits
// GET /auth/verify on the API, and "I've verified my email" re-reads the
// viewer verification status. On success the screen routes into onboarding.

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { PRIVACY_URL, PRIVACY_VERSION, TERMS_URL, TERMS_VERSION } from '@/constants/legal';
import { GraphQLAuthTokenError } from '@/auth/auth-client';
import { AuthFlowError, useAuth } from '@/auth/auth-context';
import {
  AppButton,
  AppHeader,
  AppLogo,
  AppTextField,
  HiveIcon,
  PennyImage,
  Screen,
  ScrollScreen,
  TextLink,
  uiText,
} from '@/components/hive-ui';
import { maskEmailAddress } from './auth-utils';
export { maskEmailAddress };
import { useAppState } from '@/state/app-state';
import { StyleSheet } from 'react-native';
import { sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';
import { AuthHero, AuthModeToggle } from '@/features/auth/auth-hero';
import { requestVerificationLink } from '@/features/onboarding/onboarding-repository';
import {
  fetchViewer,
  updateProfile as updateProfileRemote,
} from '@/features/profile/profile-repository';
import { HiveColors } from '@/constants/theme';

const logoSource = require('@/assets/images/hive/logo.png');
const pennyWaveSource = require('@/assets/images/hive/penny-wave.png');

export function WelcomeScreen({ nav }: { nav: Navigation }) {
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
// Magic-link verification (one-time, after signup).
//
// Verification is email-only (Marcos removed SMS/text verification, and the
// 6-digit OTP boxes are gone as of the September 2026 redesign): signup sends
// a magic verification link to the signup email address. The user taps the
// Verify button inside the email, which hits GET /auth/verify on the API
// (consuming the single-use token and stamping the account verified), then
// returns here and taps "I've verified my email" — the screen re-reads the
// viewer verification status and continues to onboarding. Signup establishes
// the session first, so requestVerificationLink goes out on the authenticated
// client. recordConsent and the phone save are best-effort here (hydrateViewer
// repeats both at the first login).
// ---------------------------------------------------------------------------

/** 60s matches the backend verification-link resend cooldown. */
const VERIFY_RESEND_COOLDOWN_SECONDS = 60;

/** Masks an address for display: "j***@gmail.com". */


const VERIFY_STEPS = [
  'Open the email from Help The Hive',
  'Tap the Verify button inside',
  'Come back here and continue',
];

function VerifyStepRow({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.verifyStepRow}>
      <View style={styles.verifyStepNumber}>
        <Text style={styles.verifyStepNumberText}>{number}</Text>
      </View>
      <Text style={styles.verifyStepText}>{text}</Text>
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
  const app = useAppState();
  const auth = useAuth();
  const [isRequesting, setIsRequesting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(VERIFY_RESEND_COOLDOWN_SECONDS);
  const [resent, setResent] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const didInit = useRef(false);

  async function sendLink(isResend = false) {
    setIsRequesting(true);
    setErrorMessage('');
    try {
      await requestVerificationLink('SIGNUP');
      setSecondsLeft(VERIFY_RESEND_COOLDOWN_SECONDS);
      setResent(isResend);
      if (isResend) {
        setNotice('');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send the verification email.');
    } finally {
      setIsRequesting(false);
    }
  }

  // Best-effort post-signup writes: consent + phone land on the API user row
  // now that the session exists (signup signs in immediately). Auth failures
  // here are unexpected and ignored; anything else surfaces. The verification
  // link is requested once the session is up.
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
    void sendLink();
  });

  /* eslint-disable react-hooks/set-state-in-effect -- one-shot post-signup init:
     consent + phone + verification link are requested once the session exists.
     The setState calls below run a single time, not on every render. */
  useEffect(() => {
    initVerification();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // The user tapped Verify in the email (which the API consumed) and came
  // back: re-read the viewer verification status. Until the link is tapped
  // this reports not-verified rather than failing.
  async function checkVerified() {
    if (isChecking) {
      return;
    }
    setIsChecking(true);
    setErrorMessage('');
    setNotice('');
    try {
      const viewer = await fetchViewer();
      if (viewer.verification?.verified) {
        // The session was established at signup, so verification just flips
        // the verified flag — continue to onboarding. (The transient password
        // is cleared; it is never persisted.)
        app.consumeTransientSignupPassword();
        await auth.refreshSession().catch(() => undefined);
        nav.reset('onboarding');
      } else {
        setNotice("We haven't seen the verification yet — tap the Verify button in the email, then try again.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to check verification.');
    } finally {
      setIsChecking(false);
    }
  }

  const resendLabel =
    secondsLeft > 0 ? `Resend in 0:${String(secondsLeft).padStart(2, '0')}` : 'Resend email';

  return (
    <ScrollScreen>
      <AppHeader title="Verify your email" onBack={nav.back} />
      <View style={sharedStyles.formScreen}>
        <PennyImage source={pennyWaveSource} size={110} />
        <Text style={uiText.title}>Verify your email</Text>
        <Text style={uiText.muted}>We sent a verification email to {maskEmailAddress(email)}.</Text>
        <View style={styles.verifyStepsCard}>
          {VERIFY_STEPS.map((text, index) => (
            <VerifyStepRow key={text} number={String(index + 1)} text={text} />
          ))}
        </View>
        {Platform.OS === 'ios' ? (
          <AppButton
            title="Open Mail App"
            variant="secondary"
            onPress={() => {
              Linking.openURL('message://').catch(() => undefined);
            }}
          />
        ) : null}
        <View style={styles.verifyResendRow}>
          <Text style={uiText.muted}>Didn&apos;t get the email?</Text>
          {secondsLeft > 0 || isRequesting ? (
            <Text style={styles.verifyResendWaiting}>{isRequesting ? 'Sending…' : resendLabel}</Text>
          ) : (
            <Pressable onPress={() => void sendLink(true)} accessibilityRole="button">
              <Text style={styles.verifyResendLink}>Resend email</Text>
            </Pressable>
          )}
        </View>
        {resent ? (
          <View style={styles.verifyResentRow}>
            <HiveIcon name="check" size={14} color={HiveColors.green} />
            <Text style={styles.verifyResentText}>
              Verification email sent again — check your inbox and spam folder.
            </Text>
          </View>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {errorMessage ? <Text style={sharedStyles.authError}>{errorMessage}</Text> : null}
        <AppButton
          title={isChecking ? 'Checking…' : "I've verified my email"}
          disabled={isChecking}
          onPress={() => void checkVerified()}
        />
        <TextLink
          label="Testing only"
          linkText="Skip verification"
          onPress={() => {
            app.consumeTransientSignupPassword();
            nav.reset('onboarding');
          }}
        />
      </View>
    </ScrollScreen>
  );
}


const styles = StyleSheet.create({
  alignStart: {
    alignSelf: 'flex-start',
  },
  authActions: {
    gap: 14,
  },
  authCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  authShell: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 52,
  },
  codeBox: {
    width: 48,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: HiveColors.text,
  },
  codeBoxFilled: {
    borderColor: HiveColors.green,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  consentBlock: {
    gap: 12,
    marginTop: 4,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  consentBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  consentBoxChecked: {
    backgroundColor: HiveColors.green,
    borderColor: HiveColors.green,
  },
  consentCheck: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  consentText: {
    flex: 1,
    color: HiveColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
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
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  formHeading: {
    color: HiveColors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  formStack: {
    gap: 14,
  },
  validatedField: {
    gap: 4,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 4,
  },
  hintText: {
    color: HiveColors.danger,
    fontSize: 12,
  },
  verifyStepsCard: {
    backgroundColor: HiveColors.greenLight,
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  verifyStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verifyStepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: HiveColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyStepNumberText: {
    color: HiveColors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  verifyStepText: {
    flex: 1,
    fontSize: 14,
    color: HiveColors.text,
    fontWeight: '500',
  },
  verifyResendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifyResendWaiting: {
    fontSize: 14,
    fontWeight: '600',
    color: HiveColors.green,
  },
  verifyResendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: HiveColors.green,
  },
  verifyResentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifyResentText: {
    flex: 1,
    fontSize: 13,
    color: HiveColors.textSecondary,
  },
  notice: {
    color: HiveColors.greenDark,
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: HiveColors.greenLight,
    borderRadius: 12,
    padding: 12,
  },
  welcomeTitle: {
    color: HiveColors.greenDark,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  welcomeLogoWrap: {
    borderRadius: 44,
    overflow: 'hidden',
  },
});
