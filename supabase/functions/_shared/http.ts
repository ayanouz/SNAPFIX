// Shared HTTP helpers for SNAPFIX Edge Functions.
// These functions run on Supabase's Deno runtime; they are excluded from the
// React Native TypeScript project.

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get('Origin');
  return !origin || allowedOrigins().includes(origin);
}

export function json(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(req),
      ...extraHeaders,
    },
  });
}

export function empty(req: Request, status = 204): Response {
  return new Response(null, { status, headers: corsHeaders(req) });
}

export function errorResponse(req: Request, error: unknown): Response {
  if (error instanceof ApiError) {
    return json(
      req,
      {
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      error.status,
    );
  }
  console.error('Unhandled function error', error);
  return json(req, { error: 'internal_error', message: 'Unexpected server error' }, 500);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const contentType = req.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError('invalid_input', 'Content-Type must be application/json', 415);
  }
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError('invalid_input', 'Request body must be valid JSON', 400);
  }
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new ApiError(
      'server_misconfigured',
      `Missing required environment variable ${name}`,
      500,
    );
  }
  return value;
}

export function bearerToken(req: Request): string {
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError('unauthorized', 'A bearer token is required', 401);
  }
  return match[1];
}

export function requireMethod(req: Request, method = 'POST'): void {
  if (req.method !== method) {
    throw new ApiError('method_not_allowed', `Use ${method}`, 405);
  }
}

export function asString(value: unknown, field: string, max = 2000): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new ApiError(
      'invalid_input',
      `${field} is required and must be at most ${max} characters`,
    );
  }
  return value.trim();
}

export function asUuid(value: unknown, field: string): string {
  const text = asString(value, field, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new ApiError('invalid_input', `${field} must be a UUID`);
  }
  return text;
}
