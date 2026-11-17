import fs from 'node:fs';
import path from 'node:path';

/**
 * Écriture ATOMIQUE d'un fichier (carte SD du Pi : une coupure de courant
 * pendant un `writeFileSync` direct laisse un fichier tronqué, donc illisible).
 * On écrit un fichier temporaire voisin, on le force sur disque (`fsync`), puis
 * on le renomme par-dessus la cible : `rename` est atomique sur un même
 * système de fichiers → on lit toujours l'ancienne OU la nouvelle version.
 */
export function writeFileAtomic(file: string, data: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w', mode ?? 0o644);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // `mode` d'openSync ne s'applique qu'à la création (et passe par l'umask).
  if (mode !== undefined) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}

/** Écrit un objet en JSON lisible, atomiquement. */
export function writeJsonAtomic(file: string, value: unknown, mode?: number): void {
  writeFileAtomic(file, JSON.stringify(value, null, 2), mode);
}
