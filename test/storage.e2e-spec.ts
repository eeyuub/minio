import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('StorageController (e2e)', () => {
  let app: INestApplication;
  const apiKey = 'test-api-key';

  beforeEach(async () => {
    process.env.API_KEY = apiKey;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1/storage/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/storage/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
      });
  });

  it('/api/v1/storage/buckets (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/storage/buckets')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('/api/v1/storage/buckets (GET) - Unauthorized', () => {
    return request(app.getHttpServer())
      .get('/api/v1/storage/buckets')
      .expect(401);
  });
});