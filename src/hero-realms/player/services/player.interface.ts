import type { Player } from '@prisma/client';
import type { HeroRaw } from 'src/hero-realms/hero/services/hero/hero.interface';

export type PlayerWithHeroesRaw = Player & { heroes: HeroRaw[] };
