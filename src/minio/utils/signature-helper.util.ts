import * as crypto from 'crypto';

export class SignatureHelper {
  /**
   * Creates a canonical request for AWS Signature V4
   */
  static createCanonicalRequest(
    method: string,
    path: string,
    query: Record<string, string>,
    headers: Record<string, string>,
    payload: string,
  ): string {
    const canonicalURI = encodeURI(path).replace(/%2F/g, '/');
    const canonicalQueryString = this.createCanonicalQueryString(query);
    const canonicalHeaders = this.createCanonicalHeaders(headers);
    const signedHeaders = this.getSignedHeaders(headers);
    const payloadHash = this.hashPayload(payload);

    return [
      method,
      canonicalURI,
      canonicalQueryString,
      canonicalHeaders,
      '',
      signedHeaders,
      payloadHash,
    ].join('\n');
  }

  /**
   * Creates a canonical query string from a query parameters object
   */
  static createCanonicalQueryString(query: Record<string, string>): string {
    return Object.keys(query)
      .sort()
      .map((key) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`;
      })
      .join('&');
  }

  /**
   * Creates canonical headers string
   */
  static createCanonicalHeaders(headers: Record<string, string>): string {
    return Object.keys(headers)
      .sort()
      .map((key) => {
        return `${key.toLowerCase()}:${headers[key].trim()}`;
      })
      .join('\n') + '\n';
  }

  /**
   * Gets signed headers string
   */
  static getSignedHeaders(headers: Record<string, string>): string {
    return Object.keys(headers)
      .sort()
      .map((key) => key.toLowerCase())
      .join(';');
  }

  /**
   * Creates a hash of the payload
   */
  static hashPayload(payload: string): string {
    return crypto.createHash('sha256').update(payload || '').digest('hex');
  }

  /**
   * Creates a string to sign for AWS Signature V4
   */
  static createStringToSign(
    algorithm: string,
    requestDateTime: string,
    credentialScope: string,
    canonicalRequest: string,
  ): string {
    const hashedCanonicalRequest = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');

    return [algorithm, requestDateTime, credentialScope, hashedCanonicalRequest].join('\n');
  }

  /**
   * Calculates the signature for AWS Signature V4
   */
  static calculateSignature(
    secretKey: string,
    date: string,
    region: string,
    service: string,
    stringToSign: string,
  ): string {
    const dateKey = this.hmac('AWS4' + secretKey, date);
    const regionKey = this.hmac(dateKey, region);
    const serviceKey = this.hmac(regionKey, service);
    const signingKey = this.hmac(serviceKey, 'aws4_request');
    return this.hmac(signingKey, stringToSign, 'hex');
  }

  /**
   * Creates an HMAC
   */
  static hmac(key: string | Buffer, string: string, encoding?: crypto.BinaryToTextEncoding): string | Buffer {
    return crypto
      .createHmac('sha256', key)
      .update(string)
      .digest(encoding);
  }

  /**
   * Formats a date for AWS Signature V4
   */
  static formatDate(date: Date): { dateTime: string; date: string } {
    const isoDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    return {
      dateTime: isoDate,
      date: isoDate.substring(0, 8),
    };
  }
}