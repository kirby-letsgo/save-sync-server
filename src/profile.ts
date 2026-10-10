// What an app is allowed to sync. The server itself knows nothing about any particular app: a
// profile names the per-namespace buckets a device keeps its files in, which filenames are synced
// inside one, and which of those are only loadable by the build that wrote them.
//
// "Namespace" is the first path segment of a file's URL and the `game` column in the database,
// named for the first app to use this server (an emulator, one namespace per game). Nothing here
// requires it to be a game.
export interface Profile {
  name: string;
  // The namespaces a device may sync into, besides the shared one.
  namespaces: readonly string[];
  // The filenames allowed inside one of those namespaces.
  files: RegExp;
  // The namespace for files shared across all the others, and the filenames allowed in it.
  sharedNamespace: string;
  sharedFiles: RegExp;
  // Bytes that only the build that wrote them can read back: the upload must carry
  // x-format-version, so a device never loads a snapshot from another build.
  needsFormatVersion: (name: string) => boolean;
  maxFileBytes: number;
  // How many versions of a file to keep; older ones are pruned on upload.
  keepVersions: number;
}

export function allowedFile(profile: Profile, namespace: string, name: string): boolean {
  if (namespace === profile.sharedNamespace) return profile.sharedFiles.test(name);
  return profile.namespaces.includes(namespace) && profile.files.test(name);
}
