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
  const { seedPassword, algorithm } = config;

  let prevFileSecret: string | null = null;
  let prevFileDetailsHash: string | null = null;
  const fileDetails: ProofsetFileDetails[] = [];
  let fileDetailsHashList = '';
  const fileDetailsLines: string[] = [];

  // First file_secret = H(seed_password)
  let fileSecret = await hashString(seedPassword, algorithm);

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
      // For the very first entry, fileSecret is already set.
      // For subsequent entries, compute new file_secret.
      if (prevFileSecret !== null && prevFileDetailsHash !== null) {
        fileSecret = await hashString(
          seedPassword + prevFileSecret + prevFileDetailsHash,
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
