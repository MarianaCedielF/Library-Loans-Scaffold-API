import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'Clean Code' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ example: 'Robert C. Martin' })
  @IsString()
  @MinLength(1)
  author: string;

  @ApiPropertyOptional({ example: '978-0132350884' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ example: 'A handbook of agile software craftsmanship.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 5, minimum: 1 })
  @IsInt()
  @Min(1)
  totalCopies: number;
}
