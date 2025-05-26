# NestJS MinIO HTTP API Integration

A production-ready NestJS integration with MinIO S3-compatible storage using direct HTTP calls with axios. This implementation avoids using any MinIO SDK dependencies and instead implements the AWS S3 signature v4 authentication directly.

## Features

- **Direct HTTP Integration**: Uses axios for MinIO S3-compatible HTTP API calls with proper AWS S3 signature authentication
- **Reusable Service Module**: Services that can be easily integrated into any NestJS application
- **Public REST API**: Well-designed controller endpoints for external applications to interact with MinIO storage
- **AWS S3 Signature V4**: Complete implementation of AWS S3 signature v4 authentication
- **Streaming Support**: Memory-efficient streaming for large file uploads and downloads
- **Multipart Upload**: Support for large file uploads using multipart upload
- **Presigned URLs**: Generation of presigned URLs for temporary access to files
- **Bucket Management**: Create, delete, list, and manage bucket policies
- **Comprehensive Error Handling**: Proper error handling for MinIO HTTP responses
- **API Key Authentication**: Secure API endpoints with API key authentication
- **Swagger Documentation**: Complete API documentation with Swagger/OpenAPI

## Installation

```bash
npm install
```

## Configuration

The application can be configured using environment variables:

```
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_REGION=us-east-1
MINIO_DEFAULT_BUCKET=default
API_KEY=your-api-key-here
```

## Running the Application

### Development Mode

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm run start:prod
```

### Using Docker Compose

```bash
docker-compose up -d
```

This will start both the MinIO server and the NestJS application.

## API Endpoints

### Storage Health Check

```
GET /api/v1/storage/health
```

### Bucket Operations

```
GET /api/v1/storage/buckets - List all buckets
POST /api/v1/storage/buckets - Create a new bucket
PUT /api/v1/storage/buckets/:name/policy - Update bucket policy
```

### File Operations

```
POST /api/v1/storage/upload - Upload a single file
GET /api/v1/storage/files - List files with pagination
GET /api/v1/storage/files/:id - Get file metadata
GET /api/v1/storage/files/:id/download - Download a file
DELETE /api/v1/storage/files/:id - Delete a file
```

### Batch Operations

```
POST /api/v1/storage/batch/upload - Upload multiple files
DELETE /api/v1/storage/batch/delete - Delete multiple files
```

### Presigned URLs

```
POST /api/v1/storage/presigned - Generate a presigned URL
```

## Implementation Details

### Direct HTTP Integration

This implementation uses axios for all HTTP operations with MinIO, avoiding any SDK dependencies. It includes:

- Manual AWS S3 signature v4 calculation
- Custom XML parsing for MinIO list operations
- HTTP range requests for partial downloads
- Multipart form data handling for uploads
- Request/response interceptors for logging
- Proper HTTP error mapping from MinIO responses

### Security

- API key authentication for all endpoints
- Input validation and sanitization
- File signature verification
- Secure presigned URL generation

### Performance Optimizations

- Connection pooling and timeout configuration
- Memory-efficient streaming for large files
- Multipart upload for large files
- Request caching for metadata

## Architecture

The project follows a modular architecture:

- **MinioHttpService**: Core HTTP API operations
- **AwsSignatureService**: AWS S3 signature v4 implementation
- **StorageService**: High-level storage operations
- **StorageController**: Public API endpoints

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.
