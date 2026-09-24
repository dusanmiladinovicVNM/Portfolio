import { describe, expect, it } from 'vitest';
import { apiRateLimitRules } from '../src/api-rate-limit.js';

function scopes(method: string, path: string): string[] {
  return apiRateLimitRules({
    method,
    url: 'https://example.test/functions/v1/api' + path,
  }).map((rule) => rule.scope);
}

describe('apiRateLimitRules', () => {
  it('applies the authenticated bucket to reads', () => {
    expect(scopes('GET', '/reporting/dashboard')).toEqual([
      'authenticated',
    ]);
  });

  it('adds the write bucket to mutations', () => {
    expect(scopes('PATCH', '/inspections/test-id/sections/test')).toEqual([
      'authenticated',
      'write',
    ]);
  });

  it('adds a tighter bucket to binary uploads', () => {
    expect(scopes('POST', '/documents/test-id/versions')).toEqual([
      'authenticated',
      'write',
      'binary-upload',
    ]);
    expect(scopes('POST', '/inspections/test-id/binaries')).toEqual([
      'authenticated',
      'write',
      'binary-upload',
    ]);
  });

  it('adds the tightest bucket to final report generation', () => {
    expect(scopes('POST', '/inspections/test-id/final-report')).toEqual([
      'authenticated',
      'write',
      'final-report',
    ]);
  });
});
