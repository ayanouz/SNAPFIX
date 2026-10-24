import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  ApiError,
  bearerToken,
  corsHeaders,
  errorResponse,
  isOriginAllowed,
  json,
  readJson,
  requireEnv,
  requireMethod,
} from '../_shared/http.ts';

async function removeUserImages(admin: SupabaseClient, userId: string): Promise<void> {
  const bucket = admin.storage.from('diagnosis-images');
  const { data: folders, error } = await bucket.list(userId, { limit: 1000 });
  if (error) {
    console.error('storage list failed during account deletion', error.message);
    return;
  }
  const paths: string[] = [];
  for (const folder of folders ?? []) {
    if (!folder.name) continue;
    const { data: files } = await bucket.list(`${userId}/${folder.name}`, { limit: 1000 });
    for (const file of files ?? []) {
      if (file.name) paths.push(`${userId}/${folder.name}/${file.name}`);
    }
  }
  if (paths.length > 0) {
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) {
      console.error('storage cleanup failed during account deletion', removeError.message);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    requireMethod(req, 'POST');
    if (!isOriginAllowed(req)) {
      throw new ApiError('forbidden', 'This origin is not allowed', 403);
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const token = bearerToken(req);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      throw new ApiError('unauthorized', 'Sign in again to delete your account', 401);
    }

    const body = await readJson<{ confirm?: unknown }>(req);
    if (body.confirm !== true) {
      throw new ApiError('invalid_input', 'Set confirm=true to delete the account', 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await removeUserImages(admin, userData.user.id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
    if (deleteError) {
      console.error('account deletion failed', deleteError.message);
      throw new ApiError('unknown', 'The account could not be deleted', 500);
    }

    return json(req, { deleted: true });
  } catch (error) {
    return errorResponse(req, error);
  }
});
