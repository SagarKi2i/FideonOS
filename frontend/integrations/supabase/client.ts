'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createClient() {
  return createBrowserClient<Database>(URL!, KEY!);
}

// ───────────────────────────────────────────────────────────────────────────
// Graceful stub for the legacy direct-Supabase client.
//
// Fideon OS routes data through the FastAPI backend; this browser client is
// legacy and used only by not-yet-migrated views (governance/workflows/inbox/…
// — the "BLOCKED" domains in ALIGNMENT_AND_REMAINING_WORK.md). When the
// NEXT_PUBLIC_SUPABASE_* vars are absent (the normal dev case), instantiating
// the real client throws, and because those views call it inside un-try'd async
// loaders, the throw leaves them spinning forever.
//
// Instead of throwing, return a chainable no-op client whose queries resolve to
// `{ data: null, error }`. Blocked views then render their empty states cleanly
// rather than hanging. Real queries resume the moment the env vars are set.
// ───────────────────────────────────────────────────────────────────────────

function makeStub() {
  const error = {
    message:
      'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY). ' +
      'This view still uses the legacy direct-Supabase client and is pending migration to the FastAPI API.',
    code: 'SUPABASE_NOT_CONFIGURED',
  };
  const result = { data: null, error, count: null, status: 0, statusText: 'not-configured' };

  // A single proxy that is callable AND infinitely chainable, and resolves to
  // `result` when awaited (so `.from(t).select().order().limit()` then await works).
  const builder: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: typeof result) => unknown) => resolve(result);
      return () => builder;
    },
    apply() {
      return builder;
    },
  });

  const auth = {
    getUser: async () => ({ data: { user: null }, error }),
    getSession: async () => ({ data: { session: null }, error }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  };

  return new Proxy({} as ReturnType<typeof createClient>, {
    get(_t, prop) {
      if (prop === 'auth') return auth;
      if (prop === 'removeChannel' || prop === 'removeAllChannels') return () => {};
      return () => builder;
    },
  });
}

let _client: ReturnType<typeof createClient> | null = null;

/** Lazy singleton browser client; a graceful no-op stub when env vars are absent. */
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_t, prop, receiver) {
    if (!_client) {
      if (!URL || !KEY) {
        if (typeof console !== 'undefined') {
          console.warn(
            '[supabase] not configured — using no-op stub. Legacy view querying ' +
              'Supabase directly; migrate it to the FastAPI API (see ALIGNMENT_AND_REMAINING_WORK.md).',
          );
        }
        _client = makeStub();
      } else {
        _client = createClient();
      }
    }
    return Reflect.get(_client, prop, receiver);
  },
});
