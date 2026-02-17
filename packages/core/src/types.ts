export type HashAlgorithm = 'SHA-256' | 'SHA-512';

export interface SourceFileEntry {
  relativePath: string;
  fullPath?: string;
  modifiedTime: Date;
  content: Uint8Array;
}

export interface ProofsetConfig {
  seedPassword: string;
  algorithm: HashAlgorithm;
}

export interface ProofsetFileDetails {
  fileDetailsHash: string;
  fileSecret: string;
  modifiedTimeUtc: string;
  contentHash: string;
  filePath: string;
}

export interface ProofsetResult {
  hashsetHash: string;
  fileDetailsHashList: string;
  fileDetails: ProofsetFileDetails[];
  fileDetailsLineList: string;
}
