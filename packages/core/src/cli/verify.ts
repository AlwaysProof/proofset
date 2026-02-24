// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import {
  verifyFileDetailsLine,
  verifyHashsetHash,
  verifyFileDetailsHashInList,
  extractDetailLines,
  buildHashListFromDetailLines,
  parseFileDetailsLine,
  isValidHashListFormat,
  verifyFileContentHash,
  matchDetailEntriesByPath,
  matchDetailEntriesByHash,
  inferAlgorithm,
  hashBytes,
  isSimpleProofsetFormat,
  extractSimpleProofsetLines,
  parseSimpleProofsetLine,
} from '../index.js';
import type { ContentMatchResult } from '../index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Recursively collect all file paths under a directory. */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/** Normalize a path to forward slashes for cross-platform map keys. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

interface VerifyOptions {
  details?: string;
  fileDetailsHashList?: string;
  item?: string;
  hash?: string;
  extractHashes?: string;
  file?: string;
  match?: string;
  onlyMatches?: boolean;
  header?: boolean;
}

export async function verifyCommand(options: VerifyOptions): Promise<void> {
  try {
    await verifyCommandInner(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

/** A label/value pair for the summary block. */
interface SummaryEntry {
  label: string;
  value: string;
}

/** Build summary entries from content match results. */
function buildContentSummary(results: ContentMatchResult[]): SummaryEntry[] {
  let matches = 0;
  let mismatches = 0;
  let notFound = 0;
  for (const r of results) {
    if (r.status === 'match') matches++;
    else if (r.status === 'mismatch') mismatches++;
    else notFound++;
  }
  const entries: SummaryEntry[] = [];
  entries.push({ label: 'File content matches', value: String(matches) });
  if (mismatches > 0) entries.push({ label: 'File content mismatches', value: String(mismatches) });
  if (notFound > 0) entries.push({ label: 'File content not found', value: String(notFound) });
  return entries;
}

const MIN_DOTS = 3;

/** Print summary block with dot-leader alignment. */
function printSummary(entries: SummaryEntry[]): void {
  if (entries.length === 0) return;

  // Determine total line width: longest label + space + MIN_DOTS + space + longest value
  const maxLabel = Math.max(...entries.map(e => e.label.length));
  const maxValue = Math.max(...entries.map(e => e.value.length));
  const totalWidth = maxLabel + 1 + MIN_DOTS + 1 + maxValue;

  console.log('');
  console.log('--- Summary ---');
  for (const { label, value } of entries) {
    const dotsNeeded = totalWidth - label.length - 1 - 1 - value.length;
    const dots = '.'.repeat(Math.max(MIN_DOTS, dotsNeeded));
    console.log(`${label} ${dots} ${value}`);
  }
}

async function verifyCommandInner(options: VerifyOptions): Promise<void> {
  const { details, fileDetailsHashList: hashListFile, item, hash, extractHashes, file: filePath, match, onlyMatches } = options;
  const noHeader = options.header === false;
  const summary: SummaryEntry[] = [];

  // --- Option conflict detection ---
  if (details && item) {
    console.error('Error: --details (-d) and --item (-i) cannot be used together.');
    console.error('  Use -d to verify a details file, or -i to verify a single detail line.');
    process.exit(1);
  }
  if (extractHashes && !details) {
    console.error('Error: --extract-hashes (-x) requires --details (-d).');
    process.exit(1);
  }
  if (hash && !hashListFile) {
    console.error('Error: --hash (-h) requires --file-details-hash-list (-a).');
    process.exit(1);
  }
  if (filePath && !details && !item) {
    console.error('Error: --file (-f) requires --details (-d) or --item (-i).');
    process.exit(1);
  }
  if (match && !filePath) {
    console.error('Error: --match (-m) requires --file (-f).');
    process.exit(1);
  }
  if (match && match !== 'path' && match !== 'hash') {
    console.error(`Error: --match (-m) must be "path" or "hash", got "${match}".`);
    process.exit(1);
  }

  const matchMode = match ?? 'path';

  // Auto-detect simple proofset when -d is used
  if (details) {
    const detailsContent = fs.readFileSync(path.resolve(details), 'utf-8');
    if (isSimpleProofsetFormat(detailsContent)) {
      // Reject proofset-specific flags with simple format
      if (hashListFile || item || extractHashes) {
        console.error('Error: -a, -i, and -x flags are not applicable to simple proofsets.');
        process.exit(1);
      }

      const lines = extractSimpleProofsetLines(detailsContent);
      if (lines.length === 0) {
        console.error('No entries found in simple proofset file.');
        process.exit(1);
      }

      const firstEntry = parseSimpleProofsetLine(lines[0]);
      const algorithm = inferAlgorithm(firstEntry.contentHash);
      const computed = await hashBytes(new TextEncoder().encode(detailsContent), algorithm);
      console.log(`root_hash: ${computed}`);

      const entries = lines.map(parseSimpleProofsetLine);

      // Build a map of filename -> status when -f is provided
      let fileStatuses: Map<string, { status: 'PASS' | 'FAIL'; computedHash?: string }> | null = null;
      let matches = 0;
      let mismatches = 0;
      let notFound = 0;

      if (filePath) {
        fileStatuses = new Map();
        const resolved = path.resolve(filePath);
        const stat = fs.statSync(resolved);

        if (stat.isFile()) {
          const fileBytes = new Uint8Array(fs.readFileSync(resolved));
          const fileHash = await hashBytes(fileBytes, algorithm);
          for (const entry of entries) {
            const isMatch = fileHash.toLowerCase() === entry.contentHash.toLowerCase();
            fileStatuses.set(entry.fileName, { status: isMatch ? 'PASS' : 'FAIL', computedHash: fileHash });
          }
        } else if (stat.isDirectory()) {
          const allFiles = collectFiles(resolved);
          const fileHashByName = new Map<string, string>();
          for (const absPath of allFiles) {
            const name = path.basename(absPath);
            const fileBytes = new Uint8Array(fs.readFileSync(absPath));
            const h = await hashBytes(fileBytes, algorithm);
            fileHashByName.set(name, h);
          }
          for (const entry of entries) {
            const computedHash = fileHashByName.get(entry.fileName);
            if (computedHash !== undefined) {
              const isMatch = computedHash.toLowerCase() === entry.contentHash.toLowerCase();
              fileStatuses.set(entry.fileName, { status: isMatch ? 'PASS' : 'FAIL', computedHash });
            }
            // not found entries remain absent from the map
          }
        } else {
          console.error(`Error: ${filePath} is not a file or directory.`);
          process.exit(1);
        }
      }

      // Always print per-entry status
      console.log('');
      if (!noHeader) {
        console.log('STATUS       CONTENT_HASH         MODIFIED_TIME    FILE_NAME');
      }
      for (const entry of entries) {
        const truncHash = entry.contentHash.slice(0, 16) + '...';
        let status: string;
        if (!fileStatuses) {
          status = 'UNVERIFIED';
        } else {
          const result = fileStatuses.get(entry.fileName);
          if (!result) {
            status = 'NOT FOUND ';
            notFound++;
          } else if (result.status === 'PASS') {
            status = 'PASS      ';
            matches++;
          } else {
            status = 'FAIL      ';
            mismatches++;
          }
        }
        console.log(`${status}   ${truncHash}  ${entry.modifiedTimeUtc}  ${entry.fileName}`);
        if (fileStatuses && fileStatuses.get(entry.fileName)?.status === 'FAIL') {
          const result = fileStatuses.get(entry.fileName)!;
          console.error(`  expected: ${entry.contentHash}`);
          console.error(`  computed: ${result.computedHash}`);
        }
      }

      const summary: SummaryEntry[] = [];
      summary.push({ label: 'Format', value: 'simple proofset' });
      summary.push({ label: 'Entries', value: String(lines.length) });
      summary.push({ label: 'Algorithm', value: algorithm });
      summary.push({ label: 'Root hash', value: computed });
      if (fileStatuses) {
        summary.push({ label: 'File content matches', value: String(matches) });
        if (mismatches > 0) summary.push({ label: 'File content mismatches', value: String(mismatches) });
        if (notFound > 0) summary.push({ label: 'File content not found', value: String(notFound) });
      }

      printSummary(summary);
      return;
    }
  }

  // Mode 1: Full verify — details file + file-details-hash-list file
  if (details && hashListFile) {
    const detailsContent = fs.readFileSync(path.resolve(details), 'utf-8');
    const fileDetailsHashList = fs.readFileSync(path.resolve(hashListFile), 'utf-8');
    const lines = extractDetailLines(detailsContent);

    if (lines.length === 0) {
      console.error('No detail lines found in file.');
      process.exit(1);
    }

    let allValid = true;
    for (const line of lines) {
      const result = await verifyFileDetailsLine(line);
      if (!result.valid) {
        console.error(`FAIL: ${result.fileDetailsHash}`);
        allValid = false;
      } else {
        const inList = verifyFileDetailsHashInList(result.fileDetailsHash, fileDetailsHashList);
        if (!inList) {
          console.error(`FAIL: file_details_hash not in hash list: ${result.fileDetailsHash}`);
          allValid = false;
        }
      }
    }

    const algorithm = inferAlgorithm(lines[0].split(':')[0]);
    const computed = await hashBytes(new TextEncoder().encode(fileDetailsHashList), algorithm);
    console.log(`hashset_hash: ${computed}`);

    if (!allValid) {
      console.error('Verification FAILED.');
      process.exit(1);
    }

    const validCount = lines.length;
    summary.push({ label: 'Format', value: 'proofset' });
    summary.push({ label: 'Valid file detail entries', value: String(validCount) });

    if (filePath) {
      const results = await runFileContentVerification(lines, filePath, matchMode, onlyMatches ?? false, noHeader ?? false);
      summary.push(...buildContentSummary(results));
    }
    printSummary(summary);
    return;
  }

  // Mode 2: Details-only verify — self-verify details file
  if (details && !hashListFile) {
    const detailsContent = fs.readFileSync(path.resolve(details), 'utf-8');
    const lines = extractDetailLines(detailsContent);

    if (lines.length === 0) {
      console.error('No detail lines found in file.');
      process.exit(1);
    }

    let allValid = true;
    for (const line of lines) {
      const result = await verifyFileDetailsLine(line);
      if (!result.valid) {
        console.error(`FAIL: ${result.fileDetailsHash}`);
        allValid = false;
      }
    }

    const derivedHashList = buildHashListFromDetailLines(lines);
    const algorithm = inferAlgorithm(lines[0].split(':')[0]);
    const computed = await hashBytes(new TextEncoder().encode(derivedHashList), algorithm);
    console.log(`hashset_hash: ${computed}`);

    if (!allValid) {
      console.error('Verification FAILED.');
      process.exit(1);
    }

    const validCount = lines.length;
    summary.push({ label: 'Format', value: 'proofset' });
    summary.push({ label: 'Valid file detail entries', value: String(validCount) });

    if (extractHashes) {
      fs.writeFileSync(path.resolve(extractHashes), derivedHashList);
      console.log(`Hash list written to: ${extractHashes}`);
    }

    if (filePath) {
      const results = await runFileContentVerification(lines, filePath, matchMode, onlyMatches ?? false, noHeader ?? false);
      summary.push(...buildContentSummary(results));
    }
    printSummary(summary);
    return;
  }

  // Mode 3: Single item verify (with or without hash list, with or without file)
  if (item) {
    const result = await verifyFileDetailsLine(item);
    if (!result.valid) {
      console.error(`FAIL: H(file_details) != file_details_hash`);
      process.exit(1);
    }
    console.log(`file_details_hash verified: ${result.fileDetailsHash}`);

    if (hashListFile) {
      const fileDetailsHashList = fs.readFileSync(path.resolve(hashListFile), 'utf-8');
      const inList = verifyFileDetailsHashInList(result.fileDetailsHash, fileDetailsHashList);
      if (!inList) {
        console.error(`FAIL: file_details_hash not found in hash list file`);
        process.exit(1);
      }
      console.log(`file_details_hash found in hash list.`);
    }

    if (filePath) {
      const results = await runFileContentVerification([item], filePath, matchMode, onlyMatches ?? false, noHeader ?? false);
      summary.push(...buildContentSummary(results));
      printSummary(summary);
    }
    return;
  }

  // Mode 4: Hash list only — compute hashset_hash (optionally compare with -h)
  if (hashListFile) {
    const fileDetailsHashList = fs.readFileSync(path.resolve(hashListFile), 'utf-8');

    if (!isValidHashListFormat(fileDetailsHashList)) {
      console.error('Error: Invalid file details hash list — expected one hash per line.');
      console.error('  The file may contain detail lines. Did you mean to use -d instead of -a?');
      console.error('');
      console.error('  Usage: proofset verify -a <hash-list-file>');
      console.error('         proofset verify -d <details-file>');
      process.exit(1);
    }

    const algorithm = inferAlgorithm(fileDetailsHashList.split(/\r?\n/).filter(Boolean)[0]);
    const computed = await hashBytes(new TextEncoder().encode(fileDetailsHashList), algorithm);

    if (hash) {
      const valid = await verifyHashsetHash(fileDetailsHashList, hash);
      if (valid) {
        console.log('Verified: hashset_hash matches file details hash list.');
      } else {
        console.error('FAIL: hashset_hash does not match file details hash list.');
        console.error(`  expected: ${hash}`);
        console.error(`  computed: ${computed}`);
        process.exit(1);
      }
    } else {
      console.log(`hashset_hash: ${computed}`);
    }
    return;
  }

  console.error(
    'Invalid options. Use one of:\n' +
      '  proofset verify -d <details>\n' +
      '  proofset verify -d <details> -a <file-details-hash-list>\n' +
      '  proofset verify -a <file-details-hash-list>\n' +
      '  proofset verify -a <file-details-hash-list> -h <hashset_hash>\n' +
      '  proofset verify -i "<detail-line>"\n' +
      '  proofset verify -i "<detail-line>" -a <file-details-hash-list>\n' +
      '\n' +
      'Add -f <file-or-dir> to verify file contents against detail line hashes.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// File content verification — CLI orchestration + output formatting
// Core logic lives in the library (verifyFileContentHash, matchDetailEntriesByPath,
// matchDetailEntriesByHash). This layer handles filesystem I/O and output.
// ---------------------------------------------------------------------------

/**
 * Orchestrate file content verification: read files, call core match functions, print results.
 */
async function runFileContentVerification(
  detailLines: string[],
  filePath: string,
  matchMode: string,
  onlyMatches: boolean,
  noHeader: boolean,
): Promise<ContentMatchResult[]> {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);

  console.log('');
  if (!noHeader) {
    console.log('--- File content verification ---');
  }

  if (stat.isFile()) {
    return await verifySingleFile(detailLines, resolved, noHeader);
  } else if (stat.isDirectory()) {
    if (matchMode === 'hash') {
      return await verifyDirectoryByHash(detailLines, resolved, onlyMatches, noHeader);
    } else {
      return await verifyDirectoryByPath(detailLines, resolved, onlyMatches, noHeader);
    }
  } else {
    console.error(`Error: ${filePath} is not a file or directory.`);
    process.exit(1);
  }
}

/** Read a single file, verify its content against all detail lines. */
async function verifySingleFile(detailLines: string[], absPath: string, noHeader: boolean): Promise<ContentMatchResult[]> {
  const fileBytes = new Uint8Array(fs.readFileSync(absPath));
  const results: ContentMatchResult[] = [];

  for (const line of detailLines) {
    const parsed = parseFileDetailsLine(line);
    const result = await verifyFileContentHash(fileBytes, parsed.fileContentHash);
    results.push({
      parsed,
      status: result.match ? 'match' : 'mismatch',
      computedHash: result.computedHash,
    });
  }

  printPathMatchResults(results, false, noHeader);
  return results;
}

/** Read all files in a directory, build path->hash map, call core matchDetailEntriesByPath. */
async function verifyDirectoryByPath(
  detailLines: string[],
  dirPath: string,
  onlyMatches: boolean,
  noHeader: boolean,
): Promise<ContentMatchResult[]> {
  const allFiles = collectFiles(dirPath);
  const firstEntry = parseFileDetailsLine(detailLines[0]);
  const algorithm = inferAlgorithm(firstEntry.fileContentHash);

  // Build map: normalized relative path -> computed content hash
  const fileContentHashes = new Map<string, string>();
  for (const absPath of allFiles) {
    const relPath = normalizePath(path.relative(dirPath, absPath));
    const fileBytes = new Uint8Array(fs.readFileSync(absPath));
    const h = await hashBytes(fileBytes, algorithm);
    fileContentHashes.set(relPath, h);
  }

  const results = matchDetailEntriesByPath(detailLines, fileContentHashes);
  printPathMatchResults(results, onlyMatches, noHeader);
  return results;
}

/** Read all files in a directory, build hash->paths map, call core matchDetailEntriesByHash. */
async function verifyDirectoryByHash(
  detailLines: string[],
  dirPath: string,
  onlyMatches: boolean,
  noHeader: boolean,
): Promise<ContentMatchResult[]> {
  const allFiles = collectFiles(dirPath);
  const firstEntry = parseFileDetailsLine(detailLines[0]);
  const algorithm = inferAlgorithm(firstEntry.fileContentHash);

  // Build map: content hash -> relative paths
  const hashToFiles = new Map<string, string[]>();
  console.log(`Hashing ${allFiles.length} file(s) in ${dirPath}...`);

  for (const absPath of allFiles) {
    const relPath = path.relative(dirPath, absPath);
    const fileBytes = new Uint8Array(fs.readFileSync(absPath));
    const h = await hashBytes(fileBytes, algorithm);
    const existing = hashToFiles.get(h) ?? [];
    existing.push(relPath);
    hashToFiles.set(h, existing);
  }

  console.log('');

  const results = matchDetailEntriesByHash(detailLines, hashToFiles);
  printHashMatchResults(results, onlyMatches, noHeader);
  return results;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const HASH_TRUNC = 16;

function printPathMatchResults(results: ContentMatchResult[], onlyMatches: boolean, noHeader: boolean): void {
  if (!noHeader && results.length > 0) {
    console.log('STATUS     DETAILS_HASH         CONTENT_HASH         FILE_PATH');
  }
  for (const r of results) {
    const detailsHash = r.parsed.fileDetailsHash.slice(0, HASH_TRUNC) + '...';
    const contentHash = r.parsed.fileContentHash.slice(0, HASH_TRUNC) + '...';
    switch (r.status) {
      case 'match':
        console.log(`PASS       ${detailsHash}  ${contentHash}  ${r.parsed.filePath}`);
        break;
      case 'mismatch':
        console.error(`FAIL       ${detailsHash}  ${contentHash}  ${r.parsed.filePath}`);
        console.error(`  expected content hash: ${r.parsed.fileContentHash}`);
        console.error(`  computed content hash: ${r.computedHash}`);
        break;
      case 'not_found':
        if (!onlyMatches) {
          console.log(`NOT FOUND  ${detailsHash}  ${contentHash}  ${r.parsed.filePath}`);
        }
        break;
    }
  }
}

function printHashMatchResults(results: ContentMatchResult[], onlyMatches: boolean, noHeader: boolean): void {
  if (!noHeader && results.length > 0) {
    console.log('STATUS     DETAILS_HASH         CONTENT_HASH         FILE_PATH');
  }
  for (const r of results) {
    const detailsHash = r.parsed.fileDetailsHash.slice(0, HASH_TRUNC) + '...';
    const contentHash = r.parsed.fileContentHash.slice(0, HASH_TRUNC) + '...';
    if (r.status === 'match' && r.matchedFiles) {
      console.log(`PASS       ${detailsHash}  ${contentHash}  ${r.parsed.filePath}`);
      for (const f of r.matchedFiles) {
        console.log(`  -> ${f}`);
      }
    } else if (!onlyMatches) {
      console.log(`NOT FOUND  ${detailsHash}  ${contentHash}  ${r.parsed.filePath}`);
      console.log(`  (no matching files)`);
    }
  }
}
