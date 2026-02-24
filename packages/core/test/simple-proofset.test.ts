import { describe, it, expect } from 'vitest';
import {
  createSimpleProofset,
  isSimpleProofsetFormat,
  parseSimpleProofsetLine,
  extractSimpleProofsetLines,
  verifySimpleProofsetHash,
  hashBytes,
} from '../src/index.js';
import type { SourceFileEntry } from '../src/index.js';

// Helper to create a SourceFileEntry from string content
function makeEntry(name: string, content: string, date: Date): SourceFileEntry {
  return {
    relativePath: name,
    modifiedTime: date,
    content: new TextEncoder().encode(content),
  };
}

describe('createSimpleProofset', () => {
  it('produces expected format with \\r\\n endings', async () => {
    const date = new Date('2026-01-15T10:30:00Z');
    async function* files(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('hello.txt', 'Hello, world!', date);
      yield makeEntry('readme.md', 'README content', date);
    }

    const result = await createSimpleProofset(files(), { algorithm: 'SHA-256' });

    expect(result.entries).toHaveLength(2);
    expect(result.content).toContain('\r\n');
    expect(result.content.endsWith('\r\n')).toBe(true);

    // Each line has 2 space-separated fields: hash + filename
    const lines = result.content.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parts = line.split(' ');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      // Content hash is 64 hex chars (SHA-256)
      expect(parts[0]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('root hash is deterministic', async () => {
    const date = new Date('2026-01-15T10:30:00Z');
    async function* files(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('file.txt', 'test content', date);
    }

    const result1 = await createSimpleProofset(files(), { algorithm: 'SHA-256' });

    // Run again with same inputs
    async function* files2(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('file.txt', 'test content', date);
    }
    const result2 = await createSimpleProofset(files2(), { algorithm: 'SHA-256' });

    expect(result1.hash).toBe(result2.hash);
    expect(result1.content).toBe(result2.content);
  });

  it('root hash is deterministic across different timestamps', async () => {
    const date1 = new Date('2026-01-15T10:30:00Z');
    async function* files1(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('file.txt', 'test content', date1);
    }

    const date2 = new Date('2025-06-01T00:00:00Z');
    async function* files2(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('file.txt', 'test content', date2);
    }

    const result1 = await createSimpleProofset(files1(), { algorithm: 'SHA-256' });
    const result2 = await createSimpleProofset(files2(), { algorithm: 'SHA-256' });

    expect(result1.hash).toBe(result2.hash);
    expect(result1.content).toBe(result2.content);
  });

  it('root hash matches SHA-256 of content', async () => {
    const date = new Date('2026-01-15T10:30:00Z');
    async function* files(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('file.txt', 'test content', date);
    }

    const result = await createSimpleProofset(files(), { algorithm: 'SHA-256' });
    const expectedHash = await hashBytes(new TextEncoder().encode(result.content), 'SHA-256');
    expect(result.hash).toBe(expectedHash);
  });

  it('works with SHA-512', async () => {
    const date = new Date('2026-01-15T10:30:00Z');
    async function* files(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('file.txt', 'test content', date);
    }

    const result = await createSimpleProofset(files(), { algorithm: 'SHA-512' });
    expect(result.hash).toMatch(/^[0-9a-f]{128}$/);
    expect(result.entries[0].contentHash).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe('isSimpleProofsetFormat', () => {
  it('identifies simple proofset format', () => {
    const simple = 'a'.repeat(64) + ' hello.txt\r\n';
    expect(isSimpleProofsetFormat(simple)).toBe(true);
  });

  it('rejects standard proofset format', () => {
    const standard = 'a'.repeat(64) + ': ' + 'b'.repeat(64) + ' 20260115-103000 ' + 'c'.repeat(64) + ' file.txt\r\n';
    expect(isSimpleProofsetFormat(standard)).toBe(false);
  });

  it('rejects empty content', () => {
    expect(isSimpleProofsetFormat('')).toBe(false);
  });

  it('identifies SHA-512 simple proofset', () => {
    const simple = 'a'.repeat(128) + ' hello.txt\r\n';
    expect(isSimpleProofsetFormat(simple)).toBe(true);
  });
});

describe('parseSimpleProofsetLine', () => {
  it('parses a simple line correctly', () => {
    const hash = 'a'.repeat(64);
    const line = `${hash} myfile.txt`;
    const entry = parseSimpleProofsetLine(line);
    expect(entry.contentHash).toBe(hash);
    expect(entry.fileName).toBe('myfile.txt');
  });

  it('handles filenames with spaces', () => {
    const hash = 'b'.repeat(64);
    const line = `${hash} my file name.txt`;
    const entry = parseSimpleProofsetLine(line);
    expect(entry.contentHash).toBe(hash);
    expect(entry.fileName).toBe('my file name.txt');
  });

  it('throws on invalid line', () => {
    expect(() => parseSimpleProofsetLine('invalid')).toThrow();
  });
});

describe('extractSimpleProofsetLines', () => {
  it('extracts non-empty lines', () => {
    const content = 'line1\r\nline2\r\n\r\n';
    const lines = extractSimpleProofsetLines(content);
    expect(lines).toEqual(['line1', 'line2']);
  });

  it('handles \\n line endings', () => {
    const content = 'line1\nline2\n';
    const lines = extractSimpleProofsetLines(content);
    expect(lines).toEqual(['line1', 'line2']);
  });
});

describe('verifySimpleProofsetHash', () => {
  it('validates correct root hash', async () => {
    const content = 'a'.repeat(64) + ' file.txt\r\n';
    const hash = await hashBytes(new TextEncoder().encode(content), 'SHA-256');
    expect(await verifySimpleProofsetHash(content, hash)).toBe(true);
  });

  it('rejects wrong hash', async () => {
    const content = 'a'.repeat(64) + ' file.txt\r\n';
    const wrongHash = 'f'.repeat(64);
    expect(await verifySimpleProofsetHash(content, wrongHash)).toBe(false);
  });

  it('compares case-insensitively', async () => {
    const content = 'a'.repeat(64) + ' file.txt\r\n';
    const hash = await hashBytes(new TextEncoder().encode(content), 'SHA-256');
    expect(await verifySimpleProofsetHash(content, hash.toUpperCase())).toBe(true);
  });
});

describe('round-trip: create then verify', () => {
  it('verifies a created simple proofset', async () => {
    const date = new Date('2026-01-15T10:30:00Z');
    async function* files(): AsyncIterable<SourceFileEntry> {
      yield makeEntry('hello.txt', 'Hello, world!', date);
      yield makeEntry('readme.md', 'README content', date);
    }

    const result = await createSimpleProofset(files(), { algorithm: 'SHA-256' });

    // Verify format detection
    expect(isSimpleProofsetFormat(result.content)).toBe(true);

    // Verify root hash
    expect(await verifySimpleProofsetHash(result.content, result.hash)).toBe(true);

    // Verify each line parses
    const lines = extractSimpleProofsetLines(result.content);
    expect(lines).toHaveLength(2);
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseSimpleProofsetLine(lines[i]);
      expect(parsed.contentHash).toBe(result.entries[i].contentHash);
      expect(parsed.fileName).toBe(result.entries[i].fileName);
    }
  });
});
