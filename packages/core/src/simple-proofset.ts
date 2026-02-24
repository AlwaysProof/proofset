// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.
//
// IMPORTANT: This file is part of the core library and must remain compatible
// with browser environments (Chrome/Edge). Do not use Node.js-specific APIs
// (e.g., node:fs, node:path, Buffer, process). Use only standard Web APIs
// (SubtleCrypto, TextEncoder, Uint8Array, etc.).

import type {
  SourceFileEntry,
  SimpleProofsetConfig,
  SimpleProofsetEntry,
  SimpleProofsetResult,
} from './types.js';
import { hashBytes, formatModifiedTime } from './hash.js';

export async function createSimpleProofset(
  files: AsyncIterable<SourceFileEntry>,
  config: SimpleProofsetConfig,
): Promise<SimpleProofsetResult> {
  const { algorithm } = config;
  const entries: SimpleProofsetEntry[] = [];
  const lines: string[] = [];

  for await (const file of files) {
    const contentHash = await hashBytes(file.content, algorithm);
    const modifiedTimeUtc = formatModifiedTime(file.modifiedTime);
    const fileName = file.relativePath;

    entries.push({ contentHash, modifiedTimeUtc, fileName });
    lines.push(`${contentHash} ${modifiedTimeUtc} ${fileName}`);
  }

  const content = lines.join('\r\n') + '\r\n';
  const hash = await hashBytes(new TextEncoder().encode(content), algorithm);

  return { hash, content, entries };
}
