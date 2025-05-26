export interface MinioListBucketResult {
  Name: string;
  Prefix: string;
  Marker: string;
  MaxKeys: number;
  IsTruncated: boolean;
  Contents: MinioObject[];
  CommonPrefixes?: MinioCommonPrefix[];
}

export interface MinioObject {
  Key: string;
  LastModified: string;
  ETag: string;
  Size: number;
  StorageClass: string;
  Owner?: {
    ID: string;
    DisplayName: string;
  };
}

export interface MinioCommonPrefix {
  Prefix: string;
}

export interface MinioListAllMyBucketsResult {
  Owner: {
    ID: string;
    DisplayName: string;
  };
  Buckets: {
    Bucket: MinioBucket[];
  };
}

export interface MinioBucket {
  Name: string;
  CreationDate: string;
}

export interface MinioError {
  Code: string;
  Message: string;
  Resource: string;
  RequestId: string;
}