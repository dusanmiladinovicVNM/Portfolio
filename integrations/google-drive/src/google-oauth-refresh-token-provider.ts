import type { GoogleDriveAccessTokenProvider } from './google-drive-file-storage.js';

export interface GoogleOAuthRefreshTokenProviderOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REFRESH_SKEW_MS = 60_000;

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

export class GoogleOAuthRefreshTokenProvider
  implements GoogleDriveAccessTokenProvider
{
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private cached:
    | { readonly token: string; readonly expiresAtMs: number }
    | undefined;

  constructor(options: GoogleOAuthRefreshTokenProviderOptions) {
    this.clientId = required(options.clientId, 'clientId');
    this.clientSecret = required(options.clientSecret, 'clientSecret');
    this.refreshToken = required(options.refreshToken, 'refreshToken');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async getAccessToken(): Promise<string> {
    const nowMs = this.now();
    if (this.cached && nowMs + REFRESH_SKEW_MS < this.cached.expiresAtMs) {
      return this.cached.token;
    }

    const response = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Google OAuth token request failed with HTTP ${response.status}.`,
      );
    }

    const payload = (await response.json()) as TokenResponse;
    const token = required(payload.access_token ?? '', 'Google access_token');
    const expiresIn = payload.expires_in;
    if (
      typeof expiresIn !== 'number' ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new Error('Google OAuth expires_in must be a positive number.');
    }

    this.cached = {
      token,
      expiresAtMs: nowMs + expiresIn * 1000,
    };
    return token;
  }
}
