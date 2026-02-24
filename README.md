# @alwaysproof/proofset

Create and verify cryptographic proof sets for file integrity -- commit to a set of files with a single hash, then selectively disclose individual files later.

## What It Does

Proofset represents all files in a directory as a single hash value (the **hashset hash**). You publish that one hash as a commitment. Later, you can reveal individual files from the set -- and anyone can verify they belong to the original commitment -- without exposing the rest.

- **Single commitment** -- One hash represents an arbitrary number of files.
- **Selective disclosure** -- Reveal individual files independently, in any order, at any time.
- **Verifiability** -- Anyone can verify a disclosed file belongs to the committed set using only standard hash functions.
- **Simplicity** -- Uses only SHA-256 or SHA-512 and string concatenation. No additional cryptographic primitives.

## Install

```bash
npm install @alwaysproof/proofset
```

Or install globally for CLI use:

```bash
npm install -g @alwaysproof/proofset
```

Also available as `proofset` (re-exports `@alwaysproof/proofset`).

## CLI

### Create a proofset

```bash
proofset create -s ./my-files -o ./output -p mysecret
```

This scans `./my-files`, generates the proofset, and writes two files to `./output`:

- `proofset-details.txt` -- Detail lines for each file (keep private, disclose selectively)
- `proofset-file-details-hash-list.txt` -- Hash list (can be shared publicly)

The **hashset hash** is printed to stdout -- this is the single value you publish.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-s, --source <dir>` | Source files directory | (required) |
| `-o, --output <dir>` | Output directory | `.` |
| `-p, --password <seed>` | Seed password (`-` to prompt securely) | (required unless `--simple`) |
| `--simple` | Create a simple proofset (no password, no selective disclosure) | |
| `--algo <algorithm>` | `sha256` or `sha512` | `sha256` |

### Verify a proofset

```bash
# Verify details file (self-check all detail lines)
proofset verify -d proofset-details.txt

# Verify details against hash list
proofset verify -d proofset-details.txt -a proofset-file-details-hash-list.txt

# Compute hashset hash from hash list
proofset verify -a proofset-file-details-hash-list.txt

# Verify hashset hash matches expected value
proofset verify -a proofset-file-details-hash-list.txt -h ea361143c639...

# Verify a single disclosed detail line
proofset verify -i "23f05dc8...: 07eed9d5... 20260217-003735 ebe2f179... file2.txt"

# Verify a single detail line against the hash list
proofset verify -i "23f05dc8...: 07eed9d5... 20260217-003735 ebe2f179... file2.txt" -a proofset-file-details-hash-list.txt

# Extract hash list from a details file
proofset verify -d proofset-details.txt -x derived-hash-list.txt
```

### Verify file contents

Verify that actual files on disk match the content hashes in detail lines using `-f`:

```bash
# Verify a single detail line against an actual file
proofset verify -i "<detail-line>" -f ./file1.txt

# Verify a details file against a directory of source files (path matching)
proofset verify -d proofset-details.txt -f ./my-files

# Match by content hash instead of path (finds renamed/moved files)
proofset verify -d proofset-details.txt -f ./my-files -m hash

# Show only entries that have a matching file
proofset verify -d proofset-details.txt -f ./my-files --only-matches

# Suppress column headers (for scripting/piping)
proofset verify -d proofset-details.txt -f ./my-files --no-header
```

Path matching (`-m path`, the default) automatically handles both relative and absolute paths in detail lines -- if the path in a detail entry doesn't match directly, progressively shorter suffixes are tried. This means proofsets created with older tools that used absolute paths still work.

**Verify options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-d, --details <file>` | Details file path | |
| `-a, --file-details-hash-list <file>` | File details hash list file path | |
| `-i, --item <line>` | Single detail line to verify | |
| `-h, --hash <hash>` | Expected hashset\_hash to verify against | |
| `-x, --extract-hashes <file>` | Write derived hash list to file (with `-d`) | |
| `-f, --file <path>` | File or directory to verify against content hashes | |
| `-m, --match <mode>` | Match mode for directory `-f`: `path` or `hash` | `path` |
| `--only-matches` | With directory `-f`, show only matching entries | |
| `--no-header` | Suppress column headers (for scripting/piping) | |

## Library API

### Create

```typescript
import { createProofset } from '@alwaysproof/proofset';

async function* myFiles() {
  yield {
    relativePath: 'file1.txt',
    fullPath: 'docs/file1.txt',       // optional -- enables dual-path entries
    modifiedTime: new Date('2026-02-16T23:14:01Z'),
    content: new Uint8Array(buffer),
  };
}

const result = await createProofset(myFiles(), {
  seedPassword: 'mysecret',
  algorithm: 'SHA-256',
});

console.log(result.hashsetHash);          // single commitment hash
console.log(result.fileDetailsLineList);   // detail lines (keep private)
console.log(result.fileDetailsHashList);   // hash list (shareable)
```

### Verify

