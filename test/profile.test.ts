import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { migrationsFolder } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { type Profile, allowedFile } from '../src/profile.js';
import { loadProfile, profiles } from '../src/profiles/index.js';
import { oracles } from '../src/profiles/oracles.js';

// An app with nothing in common with the emulator: other namespaces, other filenames, a smaller
// cap, no format-version rule at all.
const notes: Profile = {
  name: 'notes',
  namespaces: ['work', 'home'],
  files: /^[a-z]+\.md$/,
  sharedNamespace: 'prefs',
  sharedFiles: /^editor\.json$/,
  needsFormatVersion: () => false,
  maxFileBytes: 4096,
  keepVersions: 1,
};

describe('allowedFile', () => {
  it('confines a file to its own profile', () => {
    expect(allowedFile(oracles, 'seasons', 'sram.sav')).toBe(true);
    expect(allowedFile(oracles, 'work', 'todo.md')).toBe(false);
    expect(allowedFile(notes, 'work', 'todo.md')).toBe(true);
    expect(allowedFile(notes, 'seasons', 'sram.sav')).toBe(false);
  });

  it('keeps the shared namespace to its own files', () => {
    expect(allowedFile(oracles, 'shared', 'settings.ini')).toBe(true);
    expect(allowedFile(oracles, 'shared', 'sram.sav')).toBe(false);
    expect(allowedFile(notes, 'prefs', 'editor.json')).toBe(true);
    expect(allowedFile(notes, 'shared', 'editor.json')).toBe(false);
  });
});

describe('loadProfile', () => {
  it('defaults to oracles and names the ones it has when asked for a stranger', () => {
    expect(loadProfile().name).toBe('oracles');
    expect(loadProfile('oracles')).toBe(oracles);
    expect(() => loadProfile('nope')).toThrow(/unknown SYNC_PROFILE "nope".*oracles/);
  });

  it('registers every profile under its own name', () => {
    for (const [key, profile] of Object.entries(profiles)) expect(profile.name).toBe(key);
  });
});

describe('a server built on another profile', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder });
    app = await buildApp({ db, profile: notes });
  });

  afterEach(async () => {
    await app.close();
  });

  const upload = (code: string, ns: string, name: string, data: Buffer, headers = {}) =>
    app.inject({
      method: 'PUT',
      url: `/accounts/${code}/files/${ns}/${name}`,
      headers: { 'content-type': 'application/octet-stream', ...headers },
      payload: data,
    });

  async function newAccount(): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/accounts' });
    return res.json<{ code: string }>().code;
  }

  it("takes its own files and refuses the other profile's", async () => {
    const code = await newAccount();
    expect((await upload(code, 'home', 'shopping.md', Buffer.from('# milk'))).statusCode).toBe(201);
    expect((await upload(code, 'prefs', 'editor.json', Buffer.from('{}'))).statusCode).toBe(201);
    expect((await upload(code, 'seasons', 'sram.sav', Buffer.alloc(8))).statusCode).toBe(400);
    expect((await upload(code, 'home', 'notes.txt', Buffer.from('x'))).statusCode).toBe(400);
  });

  it('asks for no format version, since nothing in it is a snapshot', async () => {
    const code = await newAccount();
    expect((await upload(code, 'work', 'state_1.md', Buffer.from('x'))).statusCode).toBe(400);
    expect((await upload(code, 'work', 'plan.md', Buffer.from('x'))).statusCode).toBe(201);
  });

  it("keeps the profile's own number of versions", async () => {
    const code = await newAccount();
    for (const body of ['one', 'two', 'three']) {
      await upload(code, 'work', 'plan.md', Buffer.from(body));
    }
    const history = await app.inject({
      method: 'GET',
      url: `/accounts/${code}/files/work/plan.md/history`,
    });
    expect(history.json<{ version: number }[]>().map((v) => v.version)).toEqual([3]);
  });

  it("enforces the profile's size cap", async () => {
    const code = await newAccount();
    const res = await upload(code, 'work', 'big.md', Buffer.alloc(notes.maxFileBytes + 1, 97));
    expect(res.statusCode).toBe(413);
  });
});
