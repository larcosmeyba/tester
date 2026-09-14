// Cold-start splash video.
//
// Replaces the old "Loading Help The Hive" loader. The brand splash video
// plays once on every app launch — for new users and returning logins
// alike — then hands off to the normal navigation stack. Tapping the
// screen skips the video. If the video fails to load, we move on
// immediately instead of stranding the user on a black screen.

import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type StatusChangeEventPayload } from 'expo-video';

const splashVideoSource = require('@/assets/videos/splash.mp4');

export function SplashVideoScreen({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  const player = useVideoPlayer(splashVideoSource, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  // The video played through: hand off to the app.
  useEventListener(player, 'playToEnd', finish);
  // The video failed to load: don't strand the user; hand off anyway.
  useEventListener(player, 'statusChange', (event: StatusChangeEventPayload) => {
    if (event.status === 'error') finish();
  });

  return (
    <Pressable style={styles.container} onPress={finish} accessibilityLabel="Skip intro video">
      <VideoView
        style={styles.video}
        player={player}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    flex: 1,
  },
});
