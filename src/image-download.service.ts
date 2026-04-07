import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface DownloadedImage {
  originalUrl: string;
  localPath: string;
  filename: string;
  size: number;
  format: string;
  width?: number;
  height?: number;
}

@Injectable()
export class ImageDownloadService {
  private readonly logger = new Logger(ImageDownloadService.name);

  async downloadImages(imageUrls: string[], outputDirectory: string): Promise<any[]> {
    this.logger.log(`🚀 Starting download of ${imageUrls.length} images to ${outputDirectory}`);
    
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    const downloadedImages: any[] = [];
    let successCount = 0;
    let failCount = 0;
    let invalidCount = 0;
    
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      try {
        this.logger.log(`⬇️ [${i + 1}/${imageUrls.length}] Attempting: ${imageUrl}`);
        const imageData = await this.downloadSingleImage(imageUrl, outputDirectory);
        if (imageData) {
          downloadedImages.push(imageData);
          successCount++;
          this.logger.log(`✅ Success: ${imageData.filename} (${imageData.size} bytes, ${imageData.format})`);
        } else {
          invalidCount++;
          this.logger.warn(`⚠️ Invalid content type for: ${imageUrl}`);
        }
      } catch (error) {
        failCount++;
        this.logger.error(`❌ Failed to download ${imageUrl}: ${error.message}`);
      }
    }
    
    this.logger.log(`📊 Download summary:`);
    this.logger.log(`   Total URLs: ${imageUrls.length}`);
    this.logger.log(`   Successful: ${successCount}`);
    this.logger.log(`   Failed: ${failCount}`);
    this.logger.log(`   Invalid content: ${invalidCount}`);
    this.logger.log(`   Final count: ${downloadedImages.length}`);
    
    return downloadedImages;
  }

  private async downloadSingleImage(url: string, outputDirectory: string): Promise<DownloadedImage | null> {
    try {
      this.logger.log(`🌐 Fetching: ${url}`);
      
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://holafomo.com/',
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });

      this.logger.log(`📋 Response status: ${response.status} for ${url}`);
      this.logger.log(`📋 Content-Type: ${response.headers['content-type']} for ${url}`);
      this.logger.log(`📋 Content-Length: ${response.headers['content-length']} bytes for ${url}`);

      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/')) {
        this.logger.warn(`🚫 Not an image: ${contentType} for ${url}`);
        return null;
      }

      const extension = this.getExtensionFromContentType(contentType);
      const filename = `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
      const localPath = path.join(outputDirectory, filename);

      await fs.promises.writeFile(localPath, response.data);
      this.logger.log(`💾 Saved: ${filename}`);

      const metadata = await sharp(response.data).metadata();
      this.logger.log(`📐 Metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
      
      return {
        originalUrl: url,
        localPath,
        filename,
        size: response.data.byteLength,
        format: metadata.format || 'unknown',
        width: metadata.width,
        height: metadata.height,
      };

    } catch (error) {
      this.logger.error(`❌ Error downloading ${url}: ${error.message}`);
      if (error.response) {
        this.logger.error(`   Status: ${error.response.status}`);
        this.logger.error(`   Headers: ${JSON.stringify(error.response.headers)}`);
      }
      return null;
    }
  }

  private getExtensionFromContentType(contentType: string): string {
    const extensions: { [key: string]: string } = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff',
    };

    return extensions[contentType] || '.jpg';
  }
}
