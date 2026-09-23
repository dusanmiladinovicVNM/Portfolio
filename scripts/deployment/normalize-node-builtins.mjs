#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

const file = process.argv[2];
if (!file) {
  console.error('Usage: normalize-node-builtins.mjs <bundle-file>');
  process.exit(2);
}

const builtins = new Set(
  builtinModules
    .map((name) => name.startsWith('node:') ? name.slice(5) : name)
    .map((name) => name.split('/')[0]),
);

function isBareBuiltin(specifier) {
  if (specifier.startsWith('node:')) return false;
  const root = specifier.split('/')[0];
  return builtins.has(root);
}

let source = readFileSync(file, 'utf8');
let rewrites = 0;

const patterns = [
  /(\bfrom\s*["'])([^"'\n]+)(["'])/g,
  /(\bimport\s*["'])([^"'\n]+)(["'])/g,
  /(\bimport\s*\(\s*["'])([^"'\n]+)(["']\s*\))/g,
  /(\brequire\s*\(\s*["'])([^"'\n]+)(["']\s*\))/g,
];

for (const pattern of patterns) {
  source = source.replace(pattern, (match, prefix, specifier, suffix) => {
    if (!isBareBuiltin(specifier)) return match;
    rewrites += 1;
    return `${prefix}node:${specifier}${suffix}`;
  });
}

writeFileSync(file, source);

const remaining = [];
for (const pattern of patterns) {
  for (const match of source.matchAll(pattern)) {
    const specifier = match[2];
    if (isBareBuiltin(specifier)) remaining.push(specifier);
  }
}

if (remaining.length > 0) {
  console.error(
    `Bare Node built-in specifiers remain after normalization: ${[...new Set(remaining)].join(', ')}`,
  );
  process.exit(1);
}

console.log(`Normalized ${rewrites} Node built-in import specifier(s) to node: URLs.`);
