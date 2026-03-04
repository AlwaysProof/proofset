// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// hash-wasm adapter for streaming hash support in browser environments.
// hash-wasm is NOT a dependency of @proofset/core — the consumer must
// install it separately (npm install hash-wasm).

import type { HasherFactory } from '../types.js';

export const hashWasmFactory: HasherFactory = async (algorithm) => {
  const { createSHA256, createSHA512 } = await import('hash-wasm');
  const create = algorithm === 'SHA-512' ? createSHA512 : createSHA256;
  const hasher = await create();
  hasher.init();
  return {
    update(chunk: Uint8Array) { hasher.update(chunk); },
    async digest() { return hasher.digest('hex'); },
  };
};
