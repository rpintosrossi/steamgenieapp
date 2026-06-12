import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SyncBuildingRolesDto {
  @IsUUID()
  roleId!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  buildingIds!: string[];
}
