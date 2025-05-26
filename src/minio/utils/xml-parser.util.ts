import { MinioListBucketResult, MinioListAllMyBucketsResult, MinioError } from '../interfaces/minio-response.interface';

export class XmlParserUtil {
  /**
   * Parses XML response from MinIO/S3 ListBucket operation
   */
  static parseListBucketResult(xml: string): MinioListBucketResult {
    // Simple XML parsing without dependencies
    // In a production environment, consider using a proper XML parser library
    const result: Partial<MinioListBucketResult> = {
      Contents: [],
      CommonPrefixes: [],
    };

    // Extract basic properties
    result.Name = this.extractTag(xml, 'Name');
    result.Prefix = this.extractTag(xml, 'Prefix');
    result.Marker = this.extractTag(xml, 'Marker');
    result.MaxKeys = parseInt(this.extractTag(xml, 'MaxKeys') || '1000', 10);
    result.IsTruncated = this.extractTag(xml, 'IsTruncated') === 'true';

    // Extract Contents (files)
    const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let contentsMatch;
    while ((contentsMatch = contentsRegex.exec(xml)) !== null) {
      const content = contentsMatch[1];
      result.Contents!.push({
        Key: this.extractTag(content, 'Key'),
        LastModified: this.extractTag(content, 'LastModified'),
        ETag: this.extractTag(content, 'ETag').replace(/&quot;/g, '').replace(/"/g, ''),
        Size: parseInt(this.extractTag(content, 'Size') || '0', 10),
        StorageClass: this.extractTag(content, 'StorageClass'),
        Owner: {
          ID: this.extractTag(content, 'ID'),
          DisplayName: this.extractTag(content, 'DisplayName'),
        },
      });
    }

    // Extract CommonPrefixes (folders)
    const prefixesRegex = /<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g;
    let prefixMatch;
    while ((prefixMatch = prefixesRegex.exec(xml)) !== null) {
      const prefix = prefixMatch[1];
      result.CommonPrefixes!.push({
        Prefix: this.extractTag(prefix, 'Prefix'),
      });
    }

    return result as MinioListBucketResult;
  }

  /**
   * Parses XML response from MinIO/S3 ListAllMyBuckets operation
   */
  static parseListAllMyBucketsResult(xml: string): MinioListAllMyBucketsResult {
    const result: Partial<MinioListAllMyBucketsResult> = {
      Owner: {
        ID: '',
        DisplayName: '',
      },
      Buckets: {
        Bucket: [],
      },
    };

    // Extract Owner information
    const ownerXml = this.extractTagContent(xml, 'Owner');
    if (ownerXml) {
      result.Owner!.ID = this.extractTag(ownerXml, 'ID');
      result.Owner!.DisplayName = this.extractTag(ownerXml, 'DisplayName');
    }

    // Extract Buckets
    const bucketsXml = this.extractTagContent(xml, 'Buckets');
    if (bucketsXml) {
      const bucketRegex = /<Bucket>([\s\S]*?)<\/Bucket>/g;
      let bucketMatch;
      while ((bucketMatch = bucketRegex.exec(bucketsXml)) !== null) {
        const bucket = bucketMatch[1];
        result.Buckets!.Bucket.push({
          Name: this.extractTag(bucket, 'Name'),
          CreationDate: this.extractTag(bucket, 'CreationDate'),
        });
      }
    }

    return result as MinioListAllMyBucketsResult;
  }

  /**
   * Parses XML error response from MinIO/S3
   */
  static parseError(xml: string): MinioError {
    return {
      Code: this.extractTag(xml, 'Code'),
      Message: this.extractTag(xml, 'Message'),
      Resource: this.extractTag(xml, 'Resource'),
      RequestId: this.extractTag(xml, 'RequestId'),
    };
  }

  /**
   * Helper method to extract tag content from XML
   */
  private static extractTag(xml: string, tagName: string): string {
    const regex = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * Helper method to extract tag with its content from XML
   */
  private static extractTagContent(xml: string, tagName: string): string {
    const regex = new RegExp(`<${tagName}>([\s\S]*?)<\/${tagName}>`, 's');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
  }
}