import { IsEnum } from 'class-validator';
import { TicketStatus } from '@pulsedesk/db';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;
}
