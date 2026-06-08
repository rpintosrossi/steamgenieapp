import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class AssignWorkOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  userIds!: string[];
}
