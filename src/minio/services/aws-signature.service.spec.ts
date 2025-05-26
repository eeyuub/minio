import { Test, TestingModule } from '@nestjs/testing';
import { AwsSignatureService } from './aws-signature.service';

describe('AwsSignatureService', () => {
  let service: AwsSignatureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AwsSignatureService],
    }).compile();

    service = module.get<AwsSignatureService>(AwsSignatureService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSignatureV4', () => {
    it('should generate a valid AWS signature v4', () => {
      const method = 'GET';
      const path = '/test-bucket/test-object';
      const query = { prefix: 'test/' };
      const headers = { 'content-type': 'application/json' };
      const payload = '';
      const accessKey = 'test-access-key';
      const secretKey = 'test-secret-key';
      const region = 'us-east-1';

      const result = service.generateSignatureV4(
        method,
        path,
        query,
        headers,
        payload,
        accessKey,
        secretKey,
        region,
      );

      expect(result).toHaveProperty('authorization');
      expect(result).toHaveProperty('signedHeaders');
      expect(result.authorization).toContain('AWS4-HMAC-SHA256');
      expect(result.authorization).toContain(`Credential=${accessKey}`);
      expect(result.authorization).toContain('SignedHeaders=');
      expect(result.authorization).toContain('Signature=');
    });
  });

  describe('generatePresignedUrl', () => {
    it('should generate a valid presigned URL', () => {
      const method = 'GET';
      const path = '/test-bucket/test-object';
      const query = {};
      const accessKey = 'test-access-key';
      const secretKey = 'test-secret-key';
      const region = 'us-east-1';
      const expiresIn = 3600;

      const result = service.generatePresignedUrl(
        method,
        path,
        query,
        accessKey,
        secretKey,
        region,
        expiresIn,
      );

      expect(result).toContain(path);
      expect(result).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(result).toContain(`X-Amz-Credential=${accessKey}`);
      expect(result).toContain('X-Amz-Date=');
      expect(result).toContain(`X-Amz-Expires=${expiresIn}`);
      expect(result).toContain('X-Amz-SignedHeaders=host');
      expect(result).toContain('X-Amz-Signature=');
    });
  });
});