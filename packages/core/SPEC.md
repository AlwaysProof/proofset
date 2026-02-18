# Proofset Specification

**Version:** 1.0-draft
**Status:** Draft
**Based on:** GetFileHashesForPublish v1 proof-of-concept (2016--2026)

## 1. Introduction

Proofset is a scheme for representing all files in a directory as a single hash value (the **hashset hash**). The hashset hash can be published or stored (e.g. on a blockchain, in an email, in a database) as a compact commitment. At any later time, the creator can selectively disclose individual files from the set without revealing the rest.

### 1.1 Design Goals

- **Single commitment** -- One hash represents an arbitrary number of files.
- **Selective disclosure** -- Individual file attestations can be revealed independently, in any order, at any time.
- **Verifiability** -- Anyone can verify that a disclosed item belongs to the committed set using only standard hash functions.
- **Simplicity** -- The scheme uses only a hash function (SHA-256 or SHA-512) and string concatenation. No additional cryptographic primitives are required.

### 1.2 Terminology

| Term | Definition |
|------|------------|
| **H(x)** | The chosen hash function (SHA-256 or SHA-512) applied to the UTF-8 encoding of *x*. |
| **source file** | A file in the input directory to be committed. |
| **seed password** | A secret string used to initialize the chained per-file secret. |
| **file\_secret** | A per-entry chained secret derived from the seed password and prior entries. Hex-encoded, **lowercase**. |
| **file\_content\_hash** | The hash of the raw file bytes. Hex-encoded, **UPPERCASE**. |
| **file\_modified\_time\_utc** | The file's last-modified time in UTC, formatted as `YYYYMMDD-hhmmss`. |
| **file\_details** | The concatenation of all per-entry fields for a single entry (defined in [Section 2.2](#22-file-details-hash)). |
| **file\_details\_hash** | `H(file_details)` -- the hash of one entry's detail string. Hex-encoded, **lowercase**. |
| **file\_details\_line** | The string `<file_details_hash>: <file_details>` -- a single entry in the details file. |
| **file\_details\_line\_list** | The concatenation of every file\_details\_line, each terminated by `\r\n`. This is the content of the details file. |
| **file\_details\_hash\_list** | The concatenation of every file\_details\_hash, each terminated by `\r\n`. |
| **hashset\_hash** | `H(file_details_hash_list)` -- the single commitment hash for the entire file set. Hex-encoded, **UPPERCASE**. |

> **Notation:** `a ‖ b` denotes byte-level concatenation. `SP` denotes a single ASCII space (`0x20`). All hex encoding uses ASCII characters with no `0x` prefix.

## 2. Algorithm

All operations within a single proofset use the same hash algorithm. SHA-256 and SHA-512 are supported.

### 2.1 Per-File Secret Chaining

The `file_secret` is a chained value that links entries together:

```
file_secret[0] = H(seed_password)                                           -- lowercase hex
file_secret[i] = H(seed_password ‖ file_secret[i-1] ‖ file_details_hash[i-1])  -- lowercase hex
```

Each file may produce one or two entries (see [Section 2.4](#24-path-variants)). The chain advances **per entry**, not per file.

### 2.2 File Details Hash

For each entry, a `file_details` string is constructed by concatenating the entry's fields with specific delimiters:

```
file_details = file_secret ‖ SP ‖ file_modified_time_utc ‖ SP ‖ file_content_hash ‖ SP ‖ file_path
```

The file details hash is then:

```
file_details_hash = H(file_details)    -- lowercase hex
```

All fields are separated by a single space.

> **v1 note:** The v1 proof-of-concept used **two** spaces between `file_content_hash` and `file_path`. Verification is unaffected — the verifier hashes the entire `file_details` string as-is, so both single-space and double-space detail lines verify correctly.

### 2.3 Hashset Hash

After all entries are processed, their file\_details\_hash values are concatenated with `\r\n` (CR LF, bytes `0x0D 0x0A`) terminators to form the `file_details_hash_list`:

```
file_details_hash_list = file_details_hash[0] ‖ "\r\n" ‖ file_details_hash[1] ‖ "\r\n" ‖ ... ‖ file_details_hash[N-1] ‖ "\r\n"
```

The hashset hash is computed over the **raw bytes** of this string:

```
hashset_hash = H(file_details_hash_list)    -- UPPERCASE hex
```

### 2.4 Path Variants

Each source file is processed as two entries with different `file_path` values:

| Entry | `file_path` value | Purpose |
|-------|-------------------|---------|
| First | Relative path from source root (e.g. `dir1\file2.txt`) | Disclose file identity including directory structure |
| Second | Filename only (e.g. `file2.txt`) | Disclose file identity without revealing directory structure |

Both entries share the same `file_content_hash` and `file_modified_time_utc`, but each gets its own `file_secret` and `file_details_hash` (the chain advances for each entry).

The creator chooses which entry to disclose based on how much path information they wish to reveal. The filename-only entry must always be present to support minimal-disclosure scenarios.

> **v1 note:** The v1 proof-of-concept used the absolute filesystem path (e.g. `C:\example1\source-files\file1.txt`) as the first entry instead of a relative path. See [Section 8](#8-compatibility).

### 2.5 Hex Encoding

All hex-encoded values are **lowercase**. For example, a SHA-256 hash is 64 lowercase hex characters: `ba7816bf8f01cfea...`

Verification is case-insensitive -- verifiers should compare hashes using case-insensitive comparison to interoperate with v1 files that used mixed casing (UPPERCASE for `file_content_hash` and `hashset_hash`, lowercase for the rest).

> **v1 note:** The mixed casing in v1 was an artifact of the original proof-of-concept, not a design choice. Since casing is irrelevant to verification (the verifier hashes the detail string as-is), this spec standardizes on lowercase for simplicity.

## 3. Output Files

A proofset produces two output files:

### 3.1 Details File

Contains the `file_details_line_list` -- one `file_details_line` per entry in the format:

```
<file_details_hash>: <file_details>
```

This file is kept **private** by the creator. Individual lines can be selectively disclosed.

### 3.2 File Details Hash List File

Contains the `file_details_hash_list` -- only the file\_details\_hash values, one per line with `\r\n` terminators. This file can be shared publicly to allow verifiers to confirm the hashset\_hash, without revealing any detail about individual entries.

## 4. Verification

Verification can be performed at three levels. The algorithm can be inferred from hex string length: 64 characters implies SHA-256, 128 characters implies SHA-512.

### 4.1 Hashset Hash Verification

Given `file_details_hash_list` and a published `hashset_hash`:

```
verify: H(file_details_hash_list) == hashset_hash
```

This confirms the file details hash list file is the basis of the published commitment.

### 4.2 Single Item Verification

Given a disclosed `file_details_line` (`<file_details_hash>: <file_details>`) and the file details hash list file:

1. Verify the file\_details\_hash: `H(file_details) == file_details_hash`
2. Verify membership: `file_details_hash` appears in `file_details_hash_list`

This confirms the disclosed item was part of the original committed set.

### 4.3 Full Verification

Given both output files:

1. For each file\_details\_line, verify `H(file_details) == file_details_hash`
2. For each file\_details\_hash, verify it appears in the file details hash list file
3. Compute `H(file_details_hash_list)` to obtain the hashset\_hash

## 5. Selective Disclosure Workflow

1. **Commit** -- The creator generates the proofset and publishes only the `hashset_hash` (e.g. to a blockchain or timestamped record).

2. **Reveal list** -- When ready, the creator shares the `file_details_hash_list`. The public can verify `H(file_details_hash_list) == hashset_hash` and can see how many entries exist, but learns nothing about their content.

3. **Disclose items** -- The creator shares individual file\_details\_lines as needed. For each, the public can verify `H(file_details) == file_details_hash` and confirm the file\_details\_hash is in the list. The creator may also share the actual file contents for independent content hash verification.

## 6. Test Vectors

### 6.1 Parameters

- **Algorithm:** SHA-256
- **Seed password:** `abc`
- **Path mode:** Relative path + filename only (current default)
- **File ordering:** Lexicographic by relative path
- **Source files:**

| File | Relative Path | Content (hex) | Modified Time (UTC) |
|------|---------------|---------------|---------------------|
| file2.txt | `dir1\file2.txt` | `74 68 69 73 20 69 73 20 66 69 6C 65 32 2E 74 78 74 0D 0A` | 2026-02-17 00:37:35 |
| file3.txt | `dir1\file3.txt` | `74 68 69 73 20 69 73 20 66 69 6C 65 33 2E 74 78 74 0D 0A` | 2026-02-17 00:37:40 |
| file1.txt | `file1.txt` | `74 68 69 73 20 69 73 20 66 69 6C 65 31 2E 74 78 74 0D 0A` | 2026-02-16 23:14:01 |

Each file's content is the text `this is fileN.txt` followed by `\r\n` (19 bytes).

Generated with: `proofset create -s example1/source-files -o example1-output -p abc`

### 6.2 Expected Detail Entries

| # | file\_details\_hash | file\_secret | modified\_time\_utc | file\_content\_hash | file\_path |
|---|-----------|-------------------|--------------------|--------------------|-----------|
| 0 | `5105d416...0c0c` | `ba7816bf...0015ad` | `20260217-003735` | `ebe2f179...02fbe` | `dir1\file2.txt` |
| 1 | `23f05dc8...31d6` | `07eed9d5...d0340` | `20260217-003735` | `ebe2f179...02fbe` | `file2.txt` |
| 2 | `c6f158c7...b672` | `89775203...92dd` | `20260217-003740` | `79c3002f...f1642` | `dir1\file3.txt` |
| 3 | `a169a66a...7317` | `4f17b1ec...4d2e` | `20260217-003740` | `79c3002f...f1642` | `file3.txt` |
| 4 | `32c6ce33...58ac` | `13de26ac...5257` | `20260216-231401` | `17aa66d0...a5be` | `file1.txt` |
| 5 | `c9db5d8f...d29a` | `62838a69...46bc` | `20260216-231401` | `17aa66d0...a5be` | `file1.txt` |

### 6.3 Expected Hashset Hash

```
hashset_hash = ea361143c639c8f51b8a89ce1891c25d8809edd0e406aa1adf319bd169e43e84
```

### 6.4 Full Test Vector Values

<details>
<summary>Click to expand full-length hashes</summary>

**Entry 0:**
```
file_details_hash:         5105d416f19ada8bfae9fa5f4ad6b8c28141fd3317fa48ff41b4774486f50c0c
file_secret:  ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
file_content_hash: ebe2f17920521e0d6a11da34a26c322e7db871a54381fda89522c861a9602fbe
file_path:         dir1\file2.txt
```

**Entry 1:**
```
file_details_hash:         23f05dc8fc59f8d6114f478cb69657f25bc717590397a18a11afa273ef2131d6
file_secret:  07eed9d508eb54bb0dda5a614ede22f0f1d77fb26c1a21add817507cdf2d0340
file_content_hash: ebe2f17920521e0d6a11da34a26c322e7db871a54381fda89522c861a9602fbe
file_path:         file2.txt
```

**Entry 2:**
```
file_details_hash:         c6f158c7f7cb22ae57b0343ac8b1a6fafc43e1d6a96b5b90a268436e7b86b672
file_secret:  89775203b482402f793c89a065241b108e6e3250ff1cce93bc06c9764deb92dd
file_content_hash: 79c3002f6edeca649b1c1f30ade00cc184320d0a56463d53fd760f0e85ff1642
file_path:         dir1\file3.txt
```

**Entry 3:**
```
file_details_hash:         a169a66a1050a5bcdd700ce6f288151e26336da6f763e6d5559166676bf77317
file_secret:  4f17b1ec352a872cacae08646997e12d9194c13fd537f7d33ff3b7124cf24d2e
file_content_hash: 79c3002f6edeca649b1c1f30ade00cc184320d0a56463d53fd760f0e85ff1642
file_path:         file3.txt
```

**Entry 4:**
```
file_details_hash:         32c6ce33af843d522422174461a29cce4196648e67a557edf1b4df94f72558ac
file_secret:  13de26aca1dd9390225a47a2618d25fe84d08008a5c056942c1595428b185257
file_content_hash: 17aa66d07b0254b8a86e61dd14b8fc0f2b6dd4fb93e545f343ba0604d4a9a5be
file_path:         file1.txt
```

**Entry 5:**
```
file_details_hash:         c9db5d8fe8fd891ca6e6b53ede0383ed6beb8b00430eb135bfeac6d331c0d29a
file_secret:  62838a696aa2184f9663613c9fda1fdd829fa8ad8752bf90f057f046d3cc46bc
file_content_hash: 17aa66d07b0254b8a86e61dd14b8fc0f2b6dd4fb93e545f343ba0604d4a9a5be
file_path:         file1.txt
```

**file\_details\_hash\_list** (each line terminated with `\r\n`):
```
5105d416f19ada8bfae9fa5f4ad6b8c28141fd3317fa48ff41b4774486f50c0c
23f05dc8fc59f8d6114f478cb69657f25bc717590397a18a11afa273ef2131d6
c6f158c7f7cb22ae57b0343ac8b1a6fafc43e1d6a96b5b90a268436e7b86b672
a169a66a1050a5bcdd700ce6f288151e26336da6f763e6d5559166676bf77317
32c6ce33af843d522422174461a29cce4196648e67a557edf1b4df94f72558ac
c9db5d8fe8fd891ca6e6b53ede0383ed6beb8b00430eb135bfeac6d331c0d29a
```

**hashset\_hash:**
```
ea361143c639c8f51b8a89ce1891c25d8809edd0e406aa1adf319bd169e43e84
```

</details>

## 7. Security Considerations

- **Seed password strength** -- The seed password is hashed with a single invocation of H to derive the initial `file_secret`. A weak seed password could be brute-forced if any file\_details\_lines are disclosed. Consider using a high-entropy password or a key derivation function (e.g. PBKDF2, Argon2) in future versions.

- **File ordering** -- The hashset\_hash depends on the order in which files are processed. Implementations must define a deterministic ordering (e.g. lexicographic sort of relative paths) to ensure reproducibility.

- **Secret chaining** -- Disclosing a `file_secret` for one entry does not reveal the secret for other entries, provided the seed password remains confidential. However, disclosing the seed password and any file\_details\_line allows computing all subsequent secrets in the chain.

- **Timestamp trust** -- The `file_modified_time_utc` is taken from the filesystem and is not independently verified. It reflects what the creator's system reported at generation time.

## 8. Compatibility

### 8.1 v1 Proof-of-Concept

The v1 PoC (GetFileHashesForPublish.ps1) produces a details file with additional header and footer lines:

```
SHA256:
HashOfContentHashPath: PerFileUniqueValue ModifiedUtc HashOfContent Path
<detail lines...>
--- Summary ---
<summary lines...>
```

Implementations should ignore non-detail lines when parsing v1 detail files. The file details hash list file format is unchanged between v1 and this specification.

### 8.2 v1 Path Behavior

In v1, the two path entries per file are:

| Entry | v1 | Current spec |
|-------|----|--------------|
| First | Absolute filesystem path (e.g. `C:\example1\source-files\dir1\file2.txt`) | Relative path from source root (e.g. `dir1\file2.txt`) |
| Second | Filename only (e.g. `file2.txt`) | Filename only (e.g. `file2.txt`) -- unchanged |

The filename-only entry is identical in both versions. Verification is path-agnostic -- the verifier hashes whatever string appears in the detail line, so v1 and current detail files verify with the same logic.
