import { router } from 'expo-router';

import { useOnboardingDraft } from '@/features/onboarding/onboarding-context';
import { ProfilePhotoStep, pickProfileImage } from '@/features/onboarding/onboarding-screens';

export default function ProfilePhotoRoute() {
  const draft = useOnboardingDraft();

  async function pick() {
    const uri = await pickProfileImage();
    if (uri) {
      draft.setProfileImageUri(uri);
    }
  }

  return (
    <ProfilePhotoStep
      imageUri={draft.profileImageUri}
      onPick={() => void pick()}
      onNext={() => router.push('/(onboarding)/all-set')}
      onBack={() => router.back()}
    />
  );
}
