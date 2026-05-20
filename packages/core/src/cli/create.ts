// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import {
  createProofset,
  createSimpleProofset,
  buildDetailsFile,
  generateProofsetSeed,
} from '../index.js';
import type { SourceFileEntry, HashAlgorithm } from '../index.js';
import { nodeHasherFactory } from '../hashers/node.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import fg from 'fast-glob';

/**
 * Prompt for a value via @inquirer/password (masked with asterisks).
 * Uses dynamic import to keep the dependency optional at module-load time.
 */
async function promptMasked(message: string): Promise<string> {
  const { default: password } = await import('@inquirer/password');
  return password({ message, mask: '*' });
}

export async function createCommand(options: {
  source: string;
  output: string;
  proofsetSeed?: string;
  password?: string;
  simple?: boolean;
  algo: string;
  // Commander emits `--no-store-seed` as `storeSeed: false` (default true).
  storeSeed?: boolean;
}): Promise<void> {
  const storeSeedInFile = options.storeSeed !== false;
  const sourceDir = path.resolve(options.source);
  const outputDir = path.resolve(options.output);

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  // --password is a deprecated alias for --proofset-seed.
  // If both are supplied, --proofset-seed wins; warn either way when --password is used.
  let seedFlag = options.proofsetSeed;
  if (options.password !== undefined) {
    console.error(
      'warning: --password is deprecated; use --proofset-seed (or -p) instead.',
    );
    if (seedFlag === undefined) seedFlag = options.password;
  }

  if (options.simple && seedFlag !== undefined) {
    console.error('Error: --simple and --proofset-seed cannot be used together.');
    process.exit(1);
  }
  if (options.simple && !storeSeedInFile) {
    console.error('Error: --simple and --no-store-seed cannot be used together.');
    process.exit(1);
  }

  const algorithm: HashAlgorithm = options.algo === 'sha512' ? 'SHA-512' : 'SHA-256';

  // Find all files recursively, sorted for deterministic ordering
  const relativePaths = await fg('**/*', {
    cwd: sourceDir,
    onlyFiles: true,
    dot: false,
  });
  relativePaths.sort();

  if (options.simple) {
    async function* simpleFileEntries(): AsyncIterable<SourceFileEntry> {
      for (const relPath of relativePaths) {
        const fullFilePath = path.join(sourceDir, relPath);
        const stat = fs.statSync(fullFilePath);

        yield {
          relativePath: path.basename(relPath),
          modifiedTime: stat.mtime,
          content: Readable.toWeb(fs.createReadStream(fullFilePath)) as ReadableStream<Uint8Array>,
        };
      }
    }

    const result = await createSimpleProofset(simpleFileEntries(), { algorithm, hasher: nodeHasherFactory });

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'simple-proofset.txt'), result.content);
    console.log(result.hash);
    return;
  }

  // Resolve the seed:
  //   - "-" → prompt securely (masked).
  //   - explicit value → use it.
  //   - omitted → auto-generate a fresh 32-byte hex seed.
  let proofsetSeed: string;
  let seedWasGenerated = false;
  if (seedFlag === '-') {
    proofsetSeed = await promptMasked('Enter proofset_seed:');
    if (!proofsetSeed) {
      console.error('No proofset_seed provided.');
      process.exit(1);
    }
  } else if (seedFlag !== undefined) {
    proofsetSeed = seedFlag;
  } else {
    proofsetSeed = generateProofsetSeed();
    seedWasGenerated = true;
  }

  async function* fileEntries(): AsyncIterable<SourceFileEntry> {
    for (const relPath of relativePaths) {
      const fullFilePath = path.join(sourceDir, relPath);
      const stat = fs.statSync(fullFilePath);

      const fileName = path.basename(relPath);
      yield {
        relativePath: fileName,
        fullPath: relPath.replace(/\//g, '\\'),
        modifiedTime: stat.mtime,
        content: Readable.toWeb(fs.createReadStream(fullFilePath)) as ReadableStream<Uint8Array>,
      };
    }
  }

  const result = await createProofset(fileEntries(), {
    proofsetSeed,
    algorithm,
    hasher: nodeHasherFactory,
  });

  // Build the details file body. By default we record the seed in the preamble.
  // --no-store-seed writes a blank `proofset_seed:` line (documents that a seed
  // was used but is not stored in the file).
  const preambleSeed = !storeSeedInFile ? '' : proofsetSeed;
  const detailsFileBody = buildDetailsFile(result.fileDetailsLineList, {
    proofsetSeed: preambleSeed,
  });

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Write output files
  fs.writeFileSync(path.join(outputDir, 'proofset-details.txt'), detailsFileBody);
  fs.writeFileSync(
    path.join(outputDir, 'proofset-file-details-hash-list.txt'),
    result.fileDetailsHashList,
  );

  // Print seed to stderr if it was auto-generated or omitted from the file,
  // so the user can capture it. Goes to stderr so it doesn't pollute stdout
  // (which carries the hashset_hash for scripting).
  if (seedWasGenerated && storeSeedInFile) {
    console.error(`proofset_seed (auto-generated): ${proofsetSeed}`);
  } else if (!storeSeedInFile) {
    console.error(`proofset_seed (not stored in details file): ${proofsetSeed}`);
  }

  console.log(result.hashsetHash);
}
