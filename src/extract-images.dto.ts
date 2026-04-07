import { IsString, IsUrl, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export class ExtractImagesDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsString()
  outputDirectory?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxImages?: number;

  @IsOptional()
  @IsString()
  aiProvider?: 'openai' | 'claude' | 'gemini' | 'heuristics';

  @IsOptional()
  @IsBoolean()
  visualAnalysis?: boolean;

  @IsOptional()
  @IsBoolean()
  followLinks?: boolean;
}
