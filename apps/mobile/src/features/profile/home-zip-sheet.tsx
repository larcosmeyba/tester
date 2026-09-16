// Home ZIP Code editor sheet for the Account screen.
//
// The ZIP is stored on the user's profile (app.profile.zip via saveProfile),
// the SAME store the Resources tab already reads as its location fallback
// when location permission is denied — there is intentionally no second or
// local-only ZIP store. Saving here immediately improves nearby-resources
// results everywhere else in the app.

import { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useAppState } from '@/state/app-state';
import { AppButton, AppTextField, ModalSheet, uiText } from '@/components/hive-ui';
import { isValidHomeZip } from '@/features/profile/account-helpers';

export function HomeZipSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const app = useAppState();
  // Remount the form every time the sheet opens so a cancelled edit is
  // dropped and the field always starts from the saved ZIP.
  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <HomeZipForm
        key={visible ? `zip-${app.profile.zip}` : 'zip-closed'}
        initialZip={app.profile.zip}
        onClose={onClose}
      />
    </ModalSheet>
  );
}

function HomeZipForm({ initialZip, onClose }: { initialZip: string; onClose: () => void }) {
  const app = useAppState();
  const [zip, setZip] = useState(initialZip);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!isValidHomeZip(zip)) {
      setError('Enter a valid 5-digit ZIP code.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      // saveProfile merges through the server; the resources tab reads
      // app.profile.zip, so this single write updates every consumer.
      await app.saveProfile({ zip: zip.replace(/\D/g, '') });
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save your ZIP code.');
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.sheet}>
      <Text style={uiText.subtitle}>Home ZIP Code</Text>
      <Text style={uiText.muted}>
        Used to find benefits and resources near you. We never track your location.
      </Text>
      <AppTextField
        label="ZIP code"
        value={zip}
        onChangeText={(value) => {
          setZip(value);
          setError('');
        }}
        placeholder="Not set"
        keyboardType="number-pad"
        maxLength={10}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title={isSaving ? 'Saving…' : 'Save'} disabled={isSaving} onPress={() => void save()} />
      <AppButton title="Cancel" variant="plain" disabled={isSaving} onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 12, paddingHorizontal: 4, paddingBottom: 8 },
  error: { color: '#B3261E', fontSize: 13 },
});
