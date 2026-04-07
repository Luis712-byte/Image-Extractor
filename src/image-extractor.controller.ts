import { Controller, Post, Body, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ImageExtractorService } from './image-extractor.service';
import { ExtractImagesDto } from './extract-images.dto';

@Controller('image-extractor')
export class ImageExtractorController {
  constructor(private readonly imageExtractorService: ImageExtractorService) {}

  @Post('extract')
  async extractImages(@Body() extractImagesDto: ExtractImagesDto) {
    try {
      console.log('📥 DTO recibido:', extractImagesDto);
      console.log('📥 DTO validado:', {
        url: extractImagesDto.url,
        outputDirectory: extractImagesDto.outputDirectory,
        maxImages: extractImagesDto.maxImages,
        aiProvider: extractImagesDto.aiProvider
      });
      
      const result = await this.imageExtractorService.extractImages(
        extractImagesDto.url,
        extractImagesDto.outputDirectory,
        extractImagesDto.maxImages,
        extractImagesDto.aiProvider,
        extractImagesDto.visualAnalysis,
        extractImagesDto.followLinks
      );
      
      return {
        success: true,
        data: result,
        message: 'Images extracted and categorized successfully'
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to extract images'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('health')
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Image Extractor API'
    };
  }
}
