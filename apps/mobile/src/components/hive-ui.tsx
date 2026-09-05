import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, HiveColors, MaxContentWidth, Radii, Spacing } from '@/constants/theme';

type PressHandler = () => void;

const iconMap = {
  home: { ios: 'house.fill', fallback: 'H' },
  calendar: { ios: 'calendar', fallback: 'Cal' },
  penny: { ios: 'ant.circle.fill', fallback: 'P' },
  resources: { ios: 'book.fill', fallback: 'R' },
  finance: { ios: 'creditcard.fill', fallback: '$' },
  user: { ios: 'person.circle', fallback: 'U' },
  bell: { ios: 'bell', fallback: '!' },
  gear: { ios: 'gearshape', fallback: '*' },
  back: { ios: 'chevron.left', fallback: '<' },
  next: { ios: 'chevron.right', fallback: '>' },
  plus: { ios: 'plus', fallback: '+' },
  check: { ios: 'checkmark', fallback: 'OK' },
  close: { ios: 'xmark', fallback: 'x' },
  card: { ios: 'creditcard.fill', fallback: '$' },
  doc: { ios: 'doc.text.fill', fallback: 'D' },
  fork: { ios: 'fork.knife', fallback: 'F' },
  fridge: { ios: 'refrigerator.fill', fallback: 'Fr' },
  map: { ios: 'mappin.circle.fill', fallback: 'M' },
  cart: { ios: 'cart.fill', fallback: 'C' },
  play: { ios: 'play.fill', fallback: 'P' },
  box: { ios: 'archivebox.fill', fallback: 'B' },
  snow: { ios: 'snowflake', fallback: 'S' },
  trash: { ios: 'trash', fallback: 'Del' },
  chat: { ios: 'message.fill', fallback: 'Msg' },
  camera: { ios: 'camera', fallback: 'Cam' },
  chart: { ios: 'chart.bar.fill', fallback: 'Ch' },
  shield: { ios: 'shield.fill', fallback: 'Sh' },
  heart: { ios: 'heart.fill', fallback: 'Ht' },
  bolt: { ios: 'bolt.fill', fallback: 'B' },
  job: { ios: 'briefcase.fill', fallback: 'Job' },
  child: { ios: 'figure.2.and.child.holdinghands', fallback: 'Kid' },
  sun: { ios: 'sun.max.fill', fallback: 'Sun' },
  sunrise: { ios: 'sunrise.fill', fallback: 'AM' },
  moon: { ios: 'moon.fill', fallback: 'PM' },
  mic: { ios: 'mic.fill', fallback: 'Mic' },
  send: { ios: 'arrow.up.circle.fill', fallback: 'Up' },
} as const;

export type HiveIconName = keyof typeof iconMap;

type IconProps = {
  name: HiveIconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function HiveIcon({ name, size = 22, color = HiveColors.text, style }: IconProps) {
  const item = iconMap[name];
  return (
    <SymbolView
      name={{ ios: item.ios } as SymbolViewProps['name']}
      size={size}
      tintColor={color}
      style={style}
      fallback={
        <Text style={[styles.iconFallback, { color, minWidth: size, minHeight: size, fontSize: Math.max(10, size * 0.45) }]}>
          {item.fallback}
        </Text>
      }
    />
  );
}

export function Screen({
  children,
  keyboard = false,
  style,
}: {
  children: ReactNode;
  keyboard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const Wrapper = keyboard ? KeyboardAvoidingView : View;
  return (
    <SafeAreaView style={styles.safeArea}>
      <Wrapper behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screenWrapper, style]}>
        <View style={styles.maxWidth}>{children}</View>
      </Wrapper>
    </SafeAreaView>
  );
}

export function ScrollScreen({
  children,
  bottomInset = 24,
  contentStyle,
  keyboard = false,
}: {
  children: ReactNode;
  bottomInset?: number;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const scroll = (
    <ScrollView
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: bottomInset + insets.bottom + BottomTabInset },
        contentStyle,
      ]}>
      <View style={styles.maxWidth}>{children}</View>
    </ScrollView>
  );

  if (keyboard) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screenWrapper}>
          {scroll}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={styles.safeArea}>{scroll}</SafeAreaView>;
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  onAvatar,
  profileImageUri,
  right,
  hiddenTitle = false,
}: {
  title?: string;
  subtitle?: string;
  onBack?: PressHandler;
  onAvatar?: PressHandler;
  profileImageUri?: string;
  right?: ReactNode;
  hiddenTitle?: boolean;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.iconButton}>
            <HiveIcon name="back" size={18} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.headerTitleWrap}>
        {hiddenTitle ? null : (
          <>
            {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
            {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
          </>
        )}
      </View>
      <View style={[styles.headerSide, styles.headerRight]}>
        {right}
        {onAvatar ? <AvatarButton imageUri={profileImageUri} onPress={onAvatar} size={34} /> : null}
      </View>
    </View>
  );
}

