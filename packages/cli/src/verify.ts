import {
  verifyFileDetailsLine,
  verifyHashsetHash,
  verifyFileDetailsHashInList,
  inferAlgorithm,
  hashBytes,
} from '@proofset/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Matches a detail line: 64 or 128 hex chars, then ": ", then the rest
const DETAIL_LINE_RE = /^[0-9a-fA-F]{64,128}: /;

/** Extract only file_details_lines from a details file, skipping v1 headers/footers. */
function extractDetailLines(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => DETAIL_LINE_RE.test(line));
}

/** Build a file_details_hash_list from detail lines (hashes joined with \r\n). */
function buildHashListFromDetailLines(lines: string[]): string {
  return lines.map((line) => line.split(': ')[0]).join('\r\n') + '\r\n';
}

export async function verifyCommand(options: {
  details?: string;
  fileDetailsHashList?: string;
  item?: string;
  hash?: string;
  extractHashes?: string;
}): Promise<void> {
  const { details, fileDetailsHashList: hashListFile, item, hash, extractHashes } = options;

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

    // Compute hashset_hash from file_details_hash_list and display
    const algorithm = inferAlgorithm(lines[0].split(':')[0]);
    const computed = await hashBytes(new TextEncoder().encode(fileDetailsHashList), algorithm);
    console.log(`hashset_hash: ${computed}`);

    if (allValid) {
      console.log(`Verified: all ${lines.length} detail items valid.`);
    } else {
      console.error('Verification FAILED.');
      process.exit(1);
    }
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

    // Derive hash list from detail lines and compute hashset_hash
    const derivedHashList = buildHashListFromDetailLines(lines);
    const algorithm = inferAlgorithm(lines[0].split(':')[0]);
    const computed = await hashBytes(new TextEncoder().encode(derivedHashList), algorithm);
    console.log(`hashset_hash: ${computed}`);

    if (allValid) {
      console.log(`Verified: all ${lines.length} detail items valid.`);
    } else {
      console.error('Verification FAILED.');
      process.exit(1);
    }

    // Optionally extract the hash list to a file
    if (extractHashes) {
      fs.writeFileSync(path.resolve(extractHashes), derivedHashList);
      console.log(`Hash list written to: ${extractHashes}`);
    }
    return;
  }

  // Mode 3: Single item verify (with or without hash list)
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
    return;
  }

  // Mode 4: Hash list only — compute hashset_hash (optionally compare with -h)
  if (hashListFile) {
    const fileDetailsHashList = fs.readFileSync(path.resolve(hashListFile), 'utf-8');
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
      '  proofset verify -i "<detail-line>" -a <file-details-hash-list>',
  );
  process.exit(1);
}
