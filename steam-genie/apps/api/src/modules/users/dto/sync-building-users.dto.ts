import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SyncBuildingUsersDto {
  @IsUUID()
  roleId!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds!: string[];
}
