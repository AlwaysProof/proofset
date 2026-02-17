import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyDetailItem,
  verifyHashsetHash,
  verifyDescHashInList,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('new format fixture verification', () => {
  const detailsContent = loadFixture('new-details.txt');
  const allDescHashes = loadFixture('new-all-desc-hashes.txt');
  const detailLines = detailsContent.split(/\r?\n/).filter(Boolean);
  const expectedHashsetHash = '0c8dd3e854c87df9e2af078792973bdcd2d97b365d61cd1f33c0961efd7a8839';

  it('has 6 detail lines (no headers/footers)', () => {
    expect(detailLines).toHaveLength(6);
  });

  it('each detail line verifies: SHA(hashset_detail_item) == desc_hash', async () => {
    for (const line of detailLines) {
      const result = await verifyDetailItem(line);
      expect(result.valid).toBe(true);
    }
  });

  it('each desc_hash exists in the all-desc-hashes file', () => {
    for (const line of detailLines) {
      const descHash = line.split(': ')[0];
      expect(verifyDescHashInList(descHash, allDescHashes)).toBe(true);
    }
  });

  it('hashset_hash matches all-desc-hashes', async () => {
    const valid = await verifyHashsetHash(allDescHashes, expectedHashsetHash);
    expect(valid).toBe(true);
  });
});
