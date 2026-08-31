import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SyncExcludedBuildingsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  buildingIds!: string[];
}
