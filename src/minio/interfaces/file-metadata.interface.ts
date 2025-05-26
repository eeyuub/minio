export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  bucket: string;
  etag: string;
  lastModified: Date;
  url?: string;
  metadata?: Record<string, string>;
}