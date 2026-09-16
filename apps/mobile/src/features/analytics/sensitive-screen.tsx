/**
 * SensitiveScreen — masks a screen (or part of one) out of Vexo session
 * replays.
 *
 * Wraps children in the Vexo SDK's <VexoMask>: the native recorder redacts
 * the masked rect on-device before the replay frame is written, so personal
 * data (names, emails, addresses, benefit answers, income) never leaves the
 * device in a readable form.
 *
 * Graceful degradation: when the native Vexo module is absent (Expo Go,
 * web, or an engine build without masking), VexoMask degrades to a plain
 * View — the app never crashes and simply records unmasked. Sensitive
 * screens MUST stay wrapped so masking applies wherever replay runs.
 *
 * Usage: wrap the screen body, not the AppHeader — the header carries no
 * personal data and keeping it visible keeps replays useful for support.
 */

import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { VexoMask } from 'vexo-analytics';

export function SensitiveScreen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  // No layout opinions of its own: the mask behaves exactly like the View it
  // replaces. Screens pass their body style through the `style` prop.
  return <VexoMask style={style}>{children}</VexoMask>;
}
