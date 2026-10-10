import type { Profile } from '../profile.js';

// The Oracles emulator: one namespace per game, holding the game's own save, the save-state slots
// with their thumbnails, and the item buttons; the shared settings beside them. Never the
// ROM-derived cache files (rom.bin, cyctab.bin).
export const oracles: Profile = {
  name: 'oracles',
  namespaces: ['ages', 'seasons'],
  files: /^(sram\.sav|item_buttons|state_(?:[1-4]|auto)(?:\.thumb)?)$/,
  sharedNamespace: 'shared',
  sharedFiles: /^settings\.ini$/,
  // Save states are engine snapshots; their thumbnails are just pixels.
  needsFormatVersion: (name) => name.startsWith('state_') && !name.endsWith('.thumb'),
  maxFileBytes: 1024 * 1024,
  keepVersions: 3,
};
