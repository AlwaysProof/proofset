// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

export type HashAlgorithm = 'SHA-256' | 'SHA-512';

export interface SourceFileEntry {
  relativePath: string;
  fullPath?: string;
  modifiedTime: Date;
  content: Uint8Array;
}

export interface ProofsetConfig {
  seedPassword: string;
  algorithm: HashAlgorithm;
}

export interface ProofsetFileDetails {
  fileDetailsHash: string;
  fileSecret: string;
  modifiedTimeUtc: string;
  contentHash: string;
  filePath: string;
}

/**
 * A parsed file_details_line: `<file_details_hash>: <file_secret> <modified_time_utc> <file_content_hash> <file_path>`
 */
export interface ParsedFileDetailsLine {
  fileDetailsHash: string;
  fileSecret: string;
  modifiedTimeUtc: string;
  fileContentHash: string;
  filePath: string;
}

export type ContentMatchStatus = 'match' | 'mismatch' | 'not_found';

/** Result of matching a single detail entry against available file content. */
export interface ContentMatchResult {
  /** The parsed detail line being checked. */
  parsed: ParsedFileDetailsLine;
  /** Whether the file content hash matched, mismatched, or no file was found. */
  status: ContentMatchStatus;
  /** The computed content hash of the matched file (present when status is 'match' or 'mismatch'). */
  computedHash?: string;
  /** Files whose content hash matches this entry (hash match mode only). */
  matchedFiles?: string[];
}

export interface ProofsetResult {
  hashsetHash: string;
  fileDetailsHashList: string;
  fileDetails: ProofsetFileDetails[];
  fileDetailsLineList: string;
}

export interface SimpleProofsetConfig {
  algorithm: HashAlgorithm;
}

export interface SimpleProofsetEntry {
  contentHash: string;
  modifiedTimeUtc: string;
  fileName: string;
}

export interface SimpleProofsetResult {
  hash: string;              // root hash (lowercase hex)
  content: string;           // the full \r\n-terminated list
  entries: SimpleProofsetEntry[];
}