export function AvatarButton({ imageUri, onPress, size = 38 }: { imageUri?: string; onPress: PressHandler; size?: number }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
          <HiveIcon name="user" size={Math.max(20, size - 8)} color={HiveColors.text} />
        </View>
      )}
    </Pressable>
  );
}

export function AppLogo({ source, size = 110 }: { source: ImageSourcePropType; size?: number }) {
  return <Image source={source} resizeMode="contain" style={[styles.logo, { width: size, height: size }]} />;
}

export function PennyImage({ source, size = 90 }: { source: ImageSourcePropType; size?: number }) {
  return <Image source={source} resizeMode="contain" style={{ width: size, height: size }} />;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  style,
}: {
  title: string;
  onPress: PressHandler;
  variant?: 'primary' | 'secondary' | 'plain' | 'danger' | 'dark';
  disabled?: boolean;
  icon?: HiveIconName;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'plain' && styles.buttonPlain,
        variant === 'danger' && styles.buttonDanger,
        variant === 'dark' && styles.buttonDark,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}>
      {/* The Xcode app's primary button is a vertical green gradient, lighter at
          the top. It reads as a single flat green without this. */}
      {isPrimary ? (
        <LinearGradient
          colors={
            disabled
              ? ['rgba(46,139,58,0.4)', 'rgba(27,94,32,0.4)']
              : [HiveColors.greenMid, HiveColors.green]
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.buttonGradient}
          pointerEvents="none"
        />
      ) : null}
      {icon ? <HiveIcon name={icon} size={18} color={isPrimary || variant === 'danger' || variant === 'dark' ? HiveColors.white : HiveColors.green} /> : null}
      <Text
        style={[
          styles.buttonText,
          isPrimary && styles.buttonTextPrimary,
          variant === 'secondary' && styles.buttonTextSecondary,
          variant === 'plain' && styles.buttonTextPlain,
          (variant === 'danger' || variant === 'dark') && styles.buttonTextPrimary,
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function TextLink({
  label,
  linkText,
  onPress,
}: {
  label: string;
  linkText: string;
  onPress: PressHandler;
}) {
  return (
    <View style={styles.textLinkWrap}>
      <Text style={styles.muted}>{label}</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.textLink}>{linkText}</Text>
      </Pressable>
    </View>
  );
}

export function AppTextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  autoComplete,
  textContentType,
}: TextInputProps & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, value.length > 0 && styles.inputShellActive, multiline && styles.inputMultilineShell]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9AA0A6"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : undefined)}
          autoCorrect={autoCorrect ?? (keyboardType === 'email-address' ? false : undefined)}
          spellCheck={spellCheck ?? (keyboardType === 'email-address' ? false : undefined)}
          autoComplete={autoComplete ?? (keyboardType === 'email-address' ? 'off' : undefined)}
          textContentType={textContentType ?? (keyboardType === 'email-address' ? 'none' : undefined)}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMultiline]}
        />
        {!secureTextEntry && value.length > 0 ? <HiveIcon name="check" size={16} color={HiveColors.green} /> : null}
      </View>
    </View>
  );
}

export function OrDivider() {
  return (
    <View style={styles.orDivider}>
      <View style={styles.dividerLine} />
      <Text style={styles.muted}>Or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.progressWrap}>
      {Array.from({ length: total }).map((_, index) => (
        <View key={index} style={[styles.progressSegment, index < current ? styles.progressActive : styles.progressInactive]} />
      ))}
    </View>
  );
}

export function SelectionRow({
  title,
  subtitle,
  badge,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  selected: boolean;
  onPress: PressHandler;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.selectionRow, selected && styles.selectionSelected, pressed && styles.pressed]}>
      <View style={styles.flexOne}>
        <Text style={styles.selectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.selectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

export function CheckboxRow({
  title,
  subtitle,
  icon,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: HiveIconName;
  selected: boolean;
  onPress: PressHandler;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.checkboxRow, selected && styles.selectionSelected, pressed && styles.pressed]}>
      {icon ? (
        <View style={styles.rowIcon}>
          <HiveIcon name={icon} size={17} color={HiveColors.green} />
        </View>
      ) : null}
      <View style={styles.flexOne}>
        <Text style={styles.selectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.selectionSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}</View>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone = 'green',
}: {
  label: string;
  selected?: boolean;
  onPress?: PressHandler;
  tone?: 'green' | 'neutral' | 'warning';
}) {
  const content = (
    <Text
      style={[
        styles.chipText,
        selected && styles.chipTextSelected,
        tone === 'warning' && styles.chipTextWarning,
      ]}>
      {label}
    </Text>
  );

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        tone === 'neutral' && styles.chipNeutral,
        tone === 'warning' && styles.chipWarning,
        pressed && styles.pressed,
      ]}>
      {content}
    </Pressable>
  );
}

