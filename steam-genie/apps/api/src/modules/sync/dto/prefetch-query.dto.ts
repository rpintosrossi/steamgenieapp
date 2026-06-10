import { IsUUID } from 'class-validator';

export class PrefetchQueryDto {
  @IsUUID()
  buildingId!: string;
}
