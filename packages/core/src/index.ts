// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

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
