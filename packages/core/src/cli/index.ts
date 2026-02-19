#!/usr/bin/env node

// Copyright (c) 2016–2026 Ashley R. Thomas. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { Command } from 'commander';
import { createCommand } from './create.js';
import { verifyCommand } from './verify.js';

const program = new Command();

program
  .name('proofset')
  .description('Create and verify proofsets — hashset commitment with selective disclosure')
  .version('0.1.0');

program
  .command('create')
  .description('Create a proofset from source files')
  .requiredOption('-s, --source <dir>', 'Source files directory')
  .option('-o, --output <dir>', 'Output directory for hashset files', '.')
  .requiredOption('-p, --password <seed>', 'Seed password (use "-" to prompt securely)')
  .option('--algo <algorithm>', 'Hash algorithm (sha256 or sha512)', 'sha256')
  .action(createCommand);

program
  .command('verify')
  .description('Verify a proofset or individual items')
  .option('-d, --details <file>', 'Details file path')
  .option('-a, --file-details-hash-list <file>', 'File details hash list file path')
  .option('-i, --item <line>', 'Single detail line to verify')
  .option('-h, --hash <hash>', 'Expected hashset_hash to verify against')
  .option('-x, --extract-hashes <file>', 'Write derived hash list to file (with -d)')
  .option('-f, --file <path>', 'File or directory to verify against content hashes')
  .option('-m, --match <mode>', 'Match mode for directory -f: "path" (default) or "hash"')
  .option('--only-matches', 'With directory -f, show only matching entries')
  .option('--no-header', 'Suppress column headers (for scripting/piping)')
  .action(verifyCommand);

program.parse();
