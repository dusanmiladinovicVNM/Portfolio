import {
  ApplicationError,
  type StaffAuthAdminPort,
} from '@portfolio/application';

interface SupabaseAuthUser {
  readonly id?: unknown;
  readonly email?: unknown;
  readonly email_confirmed_at?: unknown;
}

export interface SupabaseStaffAuthAdminOptions {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly webOrigin: string;
  readonly fetchImpl?: typeof fetch;
}

export class SupabaseStaffAuthAdmin implements StaffAuthAdminPort {
  private readonly authBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: SupabaseStaffAuthAdminOptions) {
    this.authBaseUrl = options.supabaseUrl.replace(/\/$/, '') + '/auth/v1';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(json = false): HeadersInit {
    return {
      apikey: this.options.serviceRoleKey,
      Authorization: `Bearer ${this.options.serviceRoleKey}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  private normalizeUser(user: SupabaseAuthUser, expectedEmail: string) {
    if (typeof user.id !== 'string' || user.id.length === 0) {
      throw new ApplicationError(
        'STAFF_AUTH_INVITE_FAILED',
        'Supabase Auth returned an invalid user identity.',
      );
    }
    if (typeof user.email !== 'string') {
      throw new ApplicationError(
        'STAFF_AUTH_INVITE_FAILED',
        'Supabase Auth returned a user without an email address.',
      );
    }
    const email = user.email.trim().toLowerCase();
    if (email !== expectedEmail) {
      throw new ApplicationError(
        'STAFF_AUTH_IDENTITY_MISMATCH',
        'Supabase Auth returned an identity for a different email address.',
      );
    }
    return { subject: user.id, email };
  }

  private async findByExactEmail(email: string) {
    const perPage = 1000;
    for (let page = 1; page <= 100; page += 1) {
      const url = new URL(this.authBaseUrl + '/admin/users');
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(perPage));

      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: this.headers(),
      });
      if (!response.ok) {
        throw new ApplicationError(
          'STAFF_AUTH_INVITE_FAILED',
          `Supabase Auth user lookup failed with HTTP ${response.status}.`,
        );
      }
      const payload = await response.json() as { users?: SupabaseAuthUser[] };
      const users = Array.isArray(payload.users) ? payload.users : [];
      const exact = users.find(
        (user) =>
          typeof user.email === 'string' &&
          user.email.trim().toLowerCase() === email,
      );
      if (exact) {
        return {
          ...this.normalizeUser(exact, email),
          emailConfirmed:
            typeof exact.email_confirmed_at === 'string' &&
            exact.email_confirmed_at.length > 0,
        };
      }
      if (users.length < perPage) return null;
    }

    throw new ApplicationError(
      'STAFF_AUTH_INVITE_FAILED',
      'Supabase Auth user lookup exceeded the supported pagination bound.',
    );
  }

  async sendAccessEmail(rawEmail: string, expectedSubject: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const existing = await this.findByExactEmail(email);
    if (!existing || existing.subject !== expectedSubject) {
      throw new ApplicationError(
        'STAFF_AUTH_IDENTITY_MISMATCH',
        'Supabase Auth identity no longer matches the linked Portfolio staff user.',
      );
    }

    if (!existing.emailConfirmed) {
      const invited = await this.ensureInvitedUser(email);
      if (invited.subject !== expectedSubject) {
        throw new ApplicationError(
          'STAFF_AUTH_IDENTITY_MISMATCH',
          'Supabase Auth returned a different subject while resending the staff invite.',
        );
      }
      return;
    }

    const recoveryUrl = new URL(this.authBaseUrl + '/recover');
    recoveryUrl.searchParams.set('redirect_to', this.options.webOrigin);

    let response: Response;
    try {
      response = await this.fetchImpl(recoveryUrl, {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ email }),
      });
    } catch {
      throw new ApplicationError(
        'STAFF_AUTH_RECONCILIATION_REQUIRED',
        'Supabase Auth recovery email outcome is unknown. Retry after verifying whether an email was delivered.',
      );
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new ApplicationError(
          'STAFF_AUTH_RECONCILIATION_REQUIRED',
          'Supabase Auth recovery email may have completed without a usable acknowledgement. Verify delivery before retrying.',
        );
      }
      throw new ApplicationError(
        'STAFF_AUTH_RECOVERY_FAILED',
        `Supabase Auth rejected the password recovery request with HTTP ${response.status}.`,
      );
    }
  }

  async ensureInvitedUser(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    const existing = await this.findByExactEmail(email);
    if (existing?.emailConfirmed) {
      return { subject: existing.subject, email: existing.email };
    }

    const inviteUrl = new URL(this.authBaseUrl + '/invite');
    inviteUrl.searchParams.set('redirect_to', this.options.webOrigin);

    let response: Response;
    try {
      response = await this.fetchImpl(inviteUrl, {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ email }),
      });
    } catch {
      const reconciled = await this.findByExactEmail(email).catch(() => null);
      if (!existing && reconciled) {
        return { subject: reconciled.subject, email: reconciled.email };
      }
      throw new ApplicationError(
        'STAFF_AUTH_RECONCILIATION_REQUIRED',
        'Supabase Auth invitation outcome is unknown. Retry to reconcile before creating another identity.',
      );
    }

    if (response.ok) {
      const payload = await response.json() as SupabaseAuthUser | { user?: SupabaseAuthUser };
      const user =
        'user' in payload && payload.user
          ? payload.user
          : payload as SupabaseAuthUser;
      return this.normalizeUser(user, email);
    }

    const reconciled = await this.findByExactEmail(email).catch(() => null);
    if (!existing && reconciled) {
      return { subject: reconciled.subject, email: reconciled.email };
    }

    if (response.status >= 500) {
      throw new ApplicationError(
        'STAFF_AUTH_RECONCILIATION_REQUIRED',
        'Supabase Auth invitation may have completed without a usable acknowledgement. Retry to reconcile.',
      );
    }

    throw new ApplicationError(
      'STAFF_AUTH_INVITE_FAILED',
      `Supabase Auth rejected the invitation with HTTP ${response.status}.`,
    );
  }
}
