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

      // Categorizar URLs de imágenes sin descargar
      const categorizedResults = await this.categorizeImageUrls(
        urlsToDownload,
        visualAnalysis || false
      );

      return {
        url,
        totalImages: filteredUrls.length,
        downloaded: urlsToDownload.length,
        categories: categorizedResults,
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

  private async categorizeImageUrls(imageUrls: string[], visualAnalysis: boolean): Promise<any[]> {
    this.logger.log(`Categorizing ${imageUrls.length} image URLs (visual analysis: ${visualAnalysis})`);
    
    const categories: { [key: string]: string[] } = {};
    let processedCount = 0;
    
    // Process URLs in batches
    const batchSize = 10;
    
    for (let i = 0; i < imageUrls.length; i += batchSize) {
      const batch = imageUrls.slice(i, i + batchSize);
      
      this.logger.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(imageUrls.length/batchSize)} (${batch.length} URLs)`);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (url) => {
        try {
          const category = await this.analyzeImageUrlCategory(url, visualAnalysis);
          processedCount++;
          
          this.logger.log(`[${processedCount}/${imageUrls.length}] ${url} -> ${category}`);
          
          return { url, category, error: null };
        } catch (error) {
          this.logger.error(`Failed to analyze ${url}: ${error.message}`);
          const fallbackCategory = this.categorizeUrlByHeuristics(url);
          processedCount++;
          
          this.logger.log(`[${processedCount}/${imageUrls.length}] ${url} -> ${fallbackCategory} (fallback)`);
          
          return { url, category: fallbackCategory, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Add to categories
      for (const { url, category } of batchResults) {
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(url);
      }
      
      // Small delay between batches
      if (i + batchSize < imageUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Convert to response format
    const results: Array<{
      category: string;
      images: Array<{
        originalUrl: string;
        filename: string;
        width: null;
        height: null;
        size: null;
        format: string;
        localPath: null;
      }>;
      folderPath: string;
    }> = [];
    
    for (const [category, urls] of Object.entries(categories)) {
      results.push({
        category,
        images: urls.map((url, index) => ({
          originalUrl: url,
          filename: this.generateFilename(url, index),
          width: null,
          height: null,
          size: null,
          format: this.getFormatFromUrl(url),
          localPath: null
        })),
        folderPath: category
      });
      
      this.logger.log(`Category '${category}': ${urls.length} images`);
    }

    this.logger.log(`Categorization complete: ${processedCount} URLs processed`);
    this.logger.log(`Created ${results.length} categories: ${Object.keys(categories).join(', ')}`);
    
    return results;
  }

  private async analyzeImageUrlCategory(url: string, useVisualAnalysis: boolean): Promise<string> {
    try {
      if (useVisualAnalysis) {
        // For URL-based analysis, we'll use heuristics for now
        // Could be enhanced to fetch image and analyze with AI in the future
        this.logger.log(`Using heuristics for ${url} (URL-only analysis)`);
        return this.categorizeUrlByHeuristics(url);
      }
      
      return this.categorizeUrlByHeuristics(url);
      
    } catch (error) {
      this.logger.warn(`URL categorization failed for ${url}, using heuristics: ${error.message}`);
      return this.categorizeUrlByHeuristics(url);
    }
  }

  private categorizeUrlByHeuristics(url: string): string {
    const urlLower = url.toLowerCase();
    
    if (this.containsKeywords([urlLower], ['person', 'people', 'face', 'portrait', 'human'])) {
      return 'people';
    }
    
    if (this.containsKeywords([urlLower], [
      'nature', 'landscape', 'animal', 'plant', 'tree', 'flower', 'mountain', 'forest',
      'garden', 'botanical', 'green', 'leaf', 'leaves', 'foliage', 'vegetation',
      'flora', 'herb', 'shrub', 'bush', 'grass', 'meadow', 'wildflower',
      'palm', 'fern', 'moss', 'vine', 'cactus', 'succulent', 'bamboo',
      'outdoor', 'natural', 'organic', 'eco', 'environment', 'wildlife'
    ])) {
      return 'nature';
    }
    
    if (this.containsKeywords([urlLower], ['product', 'item', 'object', 'tool', 'device'])) {
      return 'objects';
    }
    
    if (this.containsKeywords([urlLower], ['building', 'architecture', 'house', 'structure', 'interior'])) {
      return 'architecture';
    }
    
    if (this.containsKeywords([urlLower], ['food', 'meal', 'drink', 'restaurant', 'cooking'])) {
      return 'food';
    }
    
    if (this.containsKeywords([urlLower], ['tech', 'computer', 'phone', 'electronic', 'gadget'])) {
      return 'technology';
    }
    
    if (this.containsKeywords([urlLower], ['art', 'painting', 'drawing', 'creative', 'design'])) {
      return 'art';
    }
    
    return 'other';
  }

  private containsKeywords(sources: string[], keywords: string[]): boolean {
    return keywords.some(keyword => 
      sources.some(source => source.includes(keyword))
    );
  }

  private generateFilename(url: string, index: number): string {
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1] || `image_${index}`;
    
    // Remove query parameters and hash
    const cleanFilename = filename.split('?')[0].split('#')[0];
    
    // Add extension if missing
    if (!cleanFilename.includes('.')) {
      return `${cleanFilename}.jpg`;
    }
    
    return cleanFilename;
  }

  private getFormatFromUrl(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase().split('?')[0];
    
    const formatMap: { [key: string]: string } = {
      'jpg': 'jpeg',
      'jpeg': 'jpeg',
      'png': 'png',
      'gif': 'gif',
      'webp': 'webp',
      'svg': 'svg',
      'bmp': 'bmp',
      'tiff': 'tiff'
    };
    
    return formatMap[extension || 'jpg'] || 'jpeg';
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
