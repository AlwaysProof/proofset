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
  content: Uint8Array | ReadableStream<Uint8Array>;
}

/** Incremental hasher supporting chunked update/digest. */
export interface IncrementalHasher {
  update(chunk: Uint8Array): void;
  digest(): Promise<string>;
}

/** Factory that creates an IncrementalHasher for a given algorithm. */
export type HasherFactory = (algorithm: HashAlgorithm) => IncrementalHasher | Promise<IncrementalHasher>;

export interface ProofsetConfig {
  /**
   * Secret string that seeds the per-file chained secret.
   * High-entropy values are strongly recommended; tools SHOULD auto-generate
   * 32 random bytes (hex) when not user-supplied.
   * Previously called `seedPassword` (v1 terminology: "seed password").
   */
  proofsetSeed: string;
  algorithm: HashAlgorithm;
  hasher?: HasherFactory;
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
  /**
   * The body of the details file: just the `file_details_line` entries
   * joined by `\r\n` (with a trailing `\r\n`). Does NOT include any preamble.
   * Callers that want a `proofset_seed:` preamble line should prepend it
   * themselves (see `buildDetailsFile`).
   */
  fileDetailsLineList: string;
}

export interface SimpleProofsetConfig {
  algorithm: HashAlgorithm;
  hasher?: HasherFactory;
}

export interface SimpleProofsetEntry {
  contentHash: string;
  fileName: string;
}

export interface SimpleProofsetResult {
  hash: string;              // root hash (lowercase hex)
  content: string;           // the full \r\n-terminated list
  entries: SimpleProofsetEntry[];
}
