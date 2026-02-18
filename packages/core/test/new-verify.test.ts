// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyFileDetailsLine,
  verifyHashsetHash,
  verifyFileDetailsHashInList,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('new format fixture verification', () => {
  const detailsContent = loadFixture('new-details.txt');
  const fileDetailsHashList = loadFixture('new-all-desc-hashes.txt');
  const detailLines = detailsContent.split(/\r?\n/).filter(Boolean);
  const expectedHashsetHash = 'ea361143c639c8f51b8a89ce1891c25d8809edd0e406aa1adf319bd169e43e84';

  it('has 6 detail lines (no headers/footers)', () => {
    expect(detailLines).toHaveLength(6);
  });

  it('each file_details_line verifies: H(file_details) == file_details_hash', async () => {
    for (const line of detailLines) {
      const result = await verifyFileDetailsLine(line);
      expect(result.valid).toBe(true);
    }
  });

  it('each file_details_hash exists in the file_details_hash_list', () => {
    for (const line of detailLines) {
      const fileDetailsHash = line.split(': ')[0];
      expect(verifyFileDetailsHashInList(fileDetailsHash, fileDetailsHashList)).toBe(true);
    }
  });

  it('hashset_hash matches file_details_hash_list', async () => {
    const valid = await verifyHashsetHash(fileDetailsHashList, expectedHashsetHash);
    expect(valid).toBe(true);
  });
});
