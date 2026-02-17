import type { HashAlgorithm } from './types.js';
import { hashString, hashBytes } from './hash.js';

export function inferAlgorithm(hexHash: string): HashAlgorithm {
  if (hexHash.length === 64) return 'SHA-256';
  if (hexHash.length === 128) return 'SHA-512';
  throw new Error(`Cannot infer algorithm from hash length ${hexHash.length}`);
}

/**
 * Verify a single file_details_line: `<file_details_hash>: <file_details>`
 * Checks that H(file_details) === file_details_hash.
 */
export async function verifyFileDetailsLine(
  detailLine: string,
): Promise<{ valid: boolean; fileDetailsHash: string }> {
  const colonIdx = detailLine.indexOf(': ');
  if (colonIdx === -1) {
    throw new Error('Invalid detail line format: missing ": " separator');
  }
  const fileDetailsHash = detailLine.slice(0, colonIdx);
  const fileDetails = detailLine.slice(colonIdx + 2);
  const algorithm = inferAlgorithm(fileDetailsHash);
  const computed = await hashString(fileDetails, algorithm);
  return { valid: computed === fileDetailsHash.toLowerCase(), fileDetailsHash };
}

/**
 * Verify hashset_hash: H(file_details_hash_list) === expected hashset_hash.
 */
export async function verifyHashsetHash(
  fileDetailsHashList: string,
  expectedHashsetHash: string,
): Promise<boolean> {
  const algorithm = inferAlgorithm(expectedHashsetHash);
  const computed = await hashBytes(new TextEncoder().encode(fileDetailsHashList), algorithm);
  return computed === expectedHashsetHash.toLowerCase();
}

/**
 * Verify a file_details_hash exists in the file_details_hash_list.
 */
export function verifyFileDetailsHashInList(fileDetailsHash: string, fileDetailsHashList: string): boolean {
  const hashes = fileDetailsHashList.split('\r\n').filter(Boolean);
  return hashes.some((h) => h.toLowerCase() === fileDetailsHash.toLowerCase());
}
