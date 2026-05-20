// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

import type {
  HashAlgorithm,
  SourceFileEntry,
  ProofsetConfig,
  ProofsetFileDetails,
  ProofsetResult,
} from './types.js';
import { hashString, hashBytes, hashContent, formatModifiedTime } from './hash.js';

function buildFileDetails(
  fileSecret: string,
  modifiedTimeUtc: string,
  contentHash: string,
  filePath: string,
): string {
  // file_secret + ' ' + modified_time + ' ' + content_hash + ' ' + file_path
  return `${fileSecret} ${modifiedTimeUtc} ${contentHash} ${filePath}`;
}

export async function createProofset(
  files: AsyncIterable<SourceFileEntry>,
  config: ProofsetConfig,
): Promise<ProofsetResult> {
  const { proofsetSeed, algorithm, hasher } = config;

  let prevFileSecret: string | null = null;
  let prevFileDetailsHash: string | null = null;
  const fileDetails: ProofsetFileDetails[] = [];
  let fileDetailsHashList = '';
  const fileDetailsLines: string[] = [];

  // First file_secret = H(proofset_seed)
  let fileSecret = await hashString(proofsetSeed, algorithm);

  for await (const file of files) {
    const contentHash = await hashContent(file.content, algorithm, hasher);
    const modifiedTimeUtc = formatModifiedTime(file.modifiedTime);

    // Determine which paths to process
    const paths: string[] = [];
    if (file.fullPath) {
      paths.push(file.fullPath);
    }
    paths.push(file.relativePath);

    for (const filePath of paths) {
      // For the very first entry, fileSecret is already set.
      // For subsequent entries, compute new file_secret.
      if (prevFileSecret !== null && prevFileDetailsHash !== null) {
        fileSecret = await hashString(
          proofsetSeed + prevFileSecret + prevFileDetailsHash,
          algorithm,
        );
      }

      const detailStr = buildFileDetails(fileSecret, modifiedTimeUtc, contentHash, filePath);
      const fdHash = await hashString(detailStr, algorithm);

      fileDetails.push({
        fileDetailsHash: fdHash,
        fileSecret,
        modifiedTimeUtc,
        contentHash,
        filePath,
      });

      fileDetailsHashList += fdHash + '\r\n';
      fileDetailsLines.push(`${fdHash}: ${detailStr}`);

      prevFileSecret = fileSecret;
      prevFileDetailsHash = fdHash;
    }
  }

  const hashsetHash = await hashBytes(new TextEncoder().encode(fileDetailsHashList), algorithm);

  return {
    hashsetHash,
    fileDetailsHashList,
    fileDetails,
    fileDetailsLineList: fileDetailsLines.join('\r\n') + '\r\n',
  };
}

/**
 * Build a details file body with an optional `proofset_seed:` preamble line.
 *
 * The preamble is informational only and is ignored by verification (any line
 * not matching the `<hash>: <details>` pattern is treated as preamble per
 * SPEC § 3.1.1).
 *
 * @param fileDetailsLineList - The `\r\n`-terminated list of file_details_lines
 *   (typically `ProofsetResult.fileDetailsLineList`).
 * @param options - Preamble options. If `proofsetSeed` is omitted, no preamble
 *   line is written. If it is the empty string, a blank `proofset_seed:` line
 *   is written (documents that a seed was used but is not stored).
 */
export function buildDetailsFile(
  fileDetailsLineList: string,
  options: { proofsetSeed?: string } = {},
): string {
  if (options.proofsetSeed === undefined) {
    return fileDetailsLineList;
  }
  return `proofset_seed: ${options.proofsetSeed}\r\n${fileDetailsLineList}`;
}

const PROOFSET_SEED_RE = /^proofset_seed:\s*(.*)$/i;

/**
 * Extract a `proofset_seed:` value from a details file preamble, if present.
 * Returns the seed value (which may be the empty string if a blank line was
 * written), or `null` if no `proofset_seed:` line exists in the preamble.
 *
 * Only scans lines before the first `file_details_line` (consistent with the
 * SPEC § 3.1.1 definition of preamble).
 */
export function parseProofsetSeedFromDetails(detailsContent: string): string | null {
  for (const line of detailsContent.split(/\r?\n/)) {
    // Stop at the first detail line — preamble is everything before it.
    if (/^[0-9a-fA-F]{64,128}: /.test(line)) return null;
    const match = PROOFSET_SEED_RE.exec(line);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Generate a cryptographically random proofset seed: 32 random bytes,
 * lowercase hex-encoded (64 characters). Browser-compatible (uses Web Crypto).
 */
export function generateProofsetSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}
