import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'jane@example.com' }) email: string;
  @ApiProperty({ nullable: true, type: String }) firstName: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName: string | null;
}
