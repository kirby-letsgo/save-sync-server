import type { Profile } from '../profile.js';
import { oracles } from './oracles.js';

export const profiles: Record<string, Profile> = { oracles };

// SYNC_PROFILE picks one; add an app by dropping its profile in this folder and here.
export function loadProfile(name = process.env.SYNC_PROFILE ?? 'oracles'): Profile {
  const profile = profiles[name];
  if (!profile) {
    throw new Error(`unknown SYNC_PROFILE "${name}" (have: ${Object.keys(profiles).join(', ')})`);
  }
  return profile;
}
