import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DownloadedImage } from './image-download.service';

export interface CategoryResult {
  category: string;
  images: DownloadedImage[];
  folderPath: string;
}

@Injectable()
export class ImageCategoryService {
  private readonly logger = new Logger(ImageCategoryService.name);

  constructor(private readonly configService: ConfigService) {}

  async categorizeImages(images: DownloadedImage[], visualAnalysis: boolean = true): Promise<CategoryResult[]> {
    this.logger.log(`Starting categorization of ${images.length} images (visual analysis: ${visualAnalysis})`);
    
    const categories: { [key: string]: DownloadedImage[] } = {};
    let processedCount = 0;
    let aiAnalysisCount = 0;
    let heuristicCount = 0;
    
    // Process images in batches to avoid overwhelming the API
    const batchSize = 5;
    
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      
      this.logger.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(images.length/batchSize)} (${batch.length} images)`);
      
      // Process batch concurrently with better error handling
      const batchPromises = batch.map(async (image) => {
        try {
          const category = await this.analyzeImageCategory(image, visualAnalysis);
          processedCount++;
          
          if (visualAnalysis && category !== this.categorizeByHeuristics(image)) {
            aiAnalysisCount++;
          } else {
            heuristicCount++;
          }
          
          this.logger.log(`[${processedCount}/${images.length}] ${image.filename} → ${category}`);
          
          return { image, category, error: null };
        } catch (error) {
          this.logger.error(`❌ Failed to analyze ${image.filename}: ${error.message}`);
          // Fallback to heuristics on error
          const fallbackCategory = this.categorizeByHeuristics(image);
          processedCount++;
          heuristicCount++;
          
          this.logger.log(`[${processedCount}/${images.length}] ${image.filename} → ${fallbackCategory} (fallback)`);
          
          return { image, category: fallbackCategory, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Add to categories
      for (const { image, category } of batchResults) {
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(image);
      }
      
      // Small delay between batches to respect API limits
      if (i + batchSize < images.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Create category folders and move images
    const results: CategoryResult[] = [];
    
    for (const [category, categoryImages] of Object.entries(categories)) {
      const folderPath = await this.createCategoryFolder(category);
      await this.moveImagesToCategoryFolder(categoryImages, folderPath);
      
      results.push({
        category,
        images: categoryImages,
        folderPath,
      });
      
      this.logger.log(`Category '${category}': ${categoryImages.length} images`);
    }

    // Log category distribution before final results
    this.logger.log(`📊 Category distribution:`);
    for (const [category, categoryImages] of Object.entries(categories)) {
      this.logger.log(`   ${category}: ${categoryImages.length} images`);
    }

    this.logger.log(`✅ Categorization complete: ${processedCount} images processed`);
    this.logger.log(`� Analysis breakdown: ${aiAnalysisCount} AI-analyzed, ${heuristicCount} heuristic-based`);
    this.logger.log(`📁 Created ${results.length} categories: ${Object.keys(categories).join(', ')}`);
    
    // Warn if too few categories were created
    if (results.length < 3) {
      this.logger.warn(`⚠️ Only ${results.length} categories created. This might indicate categorization issues.`);
    }
    
    return results;
  }

  private async analyzeImageCategory(image: DownloadedImage, useVisualAnalysis: boolean = true): Promise<string> {
    try {
      const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
      
      if (openaiApiKey && useVisualAnalysis) {
        // Use AI for real visual analysis when enabled
        this.logger.log(`🔍 Analyzing image content: ${image.filename}`);
        return await this.categorizeWithOpenAI(image, openaiApiKey);
      }
      
      // Use heuristics if visual analysis is disabled or no API key
      const reason = !useVisualAnalysis ? 'visual analysis disabled' : 'no OpenAI API key found';
      this.logger.log(`📝 Using heuristics for ${image.filename} (${reason})`);
      return this.categorizeByHeuristics(image);
      
    } catch (error) {
      this.logger.warn(`⚠️ AI categorization failed for ${image.filename}, using heuristics: ${error.message}`);
      return this.categorizeByHeuristics(image);
    }
  }

  private async categorizeWithOpenAI(image: DownloadedImage, apiKey: string): Promise<string> {
    try {
      // Check if file exists and is readable
      try {
        await fs.promises.access(image.localPath);
      } catch (error) {
        throw new Error(`Image file not found: ${image.localPath}`);
      }

      const imageData = await fs.promises.readFile(image.localPath);
      const base64Image = imageData.toString('base64');
      
      // Add retry logic for API calls
      let retries = 2;
      let lastError: Error | null = null;
      
      while (retries > 0) {
        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4-vision-preview',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Analyze this image carefully and categorize it based on its actual visual content. Look at what is actually visible in the image, not just names or URLs.

                    Categories:
                    - 'people' (humans, faces, portraits, groups of people, body parts)
                    - 'nature' (landscapes, animals, plants, trees, flowers, gardens, botanical elements, greenery, foliage, vegetation, outdoor natural scenes, water, sky, mountains, forests)
                    - 'objects' (products, tools, furniture, man-made objects, household items, decorations)
                    - 'architecture' (buildings, structures, interior design, rooms, houses, offices)
                    - 'food' (food items, drinks, meals, cooking ingredients, kitchen scenes)
                    - 'technology' (devices, computers, electronics, gadgets, screens, cables)
                    - 'art' (paintings, drawings, artistic creations, patterns, abstract designs)
                    - 'other' (anything that doesn't clearly fit the above categories)

                    CRITICAL: Analyze the actual visual content:
                    - If you see plants, trees, flowers, gardens, or any green vegetation → 'nature'
                    - If you see people or human faces → 'people'
                    - If you see buildings or rooms → 'architecture'
                    - If you see food items → 'food'
                    - If you see furniture or products → 'objects'
                    - If you see electronics → 'technology'

                    Respond with only the category name.`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:${image.format};base64,${base64Image}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 10,
              timeout: 30000 // 30 second timeout
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          const category = result.choices?.[0]?.message?.content?.trim().toLowerCase();
          
