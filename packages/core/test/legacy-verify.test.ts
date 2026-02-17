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

// Regex to extract detail data lines, skipping v1 headers/footers
const DETAIL_LINE_RE = /^[0-9a-fA-F]{64,128}: /;

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

function extractDetailLines(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => DETAIL_LINE_RE.test(line));
}

describe('legacy v1 verification', () => {
  const detailsContent = loadFixture('legacy-details.txt');
  const allDescHashes = loadFixture('legacy-all-desc-hashes.txt');
  const detailLines = extractDetailLines(detailsContent);
  const expectedHashsetHash = '9FAD21B5B294809C2766486CA574546BE153E7CD62E5405FD976A92CA59A2D57';

  it('extracts 6 detail lines from v1 details file (skipping header/footer)', () => {
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
