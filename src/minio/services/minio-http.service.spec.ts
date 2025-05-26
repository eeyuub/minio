import { Test, TestingModule } from '@nestjs/testing';
import { MinioHttpService } from './minio-http.service';
import { AwsSignatureService } from './aws-signature.service';
import axios from 'axios';
import { StorageConfig } from '../interfaces/storage-config.interface';

jest.mock('axios');

describe('MinioHttpService', () => {
  let service: MinioHttpService;
  let awsSignatureService: AwsSignatureService;

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinioHttpService,
        AwsSignatureService,
        {
          provide: 'STORAGE_CONFIG',
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<MinioHttpService>(MinioHttpService);
    awsSignatureService = module.get<AwsSignatureService>(AwsSignatureService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('makeRequest', () => {
    it('should make a request with the correct parameters', async () => {
      const mockSignature = {
        authorization: 'AWS4-HMAC-SHA256 Credential=test',
        signedHeaders: 'host;x-amz-date',
      };

      jest.spyOn(awsSignatureService, 'generateSignatureV4').mockReturnValue(mockSignature);

      const mockAxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: 'test-data',
        config: {},
      };

      (axios.create as jest.Mock).mockReturnValue({
        request: jest.fn().mockResolvedValue(mockAxiosResponse),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      const result = await service.makeRequest('GET', '/test-bucket', {
        query: { prefix: 'test/' },
        headers: { 'Content-Type': 'application/json' },
      });

      expect(result).toEqual(mockAxiosResponse);
      expect(awsSignatureService.generateSignatureV4).toHaveBeenCalled();
    });
  });
});