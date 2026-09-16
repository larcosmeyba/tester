/**
 * Download / print actions for generated benefit application PDFs
 * (audit Section 3b).
 *
 * The PDFs are generated server-side; the app only ever holds a document
 * path. "Download" therefore means: fetch the PDF into the app's cache
 * directory and open the system share sheet, where the user can save it to
 * Files, send it, or print it. "Print" sends the remote PDF straight to
 * expo-print, which handles the native print dialog on iOS and Android.
 *
 * expo-file-system note: in SDK 57 the top-level legacy functions throw at
 * runtime — the working entry point is `expo-file-system/legacy`.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { benefitsDocumentUrl } from './benefits-repository';

function fileNameFor(documentPath: string, fallback: string): string {
  const lastSegment = documentPath.split('/').pop()?.trim();
  if (lastSegment && lastSegment.toLowerCase().endsWith('.pdf')) return lastSegment;
  return fallback;
}

/**
 * Download the generated PDF to the cache directory and open the share
 * sheet. Throws with a human-readable message when sharing or the download
 * folder is unavailable (e.g. expo-sharing on web).
 */
export async function downloadAndSharePdf(
  documentPath: string,
  fallbackFileName: string,
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device, so the PDF cannot be downloaded here.');
  }
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('Could not access the download folder on this device.');
  }
  const target = `${cacheDirectory}${fileNameFor(documentPath, fallbackFileName)}`;
  const download = await FileSystem.downloadAsync(benefitsDocumentUrl(documentPath), target);
  await Sharing.shareAsync(download.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Save or share your application PDF',
  });
}

/**
 * Open the native print dialog for the generated PDF.
 */
export async function printPdf(documentPath: string): Promise<void> {
  await Print.printAsync({ uri: benefitsDocumentUrl(documentPath) });
}
