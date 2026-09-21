import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const red = channel(Number.parseInt(value.slice(0, 2), 16));
  const green = channel(Number.parseInt(value.slice(2, 4), 16));
  const blue = channel(Number.parseInt(value.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(left: string, right: string): number {
  const first = luminance(left);
  const second = luminance(right);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('web accessibility guardrails', () => {
  it('keeps shared muted text above the normal-text contrast threshold', () => {
    expect(contrast('#62665d', '#faf8f3')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#62665d', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#62665d', '#eef0e9')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the skip-link and visible keyboard focus rules in the stylesheet', async () => {
    const css = await readFile(
      new URL('../src/styles.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('.skip-link:focus');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline: 3px solid');
  });
});
