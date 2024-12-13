import { Injectable } from '@nestjs/common';
import { HeroPlacement, PrismaClient } from '@prisma/client';

import { HeroHelperService } from 'src/hero-realms/hero/services/hero/helper/hero-herlper.service';
import { getRandomNumbers } from 'src/hero-realms/utils/math';
import { PLAYER_ACTIVE_DECK_COUNT } from '../player.constant';

import type { PlayerWithHeroesRaw } from '../player.interface';

@Injectable()
export class PlayerHelperService {
  constructor(
    private readonly db: PrismaClient,
    private readonly heroHelper: HeroHelperService,
  ) {}

  public async updateActiveDeck(player: PlayerWithHeroesRaw) {
    try {
      console.log('updateActiveDeck');
      for (const hero of player.heroes) {
        if (hero.placement === HeroPlacement.ACTIVE_DECK) {
          const resetedHero = await this.db.hero.update({
            where: { id: hero.id },
            data: { placement: HeroPlacement.RESET_DECK },
            include: { actions: true },
          });

          this.heroHelper.onUpdateHero(resetedHero);
        }

        await this.db.action.updateMany({
          where: { heroId: hero.id, isUsed: true },
          data: { isUsed: false },
        });
      }

      let currentActiveDeckCount = 0;

      console.log(player.guaranteedHeroes);

      for (const heroId of player.guaranteedHeroes) {
        if (currentActiveDeckCount < PLAYER_ACTIVE_DECK_COUNT) {
          currentActiveDeckCount++;
          const newActiveHero = await this.db.hero.update({
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
            include: { actions: true },
          });

          this.heroHelper.onUpdateHero(newActiveHero);
        } else {
          break;
        }
      }
      console.log({ currentActiveDeckCount });
      const selectionPlayerDeck = player.heroes.filter(
        (hero) =>
          hero.placement === HeroPlacement.SELECTION_DECK &&
          !player.guaranteedHeroes.includes(hero.id),
      );

      const randomNumbersLength =
        PLAYER_ACTIVE_DECK_COUNT - currentActiveDeckCount;

      const newRandomActiveDeck = getRandomNumbers(
        0,
        selectionPlayerDeck.length - 1,
        randomNumbersLength,
      );

      for (const [index, hero] of selectionPlayerDeck.entries()) {
        if (newRandomActiveDeck.includes(index)) {
          const newActiveHero = await this.db.hero.update({
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
            include: { actions: true },
          });

          this.heroHelper.onUpdateHero(newActiveHero);
        }
      }

      const totalSelectionDeckCount =
        selectionPlayerDeck.length + player.guaranteedHeroes.length;

      if (totalSelectionDeckCount < PLAYER_ACTIVE_DECK_COUNT) {
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
          const newActiveHero = await this.db.hero.update({
            where: { id: hero.id },
            data: {
              placement: newRandomActiveDeckIndexes.includes(index)
                ? HeroPlacement.ACTIVE_DECK
                : HeroPlacement.SELECTION_DECK,
            },
            include: { actions: true },
          });

          this.heroHelper.onUpdateHero(newActiveHero);
        }
      }
      console.log('end');
    } catch (error) {
      console.log(error);
    }
  }
}
