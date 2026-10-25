import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { AppError } from '@/domain/errors';
import { createId } from '@/utils/ids';

export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const MAX_PHOTOS = 3;

export type PreparedImage = {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/jpeg';
};

export type PickedImage = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string | null;
  fileSize?: number;
};

function ensureDirectory(directory: Directory): void {
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
}

export function draftsDirectory(): Directory {
  return new Directory(Paths.document, 'snapfix', 'drafts');
}

export function diagnosisDirectory(userId: string, diagnosisId: string): Directory {
  return new Directory(Paths.document, 'snapfix', 'users', userId, 'diagnoses', diagnosisId);
}

export async function prepareImage(image: PickedImage): Promise<PreparedImage> {
  if (image.mimeType && !image.mimeType.startsWith('image/')) {
    throw new AppError('unsupported_image', 'The selected file is not an image');
  }
  if (image.fileSize && image.fileSize > 25 * 1024 * 1024) {
    throw new AppError('image_too_large', 'Choose an image smaller than 25 MB');
  }

  if (Platform.OS === 'web') {
    return {
      uri: image.uri,
      width: image.width ?? 0,
      height: image.height ?? 0,
      sizeBytes: image.fileSize ?? 0,
      mimeType: 'image/jpeg',
    };
  }

  try {
    const context = ImageManipulator.manipulate(image.uri, {
      maxWidth: 1600,
      maxHeight: 1600,
    });
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: 0.72,
      format: SaveFormat.JPEG,
    });
    const file = new File(result.uri);
    if (!file.exists) {
      throw new Error('The compressed image could not be read');
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new AppError('image_too_large', 'The compressed image is still too large');
    }
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      sizeBytes: file.size,
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('unsupported_image', 'The image could not be processed', {
      retryable: false,
    });
  }
}

export async function persistDraftImage(image: PreparedImage): Promise<PreparedImage> {
  if (Platform.OS === 'web') return image;
  const directory = draftsDirectory();
  ensureDirectory(directory);
  const destination = new File(directory, `${createId()}.jpg`);
  const source = new File(image.uri);
  if (source.uri === destination.uri) return image;
  await source.copy(destination);
  return { ...image, uri: destination.uri, sizeBytes: destination.size || image.sizeBytes };
}

export async function copyIntoDiagnosisFolder(
  image: PreparedImage,
  userId: string,
  diagnosisId: string,
  position: number,
): Promise<PreparedImage> {
  if (Platform.OS === 'web') return image;
  const directory = diagnosisDirectory(userId, diagnosisId);
  ensureDirectory(directory);
  const destination = new File(directory, `photo-${position + 1}.jpg`);
  const source = new File(image.uri);
  if (source.uri !== destination.uri) {
    if (destination.exists) destination.delete();
    await source.copy(destination);
  }
  return { ...image, uri: destination.uri, sizeBytes: destination.size || image.sizeBytes };
}

export function deleteFileQuietly(uri: string): void {
  if (Platform.OS === 'web') return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Local cleanup must never block the user flow.
  }
}

export function deleteDiagnosisImages(userId: string, diagnosisId: string): void {
  if (Platform.OS === 'web') return;
  try {
    const directory = diagnosisDirectory(userId, diagnosisId);
    if (directory.exists) directory.delete();
  } catch {
    // Ignore local cleanup failures.
  }
}

export function clearDrafts(): void {
  if (Platform.OS === 'web') return;
  try {
    const directory = draftsDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Ignore.
  }
}

export function clearUserImages(userId: string): void {
  if (Platform.OS === 'web') return;
  try {
    const directory = new Directory(Paths.document, 'snapfix', 'users', userId);
    if (directory.exists) directory.delete();
  } catch {
    // Local cleanup must never block sign-out or account deletion.
  }
}

export async function readImageBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  if (!file.exists) throw new AppError('not_found', 'The local image is no longer available');
  return file.bytes();
}
