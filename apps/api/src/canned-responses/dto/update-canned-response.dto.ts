import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  shortcut?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;
}
