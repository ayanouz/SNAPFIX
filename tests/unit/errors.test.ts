import { AppError, errorTranslationKey, normalizeError } from '@/domain/errors';

describe('error normalization', () => {
  it('keeps AppError instances intact', () => {
    const original = new AppError('quota_exceeded', 'Limit reached');
    expect(normalizeError(original)).toBe(original);
    expect(original.retryable).toBe(false);
    expect(new AppError('network', 'offline').retryable).toBe(true);
  });

  it('maps network and auth failures', () => {
    expect(normalizeError(new Error('fetch failed')).code).toBe('network');
    expect(normalizeError({ status: 401, message: 'Unauthorized' }).code).toBe('unauthorized');
  });

  it('maps quota, AI, rate limit, and validation failures', () => {
    expect(normalizeError(new Error('monthly quota reached')).code).toBe('quota_exceeded');
    expect(normalizeError(new Error('AI provider returned invalid JSON')).code).toBe('ai_failed');
    expect(normalizeError(new Error('too many requests')).code).toBe('rate_limited');
    expect(normalizeError(new Error('validation failed')).code).toBe('invalid_input');
  });

  it('maps storage and image failures', () => {
    expect(normalizeError(new Error('bucket upload failed')).code).toBe('storage_failed');
    expect(normalizeError(new Error('payload too large')).code).toBe('image_too_large');
    expect(normalizeError(new Error('unsupported mime type')).code).toBe('unsupported_image');
  });

  it('falls back to unknown and produces a translation key', () => {
    const unknown = normalizeError(new Error('mysterious failure'));
    expect(unknown.code).toBe('unknown');
    expect(errorTranslationKey(unknown)).toBe('errors.unknown');
    expect(errorTranslationKey({ status: 401 })).toBe('errors.unauthorized');
  });
});
