/**
 * AnalyticsRecordingIndicator — a small persistent pill shown while Vexo
 * session replay is actively recording.
 *
 * It floats bottom-center above the content, never intercepts touches
 * (pointerEvents="none"), and disappears the moment tracking is disabled.
 * Rendered once inside Screen/ScrollScreen so it covers every screen while
 * analytics consent is on.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isRecordingActive, subscribeRecordingActive } from './vexo-client';

/** Re-render whenever the SDK's recording state changes. */
export function useRecordingActive(): boolean {
  const [recording, setRecording] = useState(isRecordingActive);
  useEffect(() => subscribeRecordingActive(setRecording), []);
  return recording;
}

export function AnalyticsRecordingIndicator() {
  const recording = useRecordingActive();
  if (!recording) return null;
  return (
    <View style={styles.pill} pointerEvents="none" accessibilityLabel="Analytics recording is on">
      <View style={styles.dot} />
      <Text style={styles.label}>Recording analytics</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(20, 20, 20, 0.82)',
    zIndex: 50,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5484D',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
