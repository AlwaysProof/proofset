// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

import type { HashAlgorithm, ParsedFileDetailsLine, ContentMatchResult } from './types.js';
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
 * Parse a file_details_line into its component fields.
 * Format: `<file_details_hash>: <file_secret> <modified_time_utc> <file_content_hash> <file_path>`
 */
export function parseFileDetailsLine(detailLine: string): ParsedFileDetailsLine {
  const colonIdx = detailLine.indexOf(': ');
  if (colonIdx === -1) {
    throw new Error('Invalid detail line format: missing ": " separator');
  }
  const fileDetailsHash = detailLine.slice(0, colonIdx);
  const fileDetails = detailLine.slice(colonIdx + 2);
  // Fields: file_secret, modified_time_utc, file_content_hash, file_path
  // file_path may contain spaces, so split into at most 4 parts
  const parts = fileDetails.split(' ');
  if (parts.length < 4) {
    throw new Error('Invalid detail line format: expected at least 4 fields in file_details');
  }
  return {
    fileDetailsHash,
    fileSecret: parts[0],
    modifiedTimeUtc: parts[1],
    fileContentHash: parts[2],
    filePath: parts.slice(3).join(' '),
  };
}

/**
 * Build a file_details_hash_list from detail lines (hashes joined with \r\n).
 */
export function buildHashListFromDetailLines(lines: string[]): string {
  return lines.map((line) => line.split(': ')[0]).join('\r\n') + '\r\n';
}

const HASH_LINE_RE = /^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$/;

/**
 * Validate that content looks like a file_details_hash_list (one hash per line).
 * Returns false if any non-empty line is not a valid hex hash of expected length.
 */
export function isValidHashListFormat(content: string): boolean {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((line) => HASH_LINE_RE.test(line));
}

/**
 * Verify a file's content bytes against an expected content hash.
 * Returns the computed hash and whether it matches the expected hash.
 */
export async function verifyFileContentHash(
  fileBytes: Uint8Array,
  expectedContentHash: string,
): Promise<{ match: boolean; computedHash: string }> {
  const algorithm = inferAlgorithm(expectedContentHash);
  const computedHash = await hashBytes(fileBytes, algorithm);
  return {
    match: computedHash.toLowerCase() === expectedContentHash.toLowerCase(),
    computedHash,
  };
}

/**
 * Normalize a file path for cross-platform comparison.
 * Converts backslashes to forward slashes and lowercases for case-insensitive matching.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Match detail entries against available files by relative path.
 *
 * @param detailLines - Array of raw file_details_line strings
 * @param fileContentHashes - Map of normalized relative path to computed content hash (lowercase hex).
 *   Caller is responsible for reading files and computing hashes via hashBytes.
 * @returns One ContentMatchResult per detail line, in the same order.
 */
export function matchDetailEntriesByPath(
  detailLines: string[],
  fileContentHashes: Map<string, string>,
): ContentMatchResult[] {
  return detailLines.map((line) => {
    const parsed = parseFileDetailsLine(line);
    const normalizedEntryPath = normalizePath(parsed.filePath);
    const computedHash = fileContentHashes.get(normalizedEntryPath);

    if (computedHash === undefined) {
      return { parsed, status: 'not_found' as const };
    }

    const match = computedHash.toLowerCase() === parsed.fileContentHash.toLowerCase();
    return {
      parsed,
      status: match ? 'match' as const : 'mismatch' as const,
      computedHash,
    };
  });
}

/**
 * Match detail entries against available files by content hash.
 *
 * @param detailLines - Array of raw file_details_line strings
 * @param hashToFiles - Map of content hash (lowercase hex) to array of relative file paths
 *   that have that hash. Caller is responsible for reading files and computing hashes.
 * @returns One ContentMatchResult per detail line, in the same order.
 */
export function matchDetailEntriesByHash(
  detailLines: string[],
  hashToFiles: Map<string, string[]>,
): ContentMatchResult[] {
  return detailLines.map((line) => {
    const parsed = parseFileDetailsLine(line);
    const contentHash = parsed.fileContentHash.toLowerCase();
    const matchedFiles = hashToFiles.get(contentHash);

    if (!matchedFiles || matchedFiles.length === 0) {
      return { parsed, status: 'not_found' as const };
    }

    return {
      parsed,
      status: 'match' as const,
      matchedFiles,
    };
  });
}
