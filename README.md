# save-sync-server

Keeps a small app's files in step across a person's devices. There are no passwords: creating an
account returns a 16-digit **sync code** (`4827-1930-5561-0284`), and any device that knows the code
can read and write that account's files. The code is random (not the database id), so it can't be
guessed.

The server knows nothing about any particular app. A **profile** (`src/profiles/`) says what may be
synced: the namespaces a device keeps files in, the filenames allowed inside one, which of those
carry a format version, the size cap, and how many versions to keep. `SYNC_PROFILE` picks one;
the default is `oracles`.

Each upload is a new version, and the oldest are pruned past the profile's `keepVersions`.

## API

| Method | Path                                        |                                                                                                                   |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST` | `/accounts`                                 | new account: `201 {"code": "4827-1930-5561-0284"}` (10 per hour per address)                                      |
| `GET`  | `/accounts/:code`                           | the current version of every file (game, name, version, size, sha256, device, formatVersion, updatedAt)           |
| `GET`  | `/accounts/:code/manifest`                  | the same as plain text, one line per file: `game name version sha256 formatVersion\|- updatedAt(unix s) device`   |
| `PUT`  | `/accounts/:code/files/:game/:name`         | upload (`application/octet-stream`, up to the profile's cap): `201 {version, sha256}`, or `200` when unchanged    |
| `GET`  | `/accounts/:code/files/:game/:name`         | download the current version (`?version=N` for an older one); headers `x-version`, `x-sha256`, `x-format-version` |
| `GET`  | `/accounts/:code/files/:game/:name/history` | the kept versions                                                                                                 |
| `GET`  | `/health`                                   | `{"ok": true}`                                                                                                    |

`:game` is the namespace — the name is historical, from the first app to use this server (an
emulator, one namespace per game). Nothing requires it to be a game.

Codes are accepted with or without dashes. Upload headers: `x-device` (a name to show),
`x-format-version` (required for the names a profile marks as format-bound, so a device never loads
a snapshot written by another build) and `x-base-version` (the version the device last saw; a
different current version answers `409` with it, so a device never overwrites a newer file by
accident).

## Profiles

A profile is a plain object (`src/profile.ts`). To add an app, drop one in `src/profiles/` and
register it in `src/profiles/index.ts`:

```ts
export const notes: Profile = {
  name: 'notes',
  namespaces: ['work', 'home'],
  files: /^[a-z]+\.md$/,
  sharedNamespace: 'prefs',
  sharedFiles: /^editor\.json$/,
  needsFormatVersion: () => false,
  maxFileBytes: 4096,
  keepVersions: 1,
};
```

The database stores the namespace as free text, so a new profile needs no migration. `oracles` is
the emulator this server was written for: `ages` and `seasons`, each with `sram.sav`,
`state_1`-`state_4`, `state_auto`, their `.thumb` files and `item_buttons`, plus a shared
`settings.ini`; save states are format-bound, their thumbnails are not.

## Rate limits

Per client address: 300 requests a minute on every route, and 10 new accounts an hour. Per sync
code: 60 uploads a minute, from any address. Over a limit the server answers `429` with
`retry-after`. The client address is taken from the proxy's `X-Forwarded-For` (Coolify's Traefik);
set `TRUST_PROXY=false` when the server is reachable directly, or anyone could fake their address.

## Development

```bash
pnpm install
cp .env.example .env
pnpm db:up          # Postgres on localhost:5433 (compose.dev.yml)
pnpm dev            # migrates, then serves on :3000
pnpm test           # in-memory Postgres (PGlite), no Docker needed
pnpm local          # the server on an in-memory database, on a free port (HOST/PORT override)
pnpm typecheck && pnpm lint
```

After changing `src/db/schema.ts`, run `pnpm db:generate` and commit the new file in `drizzle/`;
the server applies pending migrations when it starts.

## The test image

`pnpm image:test` builds the `test` stage: the server on an in-memory database, on `:3000`, empty
at every start. A client app's end-to-end tests can run against it without Postgres or a checkout
of this repo:

```bash
docker run --rm -d -p 0:3000 save-sync-server:test
```

Nothing it stores survives the container, so it is for tests only, never deployment. Published
images are tagged `<version>-test` alongside the release; a client should pin one **by digest**, so
a server change can never quietly alter what its tests mean.

## Deploying on Coolify

New resource > Docker Compose, this repository, base directory `/`, compose file
`docker-compose.yml`. Coolify generates the database user and password and a domain for the `api`
service (port 3000); set your own domain on the `api` service if you prefer. Data lives in the
`db-data` volume. Set `SYNC_PROFILE` on the `api` service when deploying for an app other than the
emulator.
