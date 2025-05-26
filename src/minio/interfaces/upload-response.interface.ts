export interface UploadResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  bucket: string;
  etag: string;
  url?: string;
  metadata?: Record<string, string>;
  createdAt: Date;
}