export const ERROR_CODES = [
  'network',
  'unauthorized',
  'quota_exceeded',
  'ai_not_configured',
  'ai_failed',
  'invalid_input',
  'not_found',
  'storage_failed',
  'image_too_large',
  'unsupported_image',
  'rate_limited',
  'conflict',
  'cancelled',
  'unknown',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly causeCode?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { retryable?: boolean; causeCode?: string },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = options?.retryable ?? ['network', 'ai_failed', 'rate_limited'].includes(code);
    this.causeCode = options?.causeCode;
  }
}

type ErrorLike = {
  message?: string;
  code?: string;
  status?: number;
  error_description?: string;
  name?: string;
};

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const candidate = (error ?? {}) as ErrorLike;
  const raw =
    `${candidate.code ?? ''} ${candidate.message ?? candidate.error_description ?? ''}`.toLowerCase();

  if (
    raw.includes('network') ||
    raw.includes('fetch failed') ||
    raw.includes('timeout') ||
    raw.includes('aborted') ||
    raw.includes('offline')
  ) {
    return new AppError('network', 'Network request failed', { retryable: true });
  }
  if (candidate.status === 401 || raw.includes('jwt') || raw.includes('unauthorized')) {
    return new AppError('unauthorized', 'Authentication required');
  }
  if (raw.includes('quota') || raw.includes('limit_reached') || raw.includes('429')) {
    return new AppError('quota_exceeded', 'Monthly diagnosis limit reached');
  }
  if (raw.includes('ai_not_configured') || raw.includes('no ai provider')) {
    return new AppError('ai_not_configured', 'AI provider is not configured');
  }
  if (raw.includes('ai_failed') || raw.includes('provider') || raw.includes('invalid json')) {
    return new AppError('ai_failed', 'The analysis service could not complete the request', {
      retryable: true,
    });
  }
  if (raw.includes('rate_limit') || raw.includes('too many')) {
    return new AppError('rate_limited', 'Too many requests', { retryable: true });
  }
  if (raw.includes('duplicate') || raw.includes('conflict') || raw.includes('23505')) {
    return new AppError('conflict', 'This record already exists');
  }
  if (raw.includes('not_found') || raw.includes('no rows') || raw.includes('404')) {
    return new AppError('not_found', 'The requested item was not found');
  }
  if (raw.includes('storage') || raw.includes('upload') || raw.includes('bucket')) {
    return new AppError('storage_failed', 'Image upload failed', { retryable: true });
  }
  if (raw.includes('payload too large') || raw.includes('file size')) {
    return new AppError('image_too_large', 'The image is too large');
  }
  if (raw.includes('mime') || raw.includes('unsupported file')) {
    return new AppError('unsupported_image', 'Unsupported image format');
  }
  if (raw.includes('invalid') || raw.includes('validation') || raw.includes('23514')) {
    return new AppError('invalid_input', 'Invalid input');
  }
  return new AppError('unknown', candidate.message || 'An unexpected error occurred');
}

export function errorTranslationKey(error: unknown): string {
  const normalized = normalizeError(error);
  return `errors.${normalized.code}`;
}
