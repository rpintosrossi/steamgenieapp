import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequiredRoles } from '../../common/decorators/required-roles.decorator';
import { GoogleGeocodingService } from './google-geocoding.service';

@Controller('geocoding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GeocodingController {
  constructor(private readonly googleGeocoding: GoogleGeocodingService) {}

  @Get('autocomplete')
  @RequiredRoles('admin', 'manager')
  autocomplete(
    @Query('q') q?: string,
    @Query('sessionToken') sessionToken?: string,
    @Query('biasLat') biasLat?: string,
    @Query('biasLon') biasLon?: string,
  ) {
    const lat = biasLat != null && biasLat !== '' ? Number(biasLat) : undefined;
    const lon = biasLon != null && biasLon !== '' ? Number(biasLon) : undefined;
    return this.googleGeocoding.autocomplete(q ?? '', {
      sessionToken: sessionToken?.trim() || undefined,
      biasLat: Number.isFinite(lat) ? lat : undefined,
      biasLon: Number.isFinite(lon) ? lon : undefined,
      max: 8,
    });
  }

  @Get('place')
  @RequiredRoles('admin', 'manager')
  placeDetails(
    @Query('placeId') placeId?: string,
    @Query('sessionToken') sessionToken?: string,
  ) {
    return this.googleGeocoding.placeDetails(placeId ?? '', {
      sessionToken: sessionToken?.trim() || undefined,
    });
  }
}
