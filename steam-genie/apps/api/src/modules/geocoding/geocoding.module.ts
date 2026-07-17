import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GeocodingController } from './geocoding.controller';
import { GoogleGeocodingService } from './google-geocoding.service';

@Module({
  controllers: [GeocodingController],
  providers: [GoogleGeocodingService, RolesGuard],
  exports: [GoogleGeocodingService],
})
export class GeocodingModule {}
