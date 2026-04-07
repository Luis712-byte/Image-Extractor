import { Module } from '@nestjs/common';
import { ImageExtractorController } from './image-extractor.controller';
import { ImageExtractorService } from './image-extractor.service';
import { ImageDownloadService } from './image-download.service';
import { ImageCategoryService } from './image-category.service';

@Module({
  controllers: [ImageExtractorController],
  providers: [ImageExtractorService, ImageDownloadService, ImageCategoryService],
})
export class ImageExtractorModule {}