          if (!category) {
            throw new Error('No category returned from OpenAI');
          }
          
          const validatedCategory = this.validateCategory(category);
          if (!validatedCategory) {
            this.logger.warn(`Invalid category from OpenAI: "${category}", using 'other'`);
            return 'other';
          }
          
          return validatedCategory;
          
        } catch (error) {
          lastError = error;
          retries--;
          if (retries > 0) {
            this.logger.warn(`Retrying OpenAI analysis for ${image.filename}, retries left: ${retries}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          }
        }
      }
      
      throw new Error(`OpenAI categorization failed after retries: ${lastError?.message || 'Unknown error'}`);
      
    } catch (error) {
      this.logger.error(`OpenAI analysis failed for ${image.filename}: ${error.message}`);
      throw error;
    }
  }

  private categorizeByHeuristics(image: DownloadedImage): string {
    const filename = image.filename.toLowerCase();
    const url = image.originalUrl.toLowerCase();
    
    if (this.containsKeywords([filename, url], ['person', 'people', 'face', 'portrait', 'human'])) {
      return 'people';
    }
    
    if (this.containsKeywords([filename, url], [
      'nature', 'landscape', 'animal', 'plant', 'tree', 'flower', 'mountain', 'forest',
      'garden', 'botanical', 'green', 'leaf', 'leaves', 'foliage', 'vegetation',
      'flora', 'herb', 'shrub', 'bush', 'grass', 'meadow', 'wildflower',
      'palm', 'fern', 'moss', 'vine', 'cactus', 'succulent', 'bamboo',
      'outdoor', 'natural', 'organic', 'eco', 'environment', 'wildlife'
    ])) {
      return 'nature';
    }
    
    if (this.containsKeywords([filename, url], ['product', 'item', 'object', 'tool', 'device'])) {
      return 'objects';
    }
    
    if (this.containsKeywords([filename, url], ['building', 'architecture', 'house', 'structure', 'interior'])) {
      return 'architecture';
    }
    
    if (this.containsKeywords([filename, url], ['food', 'meal', 'drink', 'restaurant', 'cooking'])) {
      return 'food';
    }
    
    if (this.containsKeywords([filename, url], ['tech', 'computer', 'phone', 'electronic', 'gadget'])) {
      return 'technology';
    }
    
    if (this.containsKeywords([filename, url], ['art', 'painting', 'drawing', 'creative', 'design'])) {
      return 'art';
    }
    
    return 'other';
  }

  private containsKeywords(sources: string[], keywords: string[]): boolean {
    return keywords.some(keyword => 
      sources.some(source => source.includes(keyword))
    );
  }

  private validateCategory(category: string): string | null {
    const validCategories = [
      'people', 'nature', 'objects', 'architecture', 
      'food', 'technology', 'art', 'other'
    ];
    
    return validCategories.includes(category) ? category : null;
  }

  private async createCategoryFolder(category: string): Promise<string> {
    const basePath = './downloads';
    const categoryPath = path.join(basePath, category);
    
    if (!fs.existsSync(categoryPath)) {
      fs.mkdirSync(categoryPath, { recursive: true });
    }
    
    return categoryPath;
  }

  private async moveImagesToCategoryFolder(images: DownloadedImage[], folderPath: string): Promise<void> {
    for (const image of images) {
      const newPath = path.join(folderPath, image.filename);
      
      try {
        await fs.promises.rename(image.localPath, newPath);
        image.localPath = newPath;
      } catch (error) {
        this.logger.error(`Failed to move ${image.filename} to ${folderPath}: ${error.message}`);
      }
    }
  }
}
