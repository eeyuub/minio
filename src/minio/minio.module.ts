import { Module } from '@nestjs/common';
import { MinioHttpService } from './services/minio-http.service';
import { AwsSignatureService } from './services/aws-signature.service';
import { StorageService } from './services/storage.service';
import { StorageController } from './controllers/storage.controller';

@Module({
  providers: [
    MinioHttpService,
    AwsSignatureService,
    StorageService,
    {
      provide: 'STORAGE_CONFIG',
      useValue: {
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT || '9000', 10),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        region: process.env.MINIO_REGION || 'us-east-1',
        defaultBucket: process.env.MINIO_DEFAULT_BUCKET || 'default',
      },
    },
  ],
  controllers: [StorageController],
  exports: [StorageService, MinioHttpService, AwsSignatureService],
})
export class MinioModule {}