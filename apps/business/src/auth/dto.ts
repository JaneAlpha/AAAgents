import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

export const VARIETIES = ['苹果', '红枣'] as const;
export type Variety = (typeof VARIETIES)[number];

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  enterprise_name!: string;

  @IsIn(VARIETIES as unknown as string[])
  variety!: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
