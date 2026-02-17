import type { HashAlgorithm } from './types.js';
import { hashString, hashBytes } from './hash.js';

export function inferAlgorithm(hexHash: string): HashAlgorithm {
  if (hexHash.length === 64) return 'SHA-256';
  if (hexHash.length === 128) return 'SHA-512';
  throw new Error(`Cannot infer algorithm from hash length ${hexHash.length}`);
}

/**
 * Verify a single detail line: `<desc_hash>: <hashset_detail_item>`
 * Checks that SHA(hashset_detail_item) === desc_hash.
 */
export async function verifyDetailItem(
  detailLine: string,
): Promise<{ valid: boolean; descHash: string }> {
  const colonIdx = detailLine.indexOf(': ');
  if (colonIdx === -1) {
    throw new Error('Invalid detail line format: missing ": " separator');
  }
  const descHash = detailLine.slice(0, colonIdx);
  const hashsetDetailItem = detailLine.slice(colonIdx + 2);
  const algorithm = inferAlgorithm(descHash);
  const computed = await hashString(hashsetDetailItem, algorithm);
  return { valid: computed === descHash.toLowerCase(), descHash };
}

/**
 * Verify hashset_hash: SHA(all_desc_hashes) === expected hashset_hash.
 */
export async function verifyHashsetHash(
  allDescHashes: string,
  expectedHashsetHash: string,
): Promise<boolean> {
  const algorithm = inferAlgorithm(expectedHashsetHash);
  const computed = await hashBytes(new TextEncoder().encode(allDescHashes), algorithm);
  return computed === expectedHashsetHash.toLowerCase();
}

/**
 * Verify a desc_hash exists in the all_desc_hashes list.
 */
export function verifyDescHashInList(descHash: string, allDescHashes: string): boolean {
  const hashes = allDescHashes.split('\r\n').filter(Boolean);
  return hashes.some((h) => h.toLowerCase() === descHash.toLowerCase());
}
