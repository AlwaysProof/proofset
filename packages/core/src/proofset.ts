import type {
  HashAlgorithm,
  SourceFileEntry,
  ProofsetConfig,
  ProofsetDetailItem,
  ProofsetResult,
} from './types.js';
import { hashString, hashBytes } from './hash.js';

function formatModifiedTime(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

function buildDetailString(
  fileDescSecret: string,
  modifiedTimeUtc: string,
  contentHash: string,
  filePath: string,
): string {
  // file_desc_secret + ' ' + modified_time + ' ' + content_hash + '  ' + file_path
  return `${fileDescSecret} ${modifiedTimeUtc} ${contentHash}  ${filePath}`;
}

export async function createProofset(
  files: AsyncIterable<SourceFileEntry>,
  config: ProofsetConfig,
): Promise<ProofsetResult> {
  const { seedPassword, algorithm } = config;

  let prevFileDescSecret: string | null = null;
  let prevDescHash: string | null = null;
  const details: ProofsetDetailItem[] = [];
  let allDescHashes = '';
  const detailLines: string[] = [];

  // First file_desc_secret = H(seed_password)
  let fileDescSecret = await hashString(seedPassword, algorithm);

  for await (const file of files) {
    const contentHash = await hashBytes(file.content, algorithm);
    const modifiedTimeUtc = formatModifiedTime(file.modifiedTime);

    // Determine which paths to process
    const paths: string[] = [];
    if (file.fullPath) {
      paths.push(file.fullPath);
    }
    paths.push(file.relativePath);

    for (const filePath of paths) {
      // For the very first entry, fileDescSecret is already set.
      // For subsequent entries, compute new file_desc_secret.
      if (prevFileDescSecret !== null && prevDescHash !== null) {
        fileDescSecret = await hashString(
          seedPassword + prevFileDescSecret + prevDescHash,
          algorithm,
        );
      }

      const detailStr = buildDetailString(fileDescSecret, modifiedTimeUtc, contentHash, filePath);
      const descHash = await hashString(detailStr, algorithm);

      details.push({
        descHash,
        fileDescSecret,
        modifiedTimeUtc,
        contentHash,
        filePath,
      });

      allDescHashes += descHash + '\r\n';
      detailLines.push(`${descHash}: ${detailStr}`);

      prevFileDescSecret = fileDescSecret;
      prevDescHash = descHash;
    }
  }

  const hashsetHash = await hashBytes(new TextEncoder().encode(allDescHashes), algorithm);

  return {
    hashsetHash,
    allDescHashes,
    details,
    detailsText: detailLines.join('\r\n') + '\r\n',
  };
}
