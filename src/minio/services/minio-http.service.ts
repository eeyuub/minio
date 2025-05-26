import { Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { StorageConfig } from '../interfaces/storage-config.interface';
import { AwsSignatureService } from './aws-signature.service';
import { XmlParserUtil } from '../utils/xml-parser.util';
import { MinioListBucketResult, MinioListAllMyBucketsResult, MinioError } from '../interfaces/minio-response.interface';
import { Readable } from 'stream';
import { MultipartUploadContext, MultipartUploadPart, MultipartUploadUtil } from '../utils/multipart-upload.util';

@Injectable()
export class MinioHttpService {
  private readonly logger = new Logger(MinioHttpService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly endpoint: string;

  constructor(
    @Inject('STORAGE_CONFIG') private readonly config: StorageConfig,
    private readonly awsSignatureService: AwsSignatureService,
  ) {
    this.endpoint = `${config.useSSL ? 'https' : 'http'}://${config.endPoint}${
      config.port !== 80 && config.port !== 443 ? `:${config.port}` : ''
    }`;

    this.axiosInstance = axios.create({
      baseURL: this.endpoint,
      timeout: 30000, // 30 seconds
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true, // Don't throw HTTP errors
    });

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use((config) => {
      this.logger.debug(`Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Add response interceptor for logging and error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logger.debug(`Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        this.logger.error(`Error: ${error.message}`);
        return Promise.reject(error);
      },
    );
  }

  /**
   * Makes a signed HTTP request to MinIO
   */
  async makeRequest<T = any>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string>;
      headers?: Record<string, string>;
      data?: any;
      responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
      validateStatus?: (status: number) => boolean;
    } = {},
  ): Promise<AxiosResponse<T>> {
    const { query = {}, headers = {}, data = '', responseType, validateStatus } = options;

    // Prepare headers
    const requestHeaders = {
      'Content-Type': data ? 'application/octet-stream' : '',
      ...headers,
    };

    // Calculate content length for non-stream data
    if (data && !Readable.isReadable(data)) {
      const contentLength = Buffer.isBuffer(data)
        ? data.length
        : typeof data === 'string'
        ? Buffer.byteLength(data)
        : Buffer.byteLength(JSON.stringify(data));
      
      requestHeaders['Content-Length'] = contentLength.toString();
    }

    // Generate AWS Signature V4
    const { authorization, signedHeaders } = this.awsSignatureService.generateSignatureV4(
      method,
      path,
      query,
      requestHeaders,
      typeof data === 'string' ? data : '',
      this.config.accessKey,
      this.config.secretKey,
      this.config.region,
    );

    // Add authorization header
    requestHeaders['Authorization'] = authorization;

    // Prepare request config
    const requestConfig: AxiosRequestConfig = {
      method,
      url: path,
      params: query,
      headers: requestHeaders,
      data,
      responseType,
    };

    if (validateStatus) {
      requestConfig.validateStatus = validateStatus;
    }

    // Make the request
    try {
      return await this.axiosInstance.request<T>(requestConfig);
    } catch (error) {
      this.logger.error(`Request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lists all buckets
   */
  async listBuckets(): Promise<MinioListAllMyBucketsResult> {
    const response = await this.makeRequest<string>('GET', '/', {
      responseType: 'text',
      validateStatus: (status) => status === 200,
    });

    return XmlParserUtil.parseListAllMyBucketsResult(response.data);
  }

  /**
   * Creates a new bucket
   */
  async createBucket(bucketName: string): Promise<boolean> {
    const response = await this.makeRequest('PUT', `/${bucketName}`, {
      validateStatus: (status) => status === 200,
    });

    return response.status === 200;
  }

  /**
   * Deletes a bucket
   */
  async deleteBucket(bucketName: string): Promise<boolean> {
    const response = await this.makeRequest('DELETE', `/${bucketName}`, {
      validateStatus: (status) => status === 204,
    });

    return response.status === 204;
  }

  /**
   * Lists objects in a bucket
   */
  async listObjects(
    bucketName: string,
    prefix = '',
    maxKeys = 1000,
    marker = '',
  ): Promise<MinioListBucketResult> {
    const query: Record<string, string> = {};
    if (prefix) query.prefix = prefix;
    if (maxKeys) query.maxKeys = maxKeys.toString();
    if (marker) query.marker = marker;

    const response = await this.makeRequest<string>('GET', `/${bucketName}`, {
      query,
      responseType: 'text',
      validateStatus: (status) => status === 200,
    });

    return XmlParserUtil.parseListBucketResult(response.data);
  }

  /**
   * Uploads an object to a bucket
   */
  async putObject(
    bucketName: string,
    objectName: string,
    data: Buffer | string | Readable,
    metadata: Record<string, string> = {},
  ): Promise<{ etag: string }> {
    // Prepare headers with metadata
    const headers: Record<string, string> = {};
    
    // Add x-amz-meta- prefix to all metadata
    Object.keys(metadata).forEach((key) => {
      headers[`x-amz-meta-${key}`] = metadata[key];
    });

    const response = await this.makeRequest('PUT', `/${bucketName}/${objectName}`, {
      headers,
      data,
      validateStatus: (status) => status === 200,
    });

    return {
      etag: response.headers.etag?.replace(/"/g, '') || '',
    };
  }

  /**
   * Gets an object from a bucket
   */
  async getObject(
    bucketName: string,
    objectName: string,
    responseType: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' = 'arraybuffer',
  ): Promise<{ data: any; metadata: Record<string, string> }> {
    const response = await this.makeRequest('GET', `/${bucketName}/${objectName}`, {
      responseType,
      validateStatus: (status) => status === 200,
    });

    // Extract metadata from headers
    const metadata: Record<string, string> = {};
    Object.keys(response.headers).forEach((key) => {
      if (key.startsWith('x-amz-meta-')) {
        const metaKey = key.substring('x-amz-meta-'.length);
        metadata[metaKey] = response.headers[key];
      }
    });

    return {
      data: response.data,
      metadata,
    };
  }

  /**
   * Gets object metadata
   */
  async headObject(
    bucketName: string,
    objectName: string,
  ): Promise<{ metadata: Record<string, string>; headers: Record<string, string> }> {
    const response = await this.makeRequest('HEAD', `/${bucketName}/${objectName}`, {
      validateStatus: (status) => status === 200,
    });

    // Extract metadata from headers
    const metadata: Record<string, string> = {};
    const headers: Record<string, string> = {};

    Object.keys(response.headers).forEach((key) => {
      headers[key] = response.headers[key];
      if (key.startsWith('x-amz-meta-')) {
        const metaKey = key.substring('x-amz-meta-'.length);
        metadata[metaKey] = response.headers[key];
      }
    });

    return { metadata, headers };
  }

  /**
   * Deletes an object from a bucket
   */
  async deleteObject(bucketName: string, objectName: string): Promise<boolean> {
    const response = await this.makeRequest('DELETE', `/${bucketName}/${objectName}`, {
      validateStatus: (status) => status === 204,
    });

    return response.status === 204;
  }

  /**
   * Initiates a multipart upload
   */
  async initiateMultipartUpload(
    bucketName: string,
    objectName: string,
    metadata: Record<string, string> = {},
  ): Promise<string> {
    // Prepare headers with metadata
    const headers: Record<string, string> = {};
    
    // Add x-amz-meta- prefix to all metadata
    Object.keys(metadata).forEach((key) => {
      headers[`x-amz-meta-${key}`] = metadata[key];
    });

    const response = await this.makeRequest<string>('POST', `/${bucketName}/${objectName}`, {
      query: { uploads: '' },
      headers,
      responseType: 'text',
      validateStatus: (status) => status === 200,
    });

    // Extract upload ID from XML response
    const uploadIdMatch = /<UploadId>(.*?)<\/UploadId>/i.exec(response.data);
    if (!uploadIdMatch || !uploadIdMatch[1]) {
      throw new Error('Failed to extract upload ID from response');
    }

    return uploadIdMatch[1];
  }

  /**
   * Uploads a part in a multipart upload
   */
  async uploadPart(
    bucketName: string,
    objectName: string,
    uploadId: string,
    partNumber: number,
    data: Buffer,
  ): Promise<string> {
    const response = await this.makeRequest('PUT', `/${bucketName}/${objectName}`, {
      query: {
        partNumber: partNumber.toString(),
        uploadId,
      },
      data,
      validateStatus: (status) => status === 200,
    });

    return response.headers.etag?.replace(/"/g, '') || '';
  }

  /**
   * Completes a multipart upload
   */
  async completeMultipartUpload(
    bucketName: string,
    objectName: string,
    uploadId: string,
    parts: MultipartUploadPart[],
  ): Promise<{ etag: string }> {
    const xml = MultipartUploadUtil.createCompleteMultipartUploadXml(parts);

    const response = await this.makeRequest<string>('POST', `/${bucketName}/${objectName}`, {
      query: { uploadId },
      headers: { 'Content-Type': 'application/xml' },
      data: xml,
      responseType: 'text',
      validateStatus: (status) => status === 200,
    });

    // Extract ETag from response
    const etag = MultipartUploadUtil.extractEtagFromResponse(response.data);

    return { etag };
  }

  /**
   * Aborts a multipart upload
   */
  async abortMultipartUpload(
    bucketName: string,
    objectName: string,
    uploadId: string,
  ): Promise<boolean> {
    const response = await this.makeRequest('DELETE', `/${bucketName}/${objectName}`, {
      query: { uploadId },
      validateStatus: (status) => status === 204,
    });

    return response.status === 204;
  }

  /**
   * Sets a bucket policy
   */
  async setBucketPolicy(bucketName: string, policy: string): Promise<boolean> {
    const response = await this.makeRequest('PUT', `/${bucketName}`, {
      query: { policy: '' },
      headers: { 'Content-Type': 'application/json' },
      data: policy,
      validateStatus: (status) => status === 204,
    });

    return response.status === 204;
  }

  /**
   * Gets a bucket policy
   */
  async getBucketPolicy(bucketName: string): Promise<string> {
    const response = await this.makeRequest<string>('GET', `/${bucketName}`, {
      query: { policy: '' },
      responseType: 'text',
      validateStatus: (status) => status === 200,
    });

    return response.data;
  }

  /**
   * Generates a presigned URL for an object
   */
  generatePresignedUrl(
    method: string,
    bucketName: string,
    objectName: string,
    expiresIn = 3600,
    query: Record<string, string> = {},
  ): string {
    const path = `/${bucketName}/${objectName}`;
    
    return this.awsSignatureService.generatePresignedUrl(
      method,
      path,
      query,
      this.config.accessKey,
      this.config.secretKey,
      this.config.region,
      expiresIn,
    );
  }
}