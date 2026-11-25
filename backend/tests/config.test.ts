import { afterEach, it, expect, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

afterEach(() => vi.unstubAllEnvs());

function stubParts(overrides: Record<string, string> = {}) {
  vi.stubEnv('DATABASE_URL', '');
  const parts = { POSTGRES_USER: 'user', POSTGRES_PASSWORD: 'pass', POSTGRES_HOST: 'db', DB_PORT: '5433', POSTGRES_DB: 'taskly', ...overrides };
  for (const [name, value] of Object.entries(parts)) vi.stubEnv(name, value);
}

it('prefers the override over DATABASE_URL', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
});
it('uses DATABASE_URL and rewrites the psycopg scheme', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://u:p@h:5432/d');
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
});
it('builds the url from the POSTGRES variables', () => {
  stubParts({ POSTGRES_PASSWORD: 'p@ss', POSTGRES_DB: 'my db' });
  expect(resolveDatabaseUrl()).toBe('postgresql://user:p%40ss@db:5433/my%20db');
});
it.each(['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'])('throws when %s is missing', (name) => {
  stubParts({ [name]: '' });
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
