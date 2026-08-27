import { IsString, MinLength } from 'class-validator';

export class CreateConversationDto {
  /** Anonymous client-generated identifier (e.g. persisted in the widget's
   * localStorage) used to recognize a returning visitor. Not a credential —
   * anyone can present any value; the resulting token is only ever scoped
   * to the one conversation it names, never to arbitrary access. */
  @IsString()
  @MinLength(1)
  customerSessionId!: string;
}
