// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

import type { HashAlgorithm, HasherFactory } from './types.js';

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

/**
 * Hash file content (Uint8Array or ReadableStream).
 * If a hasher factory is provided, uses it for incremental hashing.
 * If not provided, falls back to SubtleCrypto (Uint8Array only).
 */
export async function hashContent(
  content: Uint8Array | ReadableStream<Uint8Array>,
  algorithm: HashAlgorithm,
  hasherFactory?: HasherFactory,
): Promise<string> {
  if (hasherFactory) {
    const hasher = await hasherFactory(algorithm);
    if (content instanceof ReadableStream) {
      const reader = content.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hasher.update(value);
      }
    } else {
      hasher.update(content);
    }
    return hasher.digest();
  }

  if (content instanceof ReadableStream) {
    throw new Error(
      'ReadableStream content requires a hasher factory for streaming hash support. ' +
      'Pass a hasher in the config (e.g., node:crypto or hash-wasm based).',
    );
  }

  return hashBytes(content, algorithm);
}

/** Format a Date as `YYYYMMDD-hhmmss` in UTC. */
export function formatModifiedTime(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${d}-${h}${mi}${s}`;
}
