import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  BadRequestException,
  NotFoundException,
  StreamableFile,
  Res,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { StorageService } from '../services/storage.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { Response } from 'express';
import { Readable } from 'stream';

// DTOs
class CreateBucketDto {
  name: string;
  makePublic?: boolean;
}

class UpdateBucketPolicyDto {
  policy: string;
}

class PresignedUrlDto {
  fileId: string;
  bucket?: string;
  expiresIn?: number;
  method?: 'GET' | 'PUT';
}

class BatchUploadResponseDto {
  successful: { fileId: string; fileName: string; url?: string }[];
  failed: { fileName: string; error: string }[];
}

class BatchDeleteDto {
  fileIds: string[];
  bucket?: string;
}

class BatchDeleteResponseDto {
  successful: string[];
  failed: { fileId: string; error: string }[];
}

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check storage service health' })
  async healthCheck() {
    try {
      await this.storageService.initialize();
      return { status: 'ok', message: 'Storage service is healthy' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  @Get('buckets')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all buckets' })
  async listBuckets() {
    return await this.storageService.listBuckets();
  }

  @Post('buckets')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new bucket' })
  @ApiBody({ type: CreateBucketDto })
  async createBucket(@Body() createBucketDto: CreateBucketDto) {
    const { name, makePublic = false } = createBucketDto;
    
    if (!name) {
      throw new BadRequestException('Bucket name is required');
    }
    
    const result = await this.storageService.createBucket(name, makePublic);
    
    return {
      success: result,
      bucket: name,
    };
  }

  @Put('buckets/:name/policy')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bucket policy' })
  @ApiParam({ name: 'name', description: 'Bucket name' })
  @ApiBody({ type: UpdateBucketPolicyDto })
  async updateBucketPolicy(
    @Param('name') bucketName: string,
    @Body() updateBucketPolicyDto: UpdateBucketPolicyDto,
  ) {
    if (updateBucketPolicyDto.policy === 'public-read') {
      await this.storageService.setPublicReadPolicy(bucketName);
      return { success: true, message: 'Bucket policy updated to public-read' };
    } else {
      throw new BadRequestException('Unsupported policy type');
    }
  }

  @Post('upload')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        bucket: {
          type: 'string',
          description: 'Optional bucket name',
        },
        makePublic: {
          type: 'boolean',
          description: 'Make file publicly accessible',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('bucket') bucket?: string,
    @Body('makePublic') makePublic?: boolean,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const fileStream = Readable.from(file.buffer);
    
    return await this.storageService.uploadLargeFile(fileStream, file.originalname, {
      bucket,
      contentType: file.mimetype,
      makePublic: makePublic !== 'false',
    });
  }

  @Post('batch/upload')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload multiple files' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        bucket: {
          type: 'string',
          description: 'Optional bucket name',
        },
        makePublic: {
          type: 'boolean',
          description: 'Make files publicly accessible',
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files'))
  async uploadMultipleFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('bucket') bucket?: string,
    @Body('makePublic') makePublic?: boolean,
  ): Promise<BatchUploadResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const response: BatchUploadResponseDto = {
      successful: [],
      failed: [],
    };

    const uploadPromises = files.map(async (file) => {
      try {
        const fileStream = Readable.from(file.buffer);
        const result = await this.storageService.uploadLargeFile(fileStream, file.originalname, {
          bucket,
          contentType: file.mimetype,
          makePublic: makePublic !== 'false',
        });

        response.successful.push({
          fileId: result.fileId,
          fileName: result.fileName,
          url: result.url,
        });
      } catch (error) {
        response.failed.push({
          fileName: file.originalname,
          error: error.message,
        });
      }
    });

    await Promise.all(uploadPromises);
    return response;
  }

  @Get('files')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List files with pagination' })
  @ApiQuery({ name: 'bucket', required: false, description: 'Bucket name' })
  @ApiQuery({ name: 'prefix', required: false, description: 'Prefix to filter files' })
  @ApiQuery({ name: 'maxKeys', required: false, description: 'Maximum number of keys to return' })
  @ApiQuery({ name: 'marker', required: false, description: 'Marker for pagination' })
  async listFiles(
    @Query('bucket') bucket?: string,
    @Query('prefix') prefix?: string,
    @Query('maxKeys') maxKeys?: number,
    @Query('marker') marker?: string,
  ) {
    return await this.storageService.listObjects(
      bucket,
      prefix,
      maxKeys ? parseInt(maxKeys.toString(), 10) : undefined,
      marker,
    );
  }

  @Get('files/:id')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get file metadata' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiQuery({ name: 'bucket', required: false, description: 'Bucket name' })
  async getFileMetadata(@Param('id') fileId: string, @Query('bucket') bucket?: string) {
    return await this.storageService.getFileMetadata(fileId, bucket);
  }

  @Get('files/:id/download')
  @ApiOperation({ summary: 'Download a file' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiQuery({ name: 'bucket', required: false, description: 'Bucket name' })
  async downloadFile(
    @Param('id') fileId: string,
    @Query('bucket') bucket?: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { data, metadata } = await this.storageService.downloadFile(fileId, {
        bucket,
        responseType: 'arraybuffer',
      });

      // Set content type and disposition headers
      const contentType = metadata['content-type'] || 'application/octet-stream';
      const fileName = metadata['original-name'] || fileId;
      
      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      });

      // Create a readable stream from the buffer
      const stream = Readable.from(data);
      return new StreamableFile(stream);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to download file: ${error.message}`);
    }
  }

  @Delete('files/:id')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file' })
  @ApiParam({ name: 'id', description: 'File ID' })
  @ApiQuery({ name: 'bucket', required: false, description: 'Bucket name' })
  async deleteFile(@Param('id') fileId: string, @Query('bucket') bucket?: string) {
    const result = await this.storageService.deleteFile(fileId, bucket);
    
    if (!result) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
  }

  @Post('presigned')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a presigned URL' })
  @ApiBody({ type: PresignedUrlDto })
  async generatePresignedUrl(@Body() presignedUrlDto: PresignedUrlDto) {
    const { fileId, bucket, expiresIn, method = 'GET' } = presignedUrlDto;
    
    if (!fileId) {
      throw new BadRequestException('File ID is required');
    }
    
    const url = this.storageService.generatePresignedUrl(fileId, {
      bucket,
      expiresIn,
      method,
    });
    
    return { url };
  }

  @Delete('batch/delete')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete multiple files' })
  @ApiBody({ type: BatchDeleteDto })
  async batchDeleteFiles(@Body() batchDeleteDto: BatchDeleteDto): Promise<BatchDeleteResponseDto> {
    const { fileIds, bucket } = batchDeleteDto;
    
    if (!fileIds || fileIds.length === 0) {
      throw new BadRequestException('File IDs are required');
    }
    
    const response: BatchDeleteResponseDto = {
      successful: [],
      failed: [],
    };
    
    const deletePromises = fileIds.map(async (fileId) => {
      try {
        const result = await this.storageService.deleteFile(fileId, bucket);
        
        if (result) {
          response.successful.push(fileId);
        } else {
          response.failed.push({
            fileId,
            error: 'File not found or could not be deleted',
          });
        }
      } catch (error) {
        response.failed.push({
          fileId,
          error: error.message,
        });
      }
    });
    
    await Promise.all(deletePromises);
    return response;
  }
}