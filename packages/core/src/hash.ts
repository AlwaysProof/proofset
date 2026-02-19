// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

import type { HashAlgorithm } from './types.js';

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Hash a UTF-8 string, return lowercase hex. */
export async function hashString(input: string, algorithm: HashAlgorithm): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest(algorithm, encoded);
  return toHex(new Uint8Array(digest));
}

/** Hash raw bytes, return lowercase hex. */
export async function hashBytes(input: Uint8Array, algorithm: HashAlgorithm): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, input as ArrayBufferView<ArrayBuffer>);
  return toHex(new Uint8Array(digest));
}
