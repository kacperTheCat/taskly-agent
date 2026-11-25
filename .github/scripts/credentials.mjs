#!/usr/bin/env node
// One definition of "looks like a credential", used on everything the agent produced
// before it leaves the job (the patch, the run summary).
//
// Usage: credentials.mjs <file>...   Exits 1 if any file contains a credential-like string.
import { readFileSync } from 'node:fs';
import { isMain } from './cli.mjs';

export const CREDENTIAL_PATTERN = /sk-ant-[\w-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}/;

if (isMain(import.meta.url)) {
  const flagged = process.argv.slice(2).filter((file) => CREDENTIAL_PATTERN.test(readFileSync(file, 'utf8')));
  if (flagged.length) {
    console.error(`Credential-like string found in: ${flagged.join(', ')}`);
    process.exit(1);
  }
}
