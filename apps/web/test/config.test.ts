import { describe, expect, it } from 'vitest';
import {
  WebConfigurationError,
  readWebConfig,
} from '../src/config.js';

function jwtWithRole(role: string): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ role }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.signature`;
}

function env(key: string) {
  return {
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: key,
    VITE_API_BASE_URL: '/functions/v1/api',
  } as ImportMetaEnv;
}

describe('web security configuration', () => {
  it('rejects plaintext remote Supabase auth transport', () => {
    const configured = {
      ...env('sb_publishable_test'),
      VITE_SUPABASE_URL: 'http://example.supabase.co',
    } as ImportMetaEnv;

    expect(() => readWebConfig(configured)).toThrow(
      /must use HTTPS outside local development/,
    );
  });

  it('allows localhost HTTP for local Supabase development', () => {
    const configured = {
      ...env('sb_publishable_test'),
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_API_BASE_URL: '/functions/v1/api',
    } as ImportMetaEnv;

    expect(readWebConfig(configured).supabaseUrl).toBe(
      'http://localhost:54321',
    );
  });

  it('accepts a browser-safe publishable key', () => {
    expect(readWebConfig(env('sb_publishable_test')).supabaseAnonKey).toBe(
      'sb_publishable_test',
    );
  });

  it('accepts a legacy anon JWT', () => {
    const key = jwtWithRole('anon');
    expect(readWebConfig(env(key)).supabaseAnonKey).toBe(key);
  });

  it('accepts a same-origin absolute Portfolio API URL', () => {
    const configured = {
      ...env('sb_publishable_test'),
      VITE_API_BASE_URL:
        'https://example.supabase.co/functions/v1/api/',
    } as ImportMetaEnv;

    expect(readWebConfig(configured).apiBaseUrl).toBe(
      'https://example.supabase.co/functions/v1/api',
    );
  });

  it('rejects an API origin that could exfiltrate the user access token', () => {
    const configured = {
      ...env('sb_publishable_test'),
      VITE_API_BASE_URL: 'https://evil.example/api',
    } as ImportMetaEnv;

    expect(() => readWebConfig(configured)).toThrow(
      /same origin as VITE_SUPABASE_URL/,
    );
  });

  it('rejects scheme-relative API URLs instead of treating them as local paths', () => {
    const configured = {
      ...env('sb_publishable_test'),
      VITE_API_BASE_URL: '//evil.example/api',
    } as ImportMetaEnv;

    expect(() => readWebConfig(configured)).toThrow(
      /same-origin absolute URL or a root-relative path/,
    );
  });

  it('rejects a Supabase secret key before browser bootstrap', () => {
    expect(() => readWebConfig(env('sb_secret_never_ship_this'))).toThrow(
      WebConfigurationError,
    );
  });

  it('rejects a legacy service_role JWT before browser bootstrap', () => {
    expect(() =>
      readWebConfig(env(jwtWithRole('service_role'))),
    ).toThrow(/privileged JWT role \(service_role\)/);
  });

  it('rejects any non-anon JWT API role rather than guessing it is browser-safe', () => {
    expect(() =>
      readWebConfig(env(jwtWithRole('authenticated'))),
    ).toThrow(/privileged JWT role \(authenticated\)/);
  });
});
