import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TicketPriority } from '@pulsedesk/db';

export class CreateTicketDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
