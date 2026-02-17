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
| **file\_desc\_secret** | A per-entry chained secret derived from the seed password and prior entries. Hex-encoded, **lowercase**. |
| **file\_content\_hash** | The hash of the raw file bytes. Hex-encoded, **UPPERCASE**. |
| **file\_modified\_time\_utc** | The file's last-modified time in UTC, formatted as `YYYYMMDD-hhmmss`. |
| **hashset\_detail\_item** | The concatenation of all per-entry fields for a single entry (defined in [Section 2.2](#22-description-hash)). |
| **desc\_hash** | `H(hashset_detail_item)` -- the hash of one entry's detail string. Hex-encoded, **lowercase**. |
| **all\_desc\_hashes** | The concatenation of every desc\_hash, each terminated by `\r\n`. |
| **hashset\_hash** | `H(all_desc_hashes)` -- the single commitment hash for the entire file set. Hex-encoded, **UPPERCASE**. |

> **Notation:** `a ‖ b` denotes byte-level concatenation. `SP` denotes a single ASCII space (`0x20`). All hex encoding uses ASCII characters with no `0x` prefix.

## 2. Algorithm

All operations within a single proofset use the same hash algorithm. SHA-256 and SHA-512 are supported.

### 2.1 Per-File Secret Chaining

The `file_desc_secret` is a chained value that links entries together:

```
file_desc_secret[0] = H(seed_password)                                        -- lowercase hex
file_desc_secret[i] = H(seed_password ‖ file_desc_secret[i-1] ‖ desc_hash[i-1])  -- lowercase hex
```

Each file may produce one or two entries (see [Section 2.4](#24-path-variants)). The chain advances **per entry**, not per file.

### 2.2 Description Hash

For each entry, a `hashset_detail_item` string is constructed by concatenating the entry's fields with specific delimiters:

```
hashset_detail_item = file_desc_secret ‖ SP ‖ file_modified_time_utc ‖ SP ‖ file_content_hash ‖ SP ‖ SP ‖ file_path
```

The description hash is then:

```
desc_hash = H(hashset_detail_item)    -- lowercase hex
```

> **Note:** There are **two** spaces between `file_content_hash` and `file_path`. All other fields are separated by a single space.

### 2.3 Hashset Hash

After all entries are processed, their desc\_hash values are concatenated with `\r\n` (CR LF, bytes `0x0D 0x0A`) terminators:

```
all_desc_hashes = desc_hash[0] ‖ "\r\n" ‖ desc_hash[1] ‖ "\r\n" ‖ ... ‖ desc_hash[N-1] ‖ "\r\n"
```

The hashset hash is computed over the **raw bytes** of this string:

```
hashset_hash = H(all_desc_hashes)    -- UPPERCASE hex
```

### 2.4 Path Variants

Each source file is processed as two entries with different `file_path` values:

| Entry | `file_path` value | Purpose |
|-------|-------------------|---------|
| First | Relative path from source root (e.g. `dir1\file2.txt`) | Disclose file identity including directory structure |
| Second | Filename only (e.g. `file2.txt`) | Disclose file identity without revealing directory structure |

Both entries share the same `file_content_hash` and `file_modified_time_utc`, but each gets its own `file_desc_secret` and `desc_hash` (the chain advances for each entry).

The creator chooses which entry to disclose based on how much path information they wish to reveal. The filename-only entry must always be present to support minimal-disclosure scenarios.

> **v1 note:** The v1 proof-of-concept used the absolute filesystem path (e.g. `C:\example1\source-files\file1.txt`) as the first entry instead of a relative path. See [Section 8](#8-compatibility).

### 2.5 Hex Encoding

All hex-encoded values are **lowercase**. For example, a SHA-256 hash is 64 lowercase hex characters: `ba7816bf8f01cfea...`

Verification is case-insensitive -- verifiers should compare hashes using case-insensitive comparison to interoperate with v1 files that used mixed casing (UPPERCASE for `file_content_hash` and `hashset_hash`, lowercase for the rest).

> **v1 note:** The mixed casing in v1 was an artifact of the original proof-of-concept, not a design choice. Since casing is irrelevant to verification (the verifier hashes the detail string as-is), this spec standardizes on lowercase for simplicity.

## 3. Output Files

A proofset produces two output files:

### 3.1 Details File

Contains one line per entry in the format:

```
<desc_hash>: <hashset_detail_item>
```

This file is kept **private** by the creator. Individual lines can be selectively disclosed.

### 3.2 All-Desc-Hashes File

Contains only the desc\_hash values, one per line with `\r\n` terminators. This file can be shared publicly to allow verifiers to confirm the hashset\_hash, without revealing any detail about individual entries.

## 4. Verification

Verification can be performed at three levels. The algorithm can be inferred from hex string length: 64 characters implies SHA-256, 128 characters implies SHA-512.

### 4.1 Hashset Hash Verification

Given `all_desc_hashes` and a published `hashset_hash`:

```
verify: H(all_desc_hashes) == hashset_hash
```

This confirms the all-desc-hashes file is the basis of the published commitment.

### 4.2 Single Item Verification

Given a disclosed detail line `<desc_hash>: <hashset_detail_item>` and the all-desc-hashes file:

1. Verify the desc\_hash: `H(hashset_detail_item) == desc_hash`
2. Verify membership: `desc_hash` appears in `all_desc_hashes`

This confirms the disclosed item was part of the original committed set.

### 4.3 Full Verification

Given both output files:

1. For each detail line, verify `H(hashset_detail_item) == desc_hash`
2. For each desc\_hash, verify it appears in the all-desc-hashes file
3. Compute `H(all_desc_hashes)` to obtain the hashset\_hash

## 5. Selective Disclosure Workflow

1. **Commit** -- The creator generates the proofset and publishes only the `hashset_hash` (e.g. to a blockchain or timestamped record).

2. **Reveal list** -- When ready, the creator shares `all_desc_hashes`. The public can verify `H(all_desc_hashes) == hashset_hash` and can see how many entries exist, but learns nothing about their content.

3. **Disclose items** -- The creator shares individual detail lines as needed. For each, the public can verify `H(hashset_detail_item) == desc_hash` and confirm the desc\_hash is in the list. The creator may also share the actual file contents for independent content hash verification.

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

| # | desc\_hash | file\_desc\_secret | modified\_time\_utc | file\_content\_hash | file\_path |
|---|-----------|-------------------|--------------------|--------------------|-----------|
| 0 | `d0c36edf...62d7` | `ba7816bf...0015ad` | `20260217-003735` | `ebe2f179...02fbe` | `dir1\file2.txt` |
| 1 | `a8f88cd6...550e` | `2695e12c...f72fb` | `20260217-003735` | `ebe2f179...02fbe` | `file2.txt` |
| 2 | `d1cffc21...f7e0` | `4f02bb91...89264` | `20260217-003740` | `79c3002f...f1642` | `dir1\file3.txt` |
| 3 | `71af4a25...6f60` | `7685db39...8ea86` | `20260217-003740` | `79c3002f...f1642` | `file3.txt` |
| 4 | `6eacbb70...9291` | `7e7f3ad7...bf78a` | `20260216-231401` | `17aa66d0...a5be` | `file1.txt` |
| 5 | `68c89abc...5f20` | `df0b7c82...6d656` | `20260216-231401` | `17aa66d0...a5be` | `file1.txt` |

### 6.3 Expected Hashset Hash

```
hashset_hash = 0c8dd3e854c87df9e2af078792973bdcd2d97b365d61cd1f33c0961efd7a8839
```

### 6.4 Full Test Vector Values

<details>
<summary>Click to expand full-length hashes</summary>

**Entry 0:**
```
desc_hash:         d0c36edf99a7ea0e9e0459401cbb2191da2130a7cb420c8449a51f8e4b7562d7
file_desc_secret:  ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
file_content_hash: ebe2f17920521e0d6a11da34a26c322e7db871a54381fda89522c861a9602fbe
file_path:         dir1\file2.txt
```

**Entry 1:**
```
desc_hash:         a8f88cd6569e5ffcddbfc4905e02586fb82d88f284fec54cd869e0bd8fc2550e
file_desc_secret:  2695e12caf1d559b5cbe944c034837bb06751f40472e5d458fc05b69e69f72fb
file_content_hash: ebe2f17920521e0d6a11da34a26c322e7db871a54381fda89522c861a9602fbe
file_path:         file2.txt
```

**Entry 2:**
```
desc_hash:         d1cffc21953a7854a9e99ea4e3969ba0c91a57986d40bf4580b7ff30aaaef7e0
file_desc_secret:  4f02bb91c30e1c78e4c3f2291dff5fe96f4c3d1a3dbd89f5e22f94bd19a89264
file_content_hash: 79c3002f6edeca649b1c1f30ade00cc184320d0a56463d53fd760f0e85ff1642
file_path:         dir1\file3.txt
```

**Entry 3:**
```
desc_hash:         71af4a250b03ed4becbc347da32a9accbb20c10327bcc183c2aa5c559bd16f60
file_desc_secret:  7685db39608c4ede8e044af61842dde58d12dd49f0b10be614242a619548ea86
file_content_hash: 79c3002f6edeca649b1c1f30ade00cc184320d0a56463d53fd760f0e85ff1642
file_path:         file3.txt
```

**Entry 4:**
```
desc_hash:         6eacbb704099891e675ba07a9209e15844ce95b96d6731c2a7fa713275569291
file_desc_secret:  7e7f3ad7392cd307dd3183ac8ef2ef7cf712f08e0a08608084b9527df99bf78a
file_content_hash: 17aa66d07b0254b8a86e61dd14b8fc0f2b6dd4fb93e545f343ba0604d4a9a5be
file_path:         file1.txt
```

**Entry 5:**
```
desc_hash:         68c89abc9a75e5a13aaa726201b7bef305aa7e91a44ee68ad57e2b7f89205f20
file_desc_secret:  df0b7c82d3697240c0d47362de4c0dd87655d2dca63226eede808da31156d656
file_content_hash: 17aa66d07b0254b8a86e61dd14b8fc0f2b6dd4fb93e545f343ba0604d4a9a5be
file_path:         file1.txt
```

**all\_desc\_hashes** (each line terminated with `\r\n`):
```
d0c36edf99a7ea0e9e0459401cbb2191da2130a7cb420c8449a51f8e4b7562d7
a8f88cd6569e5ffcddbfc4905e02586fb82d88f284fec54cd869e0bd8fc2550e
d1cffc21953a7854a9e99ea4e3969ba0c91a57986d40bf4580b7ff30aaaef7e0
71af4a250b03ed4becbc347da32a9accbb20c10327bcc183c2aa5c559bd16f60
6eacbb704099891e675ba07a9209e15844ce95b96d6731c2a7fa713275569291
68c89abc9a75e5a13aaa726201b7bef305aa7e91a44ee68ad57e2b7f89205f20
```

**hashset\_hash:**
```
0c8dd3e854c87df9e2af078792973bdcd2d97b365d61cd1f33c0961efd7a8839
```

</details>

## 7. Security Considerations

- **Seed password strength** -- The seed password is hashed with a single invocation of H to derive the initial `file_desc_secret`. A weak seed password could be brute-forced if any detail lines are disclosed. Consider using a high-entropy password or a key derivation function (e.g. PBKDF2, Argon2) in future versions.

- **File ordering** -- The hashset\_hash depends on the order in which files are processed. Implementations must define a deterministic ordering (e.g. lexicographic sort of relative paths) to ensure reproducibility.

- **Secret chaining** -- Disclosing a `file_desc_secret` for one entry does not reveal the secret for other entries, provided the seed password remains confidential. However, disclosing the seed password and any detail line allows computing all subsequent secrets in the chain.

- **Timestamp trust** -- The `file_modified_time_utc` is taken from the filesystem and is not independently verified. It reflects what the creator's system reported at generation time.

## 8. Compatibility

### 8.1 v1 Proof-of-Concept

The v1 PoC (GetFileHashesForPublish.ps1) produces a details file with additional header and footer lines:

```
SHA256:
HashOfContentHashPath: PerFileUniqueValue ModifiedUtc HashOfContent  Path
<detail lines...>
--- Summary ---
<summary lines...>
```

Implementations should ignore non-detail lines when parsing v1 detail files. The all-desc-hashes file format is unchanged between v1 and this specification.

### 8.2 v1 Path Behavior

In v1, the two path entries per file are:

| Entry | v1 | Current spec |
|-------|----|--------------|
| First | Absolute filesystem path (e.g. `C:\example1\source-files\dir1\file2.txt`) | Relative path from source root (e.g. `dir1\file2.txt`) |
| Second | Filename only (e.g. `file2.txt`) | Filename only (e.g. `file2.txt`) -- unchanged |

The filename-only entry is identical in both versions. Verification is path-agnostic -- the verifier hashes whatever string appears in the detail line, so v1 and current detail files verify with the same logic.
