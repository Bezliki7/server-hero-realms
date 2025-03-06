import type { Battlefield, Player } from '@prisma/client';

import type { HeroRaw } from 'src/hero-realms/hero/services/hero/hero.interface';

export type PrepareBattlefieldDto = {
  id: number;
};

export type RawBattlefield = Battlefield & {
  heroes: HeroRaw[];
  players: (Player & {
    heroes?: HeroRaw[];
  })[];
};
