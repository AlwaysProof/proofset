// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { describe, it, expect } from 'vitest';
import { createProofset, verifyFileDetailsLine, verifyHashsetHash, verifyFileDetailsHashInList } from '../src/index.js';
import type { SourceFileEntry } from '../src/index.js';

// Test vectors from `proofset create -s example1/source-files -o example1-output -p abc`
// Same 3 source files as the original spec example, processed with the current tool:
//   - Path mode: relative path + filename only (not v1 absolute paths)
//   - All hashes lowercase
//   - Files in lexicographic order by relative path: dir1\file2.txt, dir1\file3.txt, file1.txt

const file1Content = new TextEncoder().encode('this is file1.txt\r\n');
const file2Content = new TextEncoder().encode('this is file2.txt\r\n');
const file3Content = new TextEncoder().encode('this is file3.txt\r\n');

const file1ModTime = new Date('2026-02-16T23:14:01Z');
const file2ModTime = new Date('2026-02-17T00:37:35Z');
const file3ModTime = new Date('2026-02-17T00:37:40Z');

// Files ordered lexicographically by relative path (as the CLI does)
const testFiles: SourceFileEntry[] = [
  {
    relativePath: 'file2.txt',
    fullPath: 'dir1\\file2.txt',
    modifiedTime: file2ModTime,
    content: file2Content,
  },
  {
    relativePath: 'file3.txt',
    fullPath: 'dir1\\file3.txt',
    modifiedTime: file3ModTime,
    content: file3Content,
  },
  {
    relativePath: 'file1.txt',
    fullPath: 'file1.txt',
    modifiedTime: file1ModTime,
    content: file1Content,
  },
];

async function* iterFiles(files: SourceFileEntry[]): AsyncIterable<SourceFileEntry> {
  for (const f of files) {
    yield f;
  }
}

// Expected values from actual CLI output (all lowercase)
const expectedFileDetailsHashes = [
  '5105d416f19ada8bfae9fa5f4ad6b8c28141fd3317fa48ff41b4774486f50c0c',
  '23f05dc8fc59f8d6114f478cb69657f25bc717590397a18a11afa273ef2131d6',
  'c6f158c7f7cb22ae57b0343ac8b1a6fafc43e1d6a96b5b90a268436e7b86b672',
  'a169a66a1050a5bcdd700ce6f288151e26336da6f763e6d5559166676bf77317',
  '32c6ce33af843d522422174461a29cce4196648e67a557edf1b4df94f72558ac',
  'c9db5d8fe8fd891ca6e6b53ede0383ed6beb8b00430eb135bfeac6d331c0d29a',
];

const expectedFileSecrets = [
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  '07eed9d508eb54bb0dda5a614ede22f0f1d77fb26c1a21add817507cdf2d0340',
  '89775203b482402f793c89a065241b108e6e3250ff1cce93bc06c9764deb92dd',
  '4f17b1ec352a872cacae08646997e12d9194c13fd537f7d33ff3b7124cf24d2e',
  '13de26aca1dd9390225a47a2618d25fe84d08008a5c056942c1595428b185257',
  '62838a696aa2184f9663613c9fda1fdd829fa8ad8752bf90f057f046d3cc46bc',
];

const expectedContentHashes = [
  'ebe2f17920521e0d6a11da34a26c322e7db871a54381fda89522c861a9602fbe',
  'ebe2f17920521e0d6a11da34a26c322e7db871a54381fda89522c861a9602fbe',
  '79c3002f6edeca649b1c1f30ade00cc184320d0a56463d53fd760f0e85ff1642',
  '79c3002f6edeca649b1c1f30ade00cc184320d0a56463d53fd760f0e85ff1642',
  '17aa66d07b0254b8a86e61dd14b8fc0f2b6dd4fb93e545f343ba0604d4a9a5be',
  '17aa66d07b0254b8a86e61dd14b8fc0f2b6dd4fb93e545f343ba0604d4a9a5be',
];

