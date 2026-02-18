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

// Regex to extract file_details_lines, skipping v1 headers/footers
const DETAIL_LINE_RE = /^[0-9a-fA-F]{64,128}: /;

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

function extractDetailLines(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => DETAIL_LINE_RE.test(line));
}

describe('legacy v1 verification', () => {
  const detailsContent = loadFixture('legacy-details.txt');
  const fileDetailsHashList = loadFixture('legacy-all-desc-hashes.txt');
  const detailLines = extractDetailLines(detailsContent);
  const expectedHashsetHash = '9FAD21B5B294809C2766486CA574546BE153E7CD62E5405FD976A92CA59A2D57';

  it('extracts 6 detail lines from v1 details file (skipping header/footer)', () => {
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

  it('v1 double-space before filename verifies correctly', async () => {
    // v1 used two spaces between content_hash and file_path; current spec uses one.
    // Verification must handle both since it hashes everything after "<hash>: ".
    for (const line of detailLines) {
      const fileDetails = line.slice(line.indexOf(': ') + 2);
      expect(fileDetails).toMatch(/[0-9a-fA-F]{64}  /); // double space present
      const result = await verifyFileDetailsLine(line);
      expect(result.valid).toBe(true);
    }
  });
});
