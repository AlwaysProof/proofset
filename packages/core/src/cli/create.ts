// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { createProofset } from '../index.js';
import type { SourceFileEntry, HashAlgorithm } from '../index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import fg from 'fast-glob';

function promptPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    // Disable echo by writing ANSI escape to hide input
    process.stderr.write('Seed password: ');
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    let password = '';
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    const onData = (ch: string) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', onData);
        process.stderr.write('\n');
        rl.close();
        resolve(password);
      } else if (ch === '\u0003') {
        // Ctrl+C
        rl.close();
        reject(new Error('Aborted'));
      } else if (ch === '\u007f' || ch === '\b') {
        // Backspace
        password = password.slice(0, -1);
      } else {
        password += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

export async function createCommand(options: {
  source: string;
  output: string;
  password: string;
  algo: string;
}): Promise<void> {
  const sourceDir = path.resolve(options.source);
  const outputDir = path.resolve(options.output);

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  let seedPassword = options.password;
  if (seedPassword === '-') {
    seedPassword = await promptPassword();
    if (!seedPassword) {
      console.error('No password provided.');
      process.exit(1);
    }
  }

  const algorithm: HashAlgorithm = options.algo === 'sha512' ? 'SHA-512' : 'SHA-256';

  // Find all files recursively, sorted for deterministic ordering
  const relativePaths = await fg('**/*', {
    cwd: sourceDir,
    onlyFiles: true,
    dot: false,
  });
  relativePaths.sort();

  async function* fileEntries(): AsyncIterable<SourceFileEntry> {
    for (const relPath of relativePaths) {
      const fullPath = path.join(sourceDir, relPath);
      const stat = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath);

      const fileName = path.basename(relPath);
      yield {
        relativePath: fileName,
        fullPath: relPath.replace(/\//g, '\\'),
        modifiedTime: stat.mtime,
        content: new Uint8Array(content),
      };
    }
  }

  const result = await createProofset(fileEntries(), {
    seedPassword,
    algorithm,
  });

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Write output files
  fs.writeFileSync(
    path.join(outputDir, 'proofset-details.txt'),
    result.fileDetailsLineList,
  );
  fs.writeFileSync(
    path.join(outputDir, 'proofset-file-details-hash-list.txt'),
    result.fileDetailsHashList,
  );

  console.log(result.hashsetHash);
}
