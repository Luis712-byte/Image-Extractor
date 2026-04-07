import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageExtractorModule } from './image-extractor.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ImageExtractorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
