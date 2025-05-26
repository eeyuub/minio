import { Readable } from 'stream';
import * as crypto from 'crypto';

export interface MultipartUploadPart {
  partNumber: number;
  etag: string;
}

export interface MultipartUploadContext {
  uploadId: string;
  bucket: string;
  key: string;
  parts: MultipartUploadPart[];
}

export class MultipartUploadUtil {
  /**
   * Splits a stream into chunks for multipart upload
   * @param stream The readable stream to split
   * @param chunkSize The size of each chunk in bytes
   */
  static async* splitStreamIntoChunks(
    stream: Readable,
    chunkSize: number = 5 * 1024 * 1024, // 5MB default
  ): AsyncGenerator<{ buffer: Buffer; partNumber: number }> {
    let buffer = Buffer.alloc(0);
    let partNumber = 1;
    
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
      
      while (buffer.length >= chunkSize) {
        const chunkToSend = buffer.slice(0, chunkSize);
        buffer = buffer.slice(chunkSize);
        yield { buffer: chunkToSend, partNumber: partNumber++ };
      }
    }
    
    // Send the last chunk if there's any data left
    if (buffer.length > 0) {
      yield { buffer, partNumber: partNumber };
    }
  }

  /**
   * Generates a random upload ID for multipart upload
   */
  static generateUploadId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Creates the XML for completing a multipart upload
   */
  static createCompleteMultipartUploadXml(parts: MultipartUploadPart[]): string {
    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n';
    
    for (const part of sortedParts) {
      xml += `  <Part>\n`;
      xml += `    <PartNumber>${part.partNumber}</PartNumber>\n`;
      xml += `    <ETag>${part.etag}</ETag>\n`;
      xml += `  </Part>\n`;
    }
    
    xml += '</CompleteMultipartUpload>';
    return xml;
  }

  /**
   * Extracts the ETag from a multipart upload response
   */
  static extractEtagFromResponse(response: string): string {
    const match = /<ETag>(.*?)<\/ETag>/i.exec(response);
    if (match && match[1]) {
      return match[1].replace(/&quot;|"/g, '');
    }
    return '';
  }
}