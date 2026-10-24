import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ExportBundle } from '@/services/repositories/types';

/**
 * Share a human-readable diagnosis summary or a JSON export.
 * File export uses the Expo 58 File API; web falls back to the share sheet text.
 */
export async function shareDiagnosisSummary(text: string): Promise<void> {
  await Share.share({ message: text });
}

export async function shareExport(bundle: ExportBundle): Promise<void> {
  const json = JSON.stringify(bundle, null, 2);
  if (Platform.OS === 'web') {
    await Share.share({ message: json });
    return;
  }

  const file = new FileSystem.File(
    FileSystem.Paths.cache,
    `snapfix-export-${bundle.exportedAt.slice(0, 10)}.json`,
  );
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
