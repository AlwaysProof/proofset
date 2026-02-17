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
  'd0c36edf99a7ea0e9e0459401cbb2191da2130a7cb420c8449a51f8e4b7562d7',
  'a8f88cd6569e5ffcddbfc4905e02586fb82d88f284fec54cd869e0bd8fc2550e',
  'd1cffc21953a7854a9e99ea4e3969ba0c91a57986d40bf4580b7ff30aaaef7e0',
  '71af4a250b03ed4becbc347da32a9accbb20c10327bcc183c2aa5c559bd16f60',
  '6eacbb704099891e675ba07a9209e15844ce95b96d6731c2a7fa713275569291',
  '68c89abc9a75e5a13aaa726201b7bef305aa7e91a44ee68ad57e2b7f89205f20',
];

const expectedFileSecrets = [
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  '2695e12caf1d559b5cbe944c034837bb06751f40472e5d458fc05b69e69f72fb',
  '4f02bb91c30e1c78e4c3f2291dff5fe96f4c3d1a3dbd89f5e22f94bd19a89264',
  '7685db39608c4ede8e044af61842dde58d12dd49f0b10be614242a619548ea86',
  '7e7f3ad7392cd307dd3183ac8ef2ef7cf712f08e0a08608084b9527df99bf78a',
  'df0b7c82d3697240c0d47362de4c0dd87655d2dca63226eede808da31156d656',
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

const expectedHashsetHash = '0c8dd3e854c87df9e2af078792973bdcd2d97b365d61cd1f33c0961efd7a8839';

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
      expect(line).toMatch(/^[0-9a-f]{64}: [0-9a-f]{64} \d{8}-\d{6} [0-9a-f]{64}  .+$/);
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
