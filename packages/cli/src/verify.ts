import {
  verifyDetailItem,
  verifyHashsetHash,
  verifyDescHashInList,
  inferAlgorithm,
} from '@proofset/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Matches a detail line: 64 or 128 hex chars, then ": ", then the rest
const DETAIL_LINE_RE = /^[0-9a-fA-F]{64,128}: /;

/** Extract only detail data lines from a details file, skipping v1 headers/footers. */
function extractDetailLines(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => DETAIL_LINE_RE.test(line));
}

export async function verifyCommand(options: {
  details?: string;
  allDescHashes?: string;
  item?: string;
  hash?: string;
}): Promise<void> {
  const { details, allDescHashes: allDescHashesFile, item, hash } = options;

  // Mode 1: Full verify — details file + all-desc-hashes file
  if (details && allDescHashesFile) {
    const detailsContent = fs.readFileSync(path.resolve(details), 'utf-8');
    const allDescHashes = fs.readFileSync(path.resolve(allDescHashesFile), 'utf-8');
    const lines = extractDetailLines(detailsContent);

    if (lines.length === 0) {
      console.error('No detail lines found in file.');
      process.exit(1);
    }

    let allValid = true;
    for (const line of lines) {
      const result = await verifyDetailItem(line);
      if (!result.valid) {
        console.error(`FAIL: ${result.descHash}`);
        allValid = false;
      } else {
        const inList = verifyDescHashInList(result.descHash, allDescHashes);
        if (!inList) {
          console.error(`FAIL: desc_hash not in all-desc-hashes: ${result.descHash}`);
          allValid = false;
        }
      }
    }

    // Compute hashset_hash from all_desc_hashes and display
    const algorithm = inferAlgorithm(lines[0].split(':')[0]);
    const hashBytes = await import('@proofset/core').then((m) =>
      m.hashBytes(new TextEncoder().encode(allDescHashes), algorithm),
    );
    console.log(`hashset_hash: ${hashBytes}`);

    if (allValid) {
      console.log(`Verified: all ${lines.length} detail items valid.`);
    } else {
      console.error('Verification FAILED.');
      process.exit(1);
    }
    return;
  }

  // Mode 2: Single item verify
  if (item && allDescHashesFile) {
    const allDescHashes = fs.readFileSync(path.resolve(allDescHashesFile), 'utf-8');

    const result = await verifyDetailItem(item);
    if (!result.valid) {
      console.error(`FAIL: SHA(hashset_detail_item) != desc_hash`);
      process.exit(1);
    }
    console.log(`desc_hash verified: ${result.descHash}`);

    const inList = verifyDescHashInList(result.descHash, allDescHashes);
    if (!inList) {
      console.error(`FAIL: desc_hash not found in all-desc-hashes file`);
      process.exit(1);
    }
    console.log(`desc_hash found in all-desc-hashes.`);
    return;
  }

  // Mode 3: Hash check — all-desc-hashes file + expected hashset_hash
  if (allDescHashesFile && hash) {
    const allDescHashes = fs.readFileSync(path.resolve(allDescHashesFile), 'utf-8');

    const valid = await verifyHashsetHash(allDescHashes, hash);
    if (valid) {
      console.log('Verified: hashset_hash matches all-desc-hashes.');
    } else {
      console.error('FAIL: hashset_hash does not match all-desc-hashes.');
      process.exit(1);
    }
    return;
  }

  console.error(
    'Invalid options. Use one of:\n' +
      '  proofset verify -d <details> -a <all-desc-hashes>\n' +
      '  proofset verify -i "<detail-line>" -a <all-desc-hashes>\n' +
      '  proofset verify -a <all-desc-hashes> -h <hashset_hash>',
  );
  process.exit(1);
}
