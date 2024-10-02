import { Injectable } from '@nestjs/common';
import { HeroPlacement, PrismaClient } from '@prisma/client';

import { getRandomNumbers } from 'src/hero-realms/utils/math';
import { PLAYER_ACTIVE_DECK_COUNT } from '../player.constant';

import type { PlayerWithHeroesRaw } from '../player.interface';

@Injectable()
export class PlayerHelperService {
  constructor(private readonly db: PrismaClient) {}

  public async takeActiveDeck(player: PlayerWithHeroesRaw) {
    let currentActiveDeckCount = 0;

    const selectionPlayerDeck = player.heroes.filter(
      (hero) =>
        hero.placement === HeroPlacement.SELECTION_DECK &&
        !player.guaranteedHeroes.includes(hero.id),
    );

    for (const heroId of player.guaranteedHeroes) {
      if (currentActiveDeckCount < PLAYER_ACTIVE_DECK_COUNT) {
        currentActiveDeckCount++;
        await this.db.hero.update({
          where: { id: heroId },
          data: {
            actions: {
              updateMany: {
                where: { heroId },
                data: { isUsed: false },
              },
            },
            placement: HeroPlacement.ACTIVE_DECK,
          },
        });
      } else {
        break;
      }
    }

    const randomNumbersLength =
      PLAYER_ACTIVE_DECK_COUNT - currentActiveDeckCount;

    const newRandomActiveDeck = getRandomNumbers(
      0,
      selectionPlayerDeck.length - 1,
      randomNumbersLength,
    );

    for (const [index, hero] of selectionPlayerDeck.entries()) {
      if (newRandomActiveDeck.includes(index)) {
        await this.db.hero.update({
          where: { id: hero.id },
          data: {
            actions: {
              updateMany: {
                where: { heroId: hero.id },
                data: { isUsed: false },
              },
            },
            placement: HeroPlacement.ACTIVE_DECK,
          },
        });
      }
    }

    const selectionDeckCountWithGuarantHeroes =
      selectionPlayerDeck.length + player.guaranteedHeroes.length;

    if (selectionDeckCountWithGuarantHeroes < PLAYER_ACTIVE_DECK_COUNT) {
      const resetPlayerDeck = player.heroes.filter(
        (hero) =>
          hero.placement === HeroPlacement.RESET_DECK ||
          hero.placement === HeroPlacement.ACTIVE_DECK,
      );

      const newRandomActiveDeckIndexes = getRandomNumbers(
        0,
        resetPlayerDeck.length - 1,
        PLAYER_ACTIVE_DECK_COUNT - selectionPlayerDeck.length,
      );

      for (const [index, hero] of resetPlayerDeck.entries()) {
        await this.db.hero.update({
          where: { id: hero.id },
          data: {
            placement: newRandomActiveDeckIndexes.includes(index)
              ? HeroPlacement.ACTIVE_DECK
              : HeroPlacement.SELECTION_DECK,
          },
        });
      }
    }
  }
}