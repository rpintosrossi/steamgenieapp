import { IsUUID, IsOptional } from 'class-validator';

export class AssignBuildingRoleDto {
  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;
}
