import { createClient, type Session } from '@supabase/supabase-js';
import type { AuthSession, SessionGateway } from './session-gateway.js';

function toAuthSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    email: session.user.email ?? null,
  };
}

export function createSupabaseSessionGateway(
  url: string,
  anonKey: string,
): SessionGateway {
  const client = createClient(url, anonKey);

  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return toAuthSession(data.session);
    },

    subscribe(listener) {
      const { data: { subscription } } = client.auth.onAuthStateChange(
        (_event, session) => listener(toAuthSession(session)),
      );
      return () => subscription.unsubscribe();
    },

    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  };
}
