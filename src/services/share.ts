import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ExportBundle } from '@/services/repositories/types';

/**
 * Share a human-readable diagnosis summary or a JSON export.
 * File export uses the Expo 58 File API; the web target downloads a JSON file.
 */
export async function shareDiagnosisSummary(text: string): Promise<void> {
  await Share.share({ message: text });
}

export async function shareExport(bundle: ExportBundle): Promise<void> {
  const json = JSON.stringify(bundle, null, 2);
  const filename = `snapfix-export-${bundle.exportedAt.slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    // A browser download is more reliable than the Web Share API and still
    // gives the user a portable JSON copy of their data.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const file = new FileSystem.File(FileSystem.Paths.cache, filename);
  if (file.exists) file.delete();
  file.write(json);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    await Share.share({ message: json });
    return;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'SNAPFIX data export',
    UTI: 'public.json',
  });
}
