import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { MinioHttpService } from './minio-http.service';
import { StorageConfig } from '../interfaces/storage-config.interface';
import { Readable } from 'stream';

describe('StorageService', () => {
  let service: StorageService;
  let minioHttpService: MinioHttpService;

  const mockConfig: StorageConfig = {
    endPoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    region: 'us-east-1',
    defaultBucket: 'default',
  };

  beforeEach(async () => {
    const mockMinioHttpService = {
      listBuckets: jest.fn(),
      createBucket: jest.fn(),
      setBucketPolicy: jest.fn(),
      listObjects: jest.fn(),
      putObject: jest.fn(),
      getObject: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
      generatePresignedUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: MinioHttpService,
          useValue: mockMinioHttpService,
        },
        {
          provide: 'STORAGE_CONFIG',
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    minioHttpService = module.get<MinioHttpService>(MinioHttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialize', () => {
    it('should create default bucket if it does not exist', async () => {
      (minioHttpService.listBuckets as jest.Mock).mockResolvedValue({
        Buckets: {
          Bucket: [],
        },
      });
      (minioHttpService.createBucket as jest.Mock).mockResolvedValue(true);
      (minioHttpService.setBucketPolicy as jest.Mock).mockResolvedValue(true);

      await service.initialize();

      expect(minioHttpService.listBuckets).toHaveBeenCalled();
      expect(minioHttpService.createBucket).toHaveBeenCalledWith(mockConfig.defaultBucket);
      expect(minioHttpService.setBucketPolicy).toHaveBeenCalled();
    });

    it('should not create default bucket if it already exists', async () => {
      (minioHttpService.listBuckets as jest.Mock).mockResolvedValue({
        Buckets: {
          Bucket: [{ Name: mockConfig.defaultBucket }],
        },
      });

      await service.initialize();

      expect(minioHttpService.listBuckets).toHaveBeenCalled();
      expect(minioHttpService.createBucket).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('should upload a file and return the correct response', async () => {
      const mockFile = Buffer.from('test file content');
      const mockFileName = 'test.txt';
      const mockEtag = 'test-etag';
      const mockFileId = 'test-file-id';

      jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from(mockFileId));
      
      (minioHttpService.putObject as jest.Mock).mockResolvedValue({ etag: mockEtag });
      (minioHttpService.headObject as jest.Mock).mockResolvedValue({
        headers: { 'content-length': '100' },
        metadata: {},
      });

      const result = await service.uploadFile(mockFile, mockFileName);

      expect(minioHttpService.putObject).toHaveBeenCalled();
      expect(minioHttpService.headObject).toHaveBeenCalled();
      expect(result).toHaveProperty('fileId');
      expect(result).toHaveProperty('fileName', mockFileName);
      expect(result).toHaveProperty('etag', mockEtag);
    });
  });
});