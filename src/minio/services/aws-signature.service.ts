import { Injectable } from '@nestjs/common';
import { SignatureHelper } from '../utils/signature-helper.util';

@Injectable()
export class AwsSignatureService {
  /**
   * Generates AWS Signature V4 for S3/MinIO API requests
   */
  generateSignatureV4(
    method: string,
    path: string,
    query: Record<string, string>,
    headers: Record<string, string>,
    payload: string,
    accessKey: string,
    secretKey: string,
    region: string,
    service = 's3',
  ): { authorization: string; signedHeaders: string } {
    // Get current date and time
    const now = new Date();
    const { dateTime, date } = SignatureHelper.formatDate(now);

    // Add required headers
    headers = {
      ...headers,
      'x-amz-date': dateTime,
    };

    // Create canonical request
    const canonicalRequest = SignatureHelper.createCanonicalRequest(
      method,
      path,
      query,
      headers,
      payload,
    );

    // Create credential scope
    const credentialScope = `${date}/${region}/${service}/aws4_request`;

    // Create string to sign
    const stringToSign = SignatureHelper.createStringToSign(
      'AWS4-HMAC-SHA256',
      dateTime,
      credentialScope,
      canonicalRequest,
    );

    // Calculate signature
    const signature = SignatureHelper.calculateSignature(
      secretKey,
      date,
      region,
      service,
      stringToSign,
    );

    // Get signed headers
    const signedHeaders = SignatureHelper.getSignedHeaders(headers);

    // Create authorization header
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    return { authorization, signedHeaders };
  }

  /**
   * Generates a presigned URL for S3/MinIO
   */
  generatePresignedUrl(
    method: string,
    path: string,
    query: Record<string, string>,
    accessKey: string,
    secretKey: string,
    region: string,
    expiresIn = 3600, // 1 hour default
    service = 's3',
  ): string {
    // Get current date and time
    const now = new Date();
    const { dateTime, date } = SignatureHelper.formatDate(now);

    // Add required query parameters
    const presignedQuery = {
      ...query,
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKey}/${date}/${region}/${service}/aws4_request`,
      'X-Amz-Date': dateTime,
      'X-Amz-Expires': expiresIn.toString(),
      'X-Amz-SignedHeaders': 'host',
    };

    // Create canonical request
    const headers = { host: path.split('/')[0] };
    const canonicalRequest = SignatureHelper.createCanonicalRequest(
      method,
      path,
      presignedQuery,
      headers,
      '',
    );

    // Create credential scope
    const credentialScope = `${date}/${region}/${service}/aws4_request`;

    // Create string to sign
    const stringToSign = SignatureHelper.createStringToSign(
      'AWS4-HMAC-SHA256',
      dateTime,
      credentialScope,
      canonicalRequest,
    );

    // Calculate signature
    const signature = SignatureHelper.calculateSignature(
      secretKey,
      date,
      region,
      service,
      stringToSign,
    );

    // Add signature to query
    presignedQuery['X-Amz-Signature'] = signature;

    // Build the URL
    const queryString = Object.keys(presignedQuery)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(presignedQuery[key])}`)
      .join('&');

    return `${path}?${queryString}`;
  }
}