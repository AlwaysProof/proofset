// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// node:crypto adapter for streaming hash support in Node.js environments.
// Uses Node's built-in crypto module — no additional dependencies required.

import * as crypto from 'node:crypto';
import type { HasherFactory } from '../types.js';

export const nodeHasherFactory: HasherFactory = (algorithm) => {
  const name = algorithm === 'SHA-512' ? 'sha512' : 'sha256';
  const h = crypto.createHash(name);
  return {
    update(chunk: Uint8Array) { h.update(chunk); },
    async digest() { return h.digest('hex'); },
  };
};
