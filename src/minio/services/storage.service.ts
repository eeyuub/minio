import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MinioHttpService } from './minio-http.service';
import { StorageConfig } from '../interfaces/storage-config.interface';
import { UploadResponse } from '../interfaces/upload-response.interface';
import { FileMetadata } from '../interfaces/file-metadata.interface';
import { Readable } from 'stream';
import { MultipartUploadUtil } from '../utils/multipart-upload.util';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly minioHttpService: MinioHttpService,
    @Inject('STORAGE_CONFIG') private readonly config: StorageConfig,
  ) {}

  /**
   * Initializes the storage service by ensuring the default bucket exists
   */
  async initialize(): Promise<void> {
    try {
      // Check if default bucket exists
      const buckets = await this.minioHttpService.listBuckets();
      const bucketExists = buckets.Buckets.Bucket.some(
        (bucket) => bucket.Name === this.config.defaultBucket,
      );

      if (!bucketExists) {
        // Create default bucket
        await this.minioHttpService.createBucket(this.config.defaultBucket);
        this.logger.log(`Created default bucket: ${this.config.defaultBucket}`);
        
        // Set public read policy for default bucket
        await this.setPublicReadPolicy(this.config.defaultBucket);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize storage: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sets a public read policy for a bucket
   */
  async setPublicReadPolicy(bucketName: string): Promise<void> {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    });

    await this.minioHttpService.setBucketPolicy(bucketName, policy);
    this.logger.log(`Set public read policy for bucket: ${bucketName}`);
  }

  /**
   * Lists all buckets
   */
  async listBuckets(): Promise<{ name: string; creationDate: Date }[]> {
    const result = await this.minioHttpService.listBuckets();
    
    return result.Buckets.Bucket.map((bucket) => ({
      name: bucket.Name,
      creationDate: new Date(bucket.CreationDate),
    }));
  }

  /**
   * Creates a new bucket
   */
  async createBucket(bucketName: string, makePublic = false): Promise<boolean> {
    const result = await this.minioHttpService.createBucket(bucketName);
    
    if (result && makePublic) {
      await this.setPublicReadPolicy(bucketName);
    }
    
    return result;
  }

  /**
   * Deletes a bucket
   */
  async deleteBucket(bucketName: string): Promise<boolean> {
    return await this.minioHttpService.deleteBucket(bucketName);
  }

  /**
   * Lists objects in a bucket
   */
  async listObjects(
    bucketName = this.config.defaultBucket,
    prefix = '',
    maxKeys = 1000,
    marker = '',
  ): Promise<FileMetadata[]> {
    const result = await this.minioHttpService.listObjects(bucketName, prefix, maxKeys, marker);
    
    return result.Contents.map((item) => ({
      id: item.Key,
      name: path.basename(item.Key),
      size: item.Size,
      mimeType: this.getMimeTypeFromExtension(path.extname(item.Key)),
      bucket: bucketName,
      etag: item.ETag,
      lastModified: new Date(item.LastModified),
      url: this.getPublicUrl(bucketName, item.Key),
    }));
  }

  /**
   * Uploads a file
   */
  async uploadFile(
    file: Buffer | string | Readable,
    fileName: string,
    options: {
      bucket?: string;
      contentType?: string;
      metadata?: Record<string, string>;
      makePublic?: boolean;
    } = {},
  ): Promise<UploadResponse> {
    const {
      bucket = this.config.defaultBucket,
      contentType,
      metadata = {},
      makePublic = true,
    } = options;

    // Generate a unique file ID
    const fileId = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(fileName);
    const objectName = `${fileId}${extension}`;

    // Add content type to metadata if provided
    if (contentType) {
      metadata['content-type'] = contentType;
    } else {
      // Try to determine content type from extension
      const detectedType = this.getMimeTypeFromExtension(extension);
      if (detectedType) {
        metadata['content-type'] = detectedType;
      }
    }

    // Add original filename to metadata
    metadata['original-name'] = fileName;

    // Upload the file
    const { etag } = await this.minioHttpService.putObject(bucket, objectName, file, metadata);

    // Get file size
    const { headers } = await this.minioHttpService.headObject(bucket, objectName);
    const fileSize = parseInt(headers['content-length'] || '0', 10);

    // Create response
    const response: UploadResponse = {
      fileId,
      fileName,
      fileSize,
      mimeType: metadata['content-type'] || 'application/octet-stream',
      bucket,
      etag,
      metadata,
      createdAt: new Date(),
    };

    // Add public URL if makePublic is true
    if (makePublic) {
      response.url = this.getPublicUrl(bucket, objectName);
    }

    return response;
  }

  /**
   * Uploads a large file using multipart upload
   */
  async uploadLargeFile(
    fileStream: Readable,
    fileName: string,
    options: {
      bucket?: string;
      contentType?: string;
      metadata?: Record<string, string>;
      makePublic?: boolean;
      chunkSize?: number;
    } = {},
  ): Promise<UploadResponse> {
    const {
      bucket = this.config.defaultBucket,
      contentType,
      metadata = {},
      makePublic = true,
      chunkSize = 5 * 1024 * 1024, // 5MB default
    } = options;

    // Generate a unique file ID
    const fileId = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(fileName);
    const objectName = `${fileId}${extension}`;

    // Add content type to metadata if provided
    if (contentType) {
      metadata['content-type'] = contentType;
    } else {
      // Try to determine content type from extension
      const detectedType = this.getMimeTypeFromExtension(extension);
      if (detectedType) {
        metadata['content-type'] = detectedType;
      }
    }

    // Add original filename to metadata
    metadata['original-name'] = fileName;

    try {
      // Initiate multipart upload
      const uploadId = await this.minioHttpService.initiateMultipartUpload(
        bucket,
        objectName,
        metadata,
      );

      // Upload parts
      const parts = [];
      let totalSize = 0;

      for await (const { buffer, partNumber } of MultipartUploadUtil.splitStreamIntoChunks(
        fileStream,
        chunkSize,
      )) {
        const etag = await this.minioHttpService.uploadPart(
          bucket,
          objectName,
          uploadId,
          partNumber,
          buffer,
        );
        
        parts.push({ partNumber, etag });
        totalSize += buffer.length;
        
        this.logger.debug(`Uploaded part ${partNumber} with size ${buffer.length} bytes`);
      }

      // Complete multipart upload
      const { etag } = await this.minioHttpService.completeMultipartUpload(
        bucket,
        objectName,
        uploadId,
        parts,
      );

      // Create response
      const response: UploadResponse = {
        fileId,
        fileName,
        fileSize: totalSize,
        mimeType: metadata['content-type'] || 'application/octet-stream',
        bucket,
        etag,
        metadata,
        createdAt: new Date(),
      };

      // Add public URL if makePublic is true
      if (makePublic) {
        response.url = this.getPublicUrl(bucket, objectName);
      }

      return response;
    } catch (error) {
      this.logger.error(`Multipart upload failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Downloads a file
   */
  async downloadFile(
    fileId: string,
    options: {
      bucket?: string;
      responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
    } = {},
  ): Promise<{ data: any; metadata: Record<string, string> }> {
    const { bucket = this.config.defaultBucket, responseType = 'arraybuffer' } = options;
    
    // Get file extension from metadata
    try {
      const { metadata: fileMetadata } = await this.minioHttpService.headObject(bucket, fileId);
      const extension = path.extname(fileId);
      const objectName = extension ? fileId : `${fileId}${this.getExtensionFromMetadata(fileMetadata)}`;
      
      return await this.minioHttpService.getObject(bucket, objectName, responseType);
    } catch (error) {
      this.logger.error(`Failed to download file: ${error.message}`);
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
  }

  /**
   * Gets file metadata
   */
  async getFileMetadata(
    fileId: string,
    bucket = this.config.defaultBucket,
  ): Promise<FileMetadata> {
    try {
      const { metadata, headers } = await this.minioHttpService.headObject(bucket, fileId);
      
      return {
        id: fileId,
        name: metadata['original-name'] || path.basename(fileId),
        size: parseInt(headers['content-length'] || '0', 10),
        mimeType: headers['content-type'] || 'application/octet-stream',
        bucket,
        etag: headers.etag?.replace(/"/g, '') || '',
        lastModified: new Date(headers['last-modified'] || Date.now()),
        url: this.getPublicUrl(bucket, fileId),
        metadata,
      };
    } catch (error) {
      this.logger.error(`Failed to get file metadata: ${error.message}`);
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
  }

  /**
   * Deletes a file
   */
  async deleteFile(fileId: string, bucket = this.config.defaultBucket): Promise<boolean> {
    return await this.minioHttpService.deleteObject(bucket, fileId);
  }

  /**
   * Generates a presigned URL for a file
   */
  generatePresignedUrl(
    fileId: string,
    options: {
      bucket?: string;
      expiresIn?: number;
      method?: 'GET' | 'PUT';
    } = {},
  ): string {
    const { bucket = this.config.defaultBucket, expiresIn = 3600, method = 'GET' } = options;
    
    return this.minioHttpService.generatePresignedUrl(method, bucket, fileId, expiresIn);
  }

  /**
   * Gets a public URL for a file
   */
  getPublicUrl(bucket: string, objectName: string): string {
    const protocol = this.config.useSSL ? 'https' : 'http';
    const port = this.config.port !== 80 && this.config.port !== 443 ? `:${this.config.port}` : '';
    
    return `${protocol}://${this.config.endPoint}${port}/${bucket}/${objectName}`;
  }

  /**
   * Gets MIME type from file extension
   */
  private getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Gets file extension from metadata
   */
  private getExtensionFromMetadata(metadata: Record<string, string>): string {
    if (metadata['original-name']) {
      return path.extname(metadata['original-name']);
    }

    if (metadata['content-type']) {
      const contentType = metadata['content-type'];
      const extensionMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'text/plain': '.txt',
        'text/csv': '.csv',
        'text/html': '.html',
        'application/json': '.json',
        'application/xml': '.xml',
        'application/zip': '.zip',
        'application/x-rar-compressed': '.rar',
        'application/x-tar': '.tar',
        'application/gzip': '.gz',
        'audio/mpeg': '.mp3',
        'video/mp4': '.mp4',
        'video/x-msvideo': '.avi',
        'video/quicktime': '.mov',
        'video/x-ms-wmv': '.wmv',
      };

      return extensionMap[contentType] || '';
    }

    return '';
  }
}