export function SectionHeader({ title, actionLabel = 'See all', onPress }: { title: string; actionLabel?: string; onPress?: PressHandler }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress ? (
        <Pressable onPress={onPress}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: PressHandler;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) {
    return content;
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function InfoRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  color = HiveColors.green,
}: {
  icon?: HiveIconName;
  title: string;
  subtitle?: string;
  badge?: string;
  onPress?: PressHandler;
  color?: string;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.infoRow, pressed && styles.pressed]}>
      {icon ? (
        <View style={[styles.infoIcon, { backgroundColor: `${color}18` }]}>
          <HiveIcon name={icon} size={18} color={color} />
        </View>
      ) : null}
      <View style={styles.flexOne}>
        <Text style={styles.infoTitle}>{title}</Text>
        {subtitle ? <Text style={styles.infoSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : <HiveIcon name="next" size={13} color={HiveColors.textSecondary} />}
    </Pressable>
  );
}

export function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ModalSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: PressHandler;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function EmptyState({
  title,
  subtitle,
  icon = 'box',
}: {
  title: string;
  subtitle?: string;
  icon?: HiveIconName;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <HiveIcon name={icon} size={24} color={HiveColors.green} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export const uiText = StyleSheet.create({
  title: {
    color: HiveColors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: HiveColors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  body: {
    color: HiveColors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  muted: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  small: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
});

export const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: HiveColors.white,
  },
  screenWrapper: {
    flex: 1,
    backgroundColor: HiveColors.white,
  },
  maxWidth: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexGrow: 1,
  },
  scroll: {
    flex: 1,
    backgroundColor: HiveColors.white,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  headerSide: {
    width: 70,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  headerSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  avatarImage: {
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.white,
  },
  logo: {
    borderRadius: 24,
  },
  iconFallback: {
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '800',
    lineHeight: 18,
  },
  buttonGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  button: {
    minHeight: 56,
    borderRadius: Radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  buttonPrimary: {
    backgroundColor: HiveColors.green,
  },
  buttonSecondary: {
    backgroundColor: HiveColors.white,
    borderWidth: 1.5,
    borderColor: HiveColors.green,
  },
  buttonPlain: {
    minHeight: 36,
    backgroundColor: 'transparent',
  },
  buttonDanger: {
    backgroundColor: HiveColors.danger,
  },
  buttonDark: {
    backgroundColor: '#212126',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  buttonTextPrimary: {
    color: HiveColors.white,
  },
  buttonTextSecondary: {
    color: HiveColors.green,
  },
  buttonTextPlain: {
    color: HiveColors.green,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  textLinkWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  muted: {
    color: HiveColors.textSecondary,
    fontSize: 15,
  },
  textLink: {
    color: HiveColors.green,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  inputShell: {
    minHeight: 52,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  inputShellActive: {
    borderColor: HiveColors.green,
  },
  inputMultilineShell: {
    minHeight: 104,
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: HiveColors.text,
    fontSize: 16,
    padding: 0,
    minHeight: 42,
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: HiveColors.border,
  },
  progressWrap: {
    flexDirection: 'row',
    gap: 5,
  },
  progressSegment: {
    height: 6,
    borderRadius: 3,
    flex: 1,
  },
  progressActive: {
    backgroundColor: HiveColors.green,
  },
  progressInactive: {
    backgroundColor: HiveColors.border,
  },
  selectionRow: {
    minHeight: 66,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  checkboxRow: {
    minHeight: 66,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  selectionSelected: {
    borderColor: HiveColors.green,
    backgroundColor: HiveColors.white,
  },
  selectionTitle: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  selectionSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  flexOne: {
    flex: 1,
  },
  badge: {
    color: HiveColors.green,
    backgroundColor: HiveColors.greenLight,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: HiveColors.green,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: HiveColors.green,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: HiveColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: HiveColors.green,
    backgroundColor: HiveColors.green,
  },
  chip: {
    borderRadius: Radii.pill,
    backgroundColor: HiveColors.card,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: HiveColors.green,
  },
  chipNeutral: {
    backgroundColor: HiveColors.card,
  },
  chipWarning: {
    backgroundColor: HiveColors.warningBg,
  },
  chipText: {
    color: HiveColors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: HiveColors.white,
  },
  chipTextWarning: {
    color: HiveColors.warningText,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sectionTitle: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionAction: {
    color: HiveColors.green,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: HiveColors.card,
    borderRadius: Radii.lg,
    padding: 14,
  },
  infoRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: HiveColors.white,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  infoSubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  statBadge: {
    flex: 1,
    minHeight: 66,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  statValue: {
    color: HiveColors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  statLabel: {
    color: HiveColors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 3,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  modalSheet: {
    backgroundColor: HiveColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 32,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 5,
    backgroundColor: HiveColors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: 8,
  },
  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
