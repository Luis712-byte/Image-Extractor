import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ImageDownloadService } from './image-download.service';
import { ImageCategoryService } from './image-category.service';

@Injectable()
export class ImageExtractorService {
  private readonly logger = new Logger(ImageExtractorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly imageDownloadService: ImageDownloadService,
    private readonly imageCategoryService: ImageCategoryService,
  ) { }

  async extractImages(url: string, outputDirectory?: string, maxImages?: number, aiProvider?: string, visualAnalysis?: boolean, followLinks?: boolean) {
    this.logger.log(`Extracting images from: ${url} with AI provider: ${aiProvider || 'default'}, visual analysis: ${visualAnalysis || false}, follow links: ${followLinks || false}`);

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 45000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const imageUrls: string[] = [];
      const processedUrls = new Set<string>();

      // Function to add URL if valid and not duplicate
      const addImageUrl = (src: string) => {
        if (!src || maxImages && imageUrls.length >= maxImages) return;

        // Skip data URLs, base64, and tiny images
        if (src.startsWith('data:') || src.includes('1x1') || src.includes('spacer')) return;

        const fullUrl = this.resolveUrl(src, url);
        if (fullUrl && !this.isDuplicate(fullUrl, processedUrls)) {
          processedUrls.add(fullUrl);
          imageUrls.push(fullUrl);
        }
      };

      // Extract from img tags
      $('img').each((index, element) => {
        if (maxImages && imageUrls.length >= maxImages) return false;

        // Standard src attribute
        let src = $(element).attr('src');
        if (src) addImageUrl(src);

        // Data-src for lazy loading
        src = $(element).attr('data-src');
        if (src) addImageUrl(src);

        // Other common lazy loading attributes
        src = $(element).attr('data-lazy');
        if (src) addImageUrl(src);

        src = $(element).attr('data-original');
        if (src) addImageUrl(src);

        src = $(element).attr('data-srcset');
        if (src) {
          // Extract all URLs from srcset
          const urls = src.split(',').map(url => url.trim().split(' ')[0]);
          urls.forEach(url => url && addImageUrl(url));
        }

        // Additional lazy loading attributes
        src = $(element).attr('data-img-src');
        if (src) addImageUrl(src);

        src = $(element).attr('data-image-src');
        if (src) addImageUrl(src);

        src = $(element).attr('data-bg');
        if (src) addImageUrl(src);

        // Check for inline style background images
        const style = $(element).attr('style');
        if (style && style.includes('background-image')) {
          const matches = style.match(/url\(['"]?([^'"]+)['"]?\)/g);
          if (matches) {
            matches.forEach(match => {
              const urlMatch = match.match(/url\(['"]?([^'"]+)['"]?\)/);
              if (urlMatch && urlMatch[1]) {
                addImageUrl(urlMatch[1]);
              }
            });
          }
        }
      });

      // Extract from picture tags
      $('picture source').each((index, element) => {
        if (maxImages && imageUrls.length >= maxImages) return false;

        const srcset = $(element).attr('srcset');
        if (srcset) {
          const sources = srcset.split(',').map(s => s.trim().split(' ')[0]);
          sources.forEach(source => addImageUrl(source));
        }
      });

      // Extract from style attributes (background images)
      $('[style*="background-image"]').each((index, element) => {
        if (maxImages && imageUrls.length >= maxImages) return false;

        const style = $(element).attr('style');
        if (style) {
          const matches = style.match(/url\(['"]?([^'"]+)['"]?\)/g);
          if (matches) {
            matches.forEach(match => {
              const url = match.slice(4, -1).replace(/['"]/g, '');
            });
          }
        }
      });

      // Extract from meta tags (OG images, Twitter cards)
      $('meta[property="og:image"], meta[name="twitter:image"]').each((index, element) => {
        if (maxImages && imageUrls.length >= maxImages) return false;

        const content = $(element).attr('content');
        if (content) addImageUrl(content);
      });

      // Extract from elements with background-image styles
      $('[style*="background-image"]').each((index, element) => {
        if (maxImages && imageUrls.length >= maxImages) return false;

        const style = $(element).attr('style');
        if (style) {
          const matches = style.match(/url\(['"]?([^'"]+)['"]?\)/g);
          if (matches) {
            matches.forEach(match => {
              const urlMatch = match.match(/url\(['"]?([^'"]+)['"]?\)/);
              if (urlMatch && urlMatch[1]) {
                addImageUrl(urlMatch[1]);
              }
            });
          }
        }
      });

      // Extract from link tags (preloads, icons)
      $('link[rel="preload"][as="image"], link[rel="icon"], link[rel="shortcut icon"]').each((index, element) => {
        if (maxImages && imageUrls.length >= maxImages) return false;

        const href = $(element).attr('href');
        if (href) addImageUrl(href);
      });

      // Extract from script tags and JSON data
      $('script').each((index, element) => {
        if (maxImages && imageUrls.length >= maxImages) return false;

        const scriptContent = $(element).html() || $(element).text();
        if (scriptContent) {
          // Look for image URLs in JavaScript content
          const urlPatterns = [
            /["']([^"']+\.(jpg|jpeg|png|gif|webp|svg))["']/gi,
            /url\s*\(\s*["']?([^"')]+\.(jpg|jpeg|png|gif|webp|svg))["']?\s*\)/gi,
            /["'](https?:\/\/[^"']+\.(jpg|jpeg|png|gif|webp|svg))["']/gi
          ];

          urlPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(scriptContent)) !== null) {
              const url = match[1] || match[2];
              if (url && !url.includes('data:')) {
                addImageUrl(url);
              }
            }
          });
        }
      });

      // Filter out non-image URLs and common non-content images
      const filteredUrls = imageUrls.filter(url => {
        const lowerUrl = url.toLowerCase();
        return (
          (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') ||
            lowerUrl.includes('.png') || lowerUrl.includes('.gif') ||
            lowerUrl.includes('.webp') || lowerUrl.includes('.svg')) &&
          !lowerUrl.includes('logo') && !lowerUrl.includes('icon') &&
          !lowerUrl.includes('favicon') && !lowerUrl.includes('sprite') &&
          !lowerUrl.includes('avatar') && !lowerUrl.includes('button')
        );
      });

      this.logger.log(`Found ${filteredUrls.length} valid images from ${imageUrls.length} total (removed ${imageUrls.length - filteredUrls.length} invalid/duplicate URLs)`);
      this.logger.log(`URL Analysis:`);
      this.logger.log(`   Raw URLs found: ${imageUrls.length}`);
      this.logger.log(`   First 5 URLs: ${imageUrls.slice(0, 5).join(', ')}`);
      this.logger.log(`   After filtering: ${filteredUrls.length} valid URLs`);
      this.logger.log(`   Removed: ${imageUrls.length - filteredUrls.length} invalid/duplicate URLs`);

      if (filteredUrls.length > 0) {
        this.logger.log(`   Sample valid URLs: ${filteredUrls.slice(0, 3).join(', ')}`);
      }

      // Extract and follow links if enabled
      let urlsToDownload = filteredUrls;
      if (followLinks) {
        const linkedImages = await this.extractImagesFromLinks($, url, maxImages);
        this.logger.log(`Found ${linkedImages.length} additional images from linked pages`);
        urlsToDownload = [...filteredUrls, ...linkedImages];

        // Remove duplicates after adding linked images
        const uniqueUrls = [...new Set(urlsToDownload)];
        this.logger.log(`Total unique URLs after link crawling: ${uniqueUrls.length}`);
        urlsToDownload = uniqueUrls; // Use uniqueUrls for download
      }

      const downloadedImages = await this.imageDownloadService.downloadImages(
        urlsToDownload,
        outputDirectory || './downloads'
      );

      const categorizedImages = await this.imageCategoryService.categorizeImages(
        downloadedImages,
        visualAnalysis
      );

      return {
        url,
        totalImages: filteredUrls.length,
        downloadedImages: downloadedImages.length,
        categories: categorizedImages,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error(`Error extracting images from ${url}:`, error);
      throw new Error(`Failed to extract images: ${error.message}`);
    }
  }

  private isDuplicate(url: string, processedUrls: Set<string>): boolean {
    // Check exact URL match first
    if (processedUrls.has(url)) {
      return true;
    }

    // Check for common duplicate patterns
    const normalizedUrl = this.normalizeUrl(url);

    for (const processedUrl of processedUrls) {
      if (this.normalizeUrl(processedUrl) === normalizedUrl) {
        return true;
      }
    }

    return false;
  }

  private async extractImagesFromLinks($: any, baseUrl: string, maxImages?: number): Promise<string[]> {
    this.logger.log(`🔗 Extracting images from links on page: ${baseUrl}`);

    const linkedImages: string[] = [];
    const processedUrls = new Set<string>();

    try {
      // Extract all links from the page
      const links = $('a[href]').map((index, element) => {
        const href = $(element).attr('href');
        if (!href) return null;

        // Convert relative URLs to absolute
        const absoluteUrl = new URL(href, baseUrl).href;
        return absoluteUrl;
      }).get() as string[];

      this.logger.log(`Found ${links.length} total links on page`);

      // Filter for same-origin links (to avoid external sites)
      const sameOriginLinks = links.filter(link => {
        try {
          const linkUrl = new URL(link);
          const baseUrlObj = new URL(baseUrl);
          return linkUrl.origin === baseUrlObj.origin;
        } catch {
          return false;
        }
      });

      this.logger.log(`Found ${sameOriginLinks.length} same-origin links to explore`);

      // Limit to prevent infinite crawling
      const maxLinksToExplore = Math.min(sameOriginLinks.length, 10);
      const linksToExplore = sameOriginLinks.slice(0, maxLinksToExplore);

      // Process each linked page
      for (const link of linksToExplore) {
        if (processedUrls.has(link) || linkedImages.length >= (maxImages || 100)) {
          continue;
        }

        try {
          this.logger.log(`🔍 Exploring linked page: ${link}`);
          processedUrls.add(link);

          const response = await axios.get(link, {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

          const linkedPage$ = cheerio.load(response.data);

          // Extract images from linked page using same logic
          linkedPage$('img').each((index, element) => {
            if (linkedImages.length >= (maxImages || 100)) return false;

            let imgSrc = linkedPage$(element).attr('src');
            if (imgSrc) {
              const absoluteSrc = new URL(imgSrc, link).href;
              if (!linkedImages.includes(absoluteSrc)) {
                linkedImages.push(absoluteSrc);
              }
            }

            imgSrc = linkedPage$(element).attr('data-src');
            if (imgSrc) {
              const absoluteSrc = new URL(imgSrc, link).href;
              if (!linkedImages.includes(absoluteSrc)) {
                linkedImages.push(absoluteSrc);
              }
            }
          });

          // Small delay to be respectful
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          this.logger.warn(`Failed to explore link ${link}: ${error.message}`);
        }
      }

      this.logger.log(`✅ Found ${linkedImages.length} images from linked pages`);
      return linkedImages;

    } catch (error) {
      this.logger.error(`Error extracting images from links: ${error.message}`);
      return [];
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  private resolveUrl(src: string, baseUrl: string): string | null {
    try {
      if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
      }

      return new URL(src, baseUrl).href;

      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}/${src.replace(/^\//, '')}`;
    } catch {
      return null;
    }
  }
}