const expectedPaths = [
  'dir1\\file2.txt',
  'file2.txt',
  'dir1\\file3.txt',
  'file3.txt',
  'file1.txt',
  'file1.txt',
];

const expectedHashsetHash = 'ea361143c639c8f51b8a89ce1891c25d8809edd0e406aa1adf319bd169e43e84';

describe('createProofset', () => {
  it('produces correct file_details_hashes for all 6 entries', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    expect(result.fileDetails).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(result.fileDetails[i].fileDetailsHash).toBe(expectedFileDetailsHashes[i]);
    }
  });

  it('produces correct file_secret chain', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    for (let i = 0; i < 6; i++) {
      expect(result.fileDetails[i].fileSecret).toBe(expectedFileSecrets[i]);
    }
  });

  it('produces correct content hashes (all lowercase)', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    for (let i = 0; i < 6; i++) {
      expect(result.fileDetails[i].contentHash).toBe(expectedContentHashes[i]);
    }
  });

  it('produces correct file paths', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    for (let i = 0; i < 6; i++) {
      expect(result.fileDetails[i].filePath).toBe(expectedPaths[i]);
    }
  });

  it('produces correct hashset_hash', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    expect(result.hashsetHash).toBe(expectedHashsetHash);
  });

  it('produces correct file_details_hash_list with \\r\\n terminators', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    const expected = expectedFileDetailsHashes.map((h) => h + '\r\n').join('');
    expect(result.fileDetailsHashList).toBe(expected);
  });

  it('fileDetailsLineList contains properly formatted lines (all lowercase hex)', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    const lines = result.fileDetailsLineList.trimEnd().split('\r\n');
    expect(lines).toHaveLength(6);
    for (const line of lines) {
      expect(line).toMatch(/^[0-9a-f]{64}: [0-9a-f]{64} \d{8}-\d{6} [0-9a-f]{64} .+$/);
    }
  });

  it('works with single-path entries (no fullPath)', async () => {
    const filesNoFull: SourceFileEntry[] = testFiles.map((f) => ({
      relativePath: f.relativePath,
      modifiedTime: f.modifiedTime,
      content: f.content,
    }));

    const result = await createProofset(iterFiles(filesNoFull), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    expect(result.fileDetails).toHaveLength(3);
  });
});

describe('verification', () => {
  it('verifyFileDetailsLine validates correct detail lines', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    const lines = result.fileDetailsLineList.trimEnd().split('\r\n');
    for (const line of lines) {
      const verification = await verifyFileDetailsLine(line);
      expect(verification.valid).toBe(true);
    }
  });

  it('verifyFileDetailsLine detects tampered detail lines', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    const lines = result.fileDetailsLineList.trimEnd().split('\r\n');
    const tampered = lines[0].slice(0, -5) + 'XXXXX';
    const verification = await verifyFileDetailsLine(tampered);
    expect(verification.valid).toBe(false);
  });

  it('verifyHashsetHash validates correct hashset_hash', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    const valid = await verifyHashsetHash(result.fileDetailsHashList, result.hashsetHash);
    expect(valid).toBe(true);
  });

  it('verifyHashsetHash rejects wrong hashset_hash', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    const valid = await verifyHashsetHash(result.fileDetailsHashList, 'deadbeef'.repeat(8));
    expect(valid).toBe(false);
  });

  it('verifyFileDetailsHashInList finds existing file_details_hash', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    for (const detail of result.fileDetails) {
      expect(verifyFileDetailsHashInList(detail.fileDetailsHash, result.fileDetailsHashList)).toBe(true);
    }
  });

  it('verifyFileDetailsHashInList rejects missing file_details_hash', async () => {
    const result = await createProofset(iterFiles(testFiles), {
      seedPassword: 'abc',
      algorithm: 'SHA-256',
    });

    expect(verifyFileDetailsHashInList('deadbeef'.repeat(8), result.fileDetailsHashList)).toBe(false);
  });
});
