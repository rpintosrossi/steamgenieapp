import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SyncExcludedBranchesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  branchIds!: string[];
}
