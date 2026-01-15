import type { RegistrationDto } from '../controllers/dtos/registration.dto';

export type GenerateTokensDto = { userId: number } & RegistrationDto;
