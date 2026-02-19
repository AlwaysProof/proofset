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

export interface ProofsetResult {
  hashsetHash: string;
  fileDetailsHashList: string;
  fileDetails: ProofsetFileDetails[];
  fileDetailsLineList: string;
}
