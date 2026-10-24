import * as Crypto from 'expo-crypto';

export function createId(): string {
  return Crypto.randomUUID();
}

export function createShortId(prefix = ''): string {
  return `${prefix}${Crypto.randomUUID().slice(0, 8)}`;
}
