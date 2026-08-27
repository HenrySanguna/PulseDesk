import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { MessageVisibility } from '@pulsedesk/db';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(MessageVisibility)
  visibility?: MessageVisibility;
}
