// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

export { createProofset } from './proofset.js';
export {
  inferAlgorithm,
  verifyFileDetailsLine,
  verifyHashsetHash,
  verifyFileDetailsHashInList,
  extractDetailLines,
  buildHashListFromDetailLines,
} from './verify.js';
export { hashString, hashBytes } from './hash.js';
export type {
  HashAlgorithm,
  SourceFileEntry,
  ProofsetConfig,
  ProofsetFileDetails,
  ProofsetResult,
} from './types.js';
