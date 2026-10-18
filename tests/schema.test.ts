import { describe, expect, it } from 'vitest';
import { getTableConfig } from '../packages/database/node_modules/drizzle-orm/sqlite-core/index.js';
import {
  blocks,
  emailVerifications,
  reports,
  sessions,
  users,
} from '../packages/database/src/schema/schema.js';

describe('Drizzle D1 schema', () => {
  it('keeps the account tables and cascading ownership references aligned', () => {
    const tables = [users, emailVerifications, sessions, reports, blocks];
    const configurations = tables.map((table) => getTableConfig(table));
    expect(configurations.map((config) => config.name)).toEqual([
      'users',
      'email_verifications',
      'sessions',
      'reports',
      'blocks',
    ]);

    for (const config of configurations.slice(1)) {
      for (const foreignKey of config.foreignKeys) {
        const reference = foreignKey.reference();
        expect(reference.foreignTable).toBe(users);
        expect(reference.foreignColumns.map((column) => column.name)).toEqual(['id']);
        expect(foreignKey.onDelete).toBe('cascade');
      }
    }
  });

  it('provides fresh ISO timestamps for Drizzle-managed createdAt defaults', () => {
    const createdAtColumns = [users, emailVerifications, sessions, reports, blocks].map((table) =>
      getTableConfig(table).columns.find((column) => column.name === 'created_at')
    );

    for (const column of createdAtColumns) {
      const timestamp = column?.defaultFn?.();
      expect(typeof timestamp).toBe('string');
      expect(Number.isFinite(Date.parse(timestamp as string))).toBe(true);
    }
  });
});
