import { Test, TestingModule } from '@nestjs/testing';
import { StorageController } from './storage.controller';
import { StorageService } from '../services/storage.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';

describe('StorageController', () => {
  let controller: StorageController;
  let storageService: StorageService;

  beforeEach(async () => {
    const mockStorageService = {
      initialize: jest.fn(),
      listBuckets: jest.fn(),
      createBucket: jest.fn(),
      setPublicReadPolicy: jest.fn(),
      listObjects: jest.fn(),
      uploadFile: jest.fn(),
      uploadLargeFile: jest.fn(),
      downloadFile: jest.fn(),
      getFileMetadata: jest.fn(),
      deleteFile: jest.fn(),
      generatePresignedUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    controller = module.get<StorageController>(StorageController);
    storageService = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('healthCheck', () => {
    it('should return a healthy status when initialize succeeds', async () => {
      (storageService.initialize as jest.Mock).mockResolvedValue(undefined);

      const result = await controller.healthCheck();

      expect(result).toEqual({ status: 'ok', message: 'Storage service is healthy' });
      expect(storageService.initialize).toHaveBeenCalled();
    });

    it('should return an error status when initialize fails', async () => {
      const errorMessage = 'Failed to initialize';
      (storageService.initialize as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const result = await controller.healthCheck();

      expect(result).toEqual({ status: 'error', message: errorMessage });
      expect(storageService.initialize).toHaveBeenCalled();
    });
  });

  describe('listBuckets', () => {
    it('should return buckets from the storage service', async () => {
      const mockBuckets = [
        { name: 'bucket1', creationDate: new Date() },
        { name: 'bucket2', creationDate: new Date() },
      ];
      (storageService.listBuckets as jest.Mock).mockResolvedValue(mockBuckets);

      const result = await controller.listBuckets();

      expect(result).toEqual(mockBuckets);
      expect(storageService.listBuckets).toHaveBeenCalled();
    });
  });

  describe('createBucket', () => {
    it('should create a bucket and return success', async () => {
      const bucketName = 'test-bucket';
      (storageService.createBucket as jest.Mock).mockResolvedValue(true);

      const result = await controller.createBucket({ name: bucketName });

      expect(result).toEqual({ success: true, bucket: bucketName });
      expect(storageService.createBucket).toHaveBeenCalledWith(bucketName, false);
    });

    it('should throw BadRequestException if bucket name is not provided', async () => {
      await expect(controller.createBucket({} as any)).rejects.toThrow(BadRequestException);
      expect(storageService.createBucket).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('should upload a file and return the result', async () => {
      const mockFile = {
        buffer: Buffer.from('test'),
        originalname: 'test.txt',
        mimetype: 'text/plain',
      } as Express.Multer.File;

      const mockUploadResponse = {
        fileId: 'test-id',
        fileName: 'test.txt',
        fileSize: 4,
        mimeType: 'text/plain',
        bucket: 'default',
        etag: 'test-etag',
        createdAt: new Date(),
      };

      (storageService.uploadLargeFile as jest.Mock).mockResolvedValue(mockUploadResponse);

      const result = await controller.uploadFile(mockFile);

      expect(result).toEqual(mockUploadResponse);
      expect(storageService.uploadLargeFile).toHaveBeenCalled();
    });

    it('should throw BadRequestException if no file is provided', async () => {
      await expect(controller.uploadFile(undefined as any)).rejects.toThrow(BadRequestException);
      expect(storageService.uploadLargeFile).not.toHaveBeenCalled();
    });
  });
});