```typescript
import {
  verifyFileDetailsLine,
  verifyFileDetailsHashInList,
  verifyHashsetHash,
  parseFileDetailsLine,
  verifyFileContentHash,
  matchDetailEntriesByPath,
  matchDetailEntriesByHash,
} from '@alwaysproof/proofset';

// Verify a disclosed detail line
const { valid, fileDetailsHash } = await verifyFileDetailsLine(detailLine);

// Check membership in hash list
const inList = verifyFileDetailsHashInList(fileDetailsHash, hashListContent);

// Verify hashset hash
const hashValid = await verifyHashsetHash(hashListContent, publishedHash);

// Parse a detail line into its fields
const parsed = parseFileDetailsLine(detailLine);
// => { fileDetailsHash, fileSecret, modifiedTimeUtc, fileContentHash, filePath }

// Verify file content against a detail line's content hash
const { match, computedHash } = await verifyFileContentHash(fileBytes, parsed.fileContentHash);

// Match detail entries against files by path (Map of relativePath -> contentHash)
const pathResults = matchDetailEntriesByPath(detailLines, fileContentHashes);

// Match detail entries against files by content hash (Map of hash -> relativePaths[])
const hashResults = matchDetailEntriesByHash(detailLines, hashToFiles);
// Each result: { parsed, status: 'match' | 'mismatch' | 'not_found', computedHash?, matchedFiles? }
```

### Types

```typescript
import type {
  HashAlgorithm,          // 'SHA-256' | 'SHA-512'
  SourceFileEntry,        // { relativePath, fullPath?, modifiedTime, content }
  ProofsetConfig,         // { seedPassword, algorithm }
  ProofsetResult,         // { hashsetHash, fileDetailsHashList, fileDetails, fileDetailsLineList }
  ProofsetFileDetails,    // { fileDetailsHash, fileSecret, modifiedTimeUtc, contentHash, filePath }
  ParsedFileDetailsLine,  // { fileDetailsHash, fileSecret, modifiedTimeUtc, fileContentHash, filePath }
  ContentMatchResult,     // { parsed, status, computedHash?, matchedFiles? }
  ContentMatchStatus,     // 'match' | 'mismatch' | 'not_found'
} from '@alwaysproof/proofset';
```

### Utility functions

```typescript
import {
  hashString,                    // hash a UTF-8 string, returns lowercase hex
  hashBytes,                     // hash raw bytes, returns lowercase hex
  inferAlgorithm,                // infer SHA-256 or SHA-512 from hex length
  extractDetailLines,            // parse detail lines from a details file (handles v1 format)
  buildHashListFromDetailLines,  // build hash list string from detail lines
  isValidHashListFormat,         // validate a string is one hash per line
} from '@alwaysproof/proofset';
```

## Use Cases

- **Intellectual property** -- Commit a hash of your creative work, source code, or research data before sharing it. If ownership is disputed later, disclose individual files to prove they existed at the time of commitment.

- **Legal and compliance** -- Generate a proofset of contract documents, audit records, or evidence files. The hashset hash serves as a tamper-evident seal. Disclose specific documents to counterparties without revealing the full set.

- **Software supply chain** -- Commit to a release artifact set at build time. Downstream consumers can verify that individual files match the original commitment.

- **Blockchain commitment** -- Embed a hashset hash in a blockchain transaction or NFT. The commitment is on-chain and immutable; the file details stay with the creator. Works entirely in the browser -- files and secrets never leave the client.

- **Email commitment** -- Send a hashset hash in an email (BCC yourself). The provider's DKIM signature covers the email body, creating a signed record that the hash existed at send time. Combine with a blockchain commitment of the email hash for layered integrity that survives subsequent key rotation/compromise.

- **Social media predictions** -- Post a hashset hash publicly, then disclose individual items later to prove what you committed to. Useful for prediction games, friendly bets, or "I called it" moments -- the commitment strength matches the informal context.

## Simple Proofsets

When selective disclosure isn't needed and you just want a hash representing a set of files, use `--simple`. This produces a plain text file listing each file's content hash, modified time, and filename. The root hash is SHA-256 (or SHA-512) of the entire file -- equivalent to `cat simple-proofset.txt | sha256sum` or PowerShell's `Get-FileHash simple-proofset.txt`.

No password is required. No secrets, no chaining -- just content hashes and a root hash for the set. The file format is:

```
<content-hash> <modified-time> <filename>\r\n
<content-hash> <modified-time> <filename>\r\n
...
```

```bash
# Create a simple proofset
proofset create --simple -s ./my-files -o ./output

# View the root hash and list entries
proofset verify -d simple-proofset.txt

# Verify file contents against the simple proofset
proofset verify -d simple-proofset.txt -f ./my-files
```

When verifying without `-f`, entries are listed as `UNVERIFIED` -- this means the tool computed the root hash but had no source files to check against. The root hash itself is just `SHA-256(file content)`, so you can independently confirm it with standard tools. The verify command provides a consistent interface for inspecting both simple and full proofsets, and auto-detects the format.

A web app, for example, might produce either format depending on the user's needs -- simple for lightweight file hashing, full for selective disclosure -- and this tool verifies both the same way. It also serves as a reference implementation against which users can confirm results independently using standard OS commands and tools.

## How It Works

1. **Create** -- Hash each file's content, combine with a chained per-file secret, timestamp, and path into a detail string. Hash each detail string to get a `file_details_hash`. Concatenate all hashes into a list, hash the list to get the `hashset_hash`.

2. **Commit** -- Publish only the `hashset_hash` (e.g. on a blockchain, in an email, in a database).

3. **Disclose** -- Share individual detail lines as needed. Anyone can verify `H(file_details) == file_details_hash` and that the hash appears in the published list.

Each file produces two entries: one with the full relative path, one with the filename only. The creator chooses which to disclose based on how much path information they want to reveal.

See [SPEC.md](packages/core/SPEC.md) for the full specification including test vectors.

## Platform Support

Works in Node.js 18+ and browsers. Uses native `crypto.subtle` -- no crypto dependencies.

## License

MIT -- Copyright (c) 2016-2026 Ashley R. Thomas
