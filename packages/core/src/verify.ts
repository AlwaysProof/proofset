// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

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

// Matches a detail line: 64 or 128 hex chars, then ": ", then the rest
const DETAIL_LINE_RE = /^[0-9a-fA-F]{64,128}: /;

/**
 * Extract file_details_lines from a details file/string, skipping v1 headers/footers.
 */
export function extractDetailLines(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => DETAIL_LINE_RE.test(line));
}

/**
 * Build a file_details_hash_list from detail lines (hashes joined with \r\n).
 */
export function buildHashListFromDetailLines(lines: string[]): string {
  return lines.map((line) => line.split(': ')[0]).join('\r\n') + '\r\n';
}
