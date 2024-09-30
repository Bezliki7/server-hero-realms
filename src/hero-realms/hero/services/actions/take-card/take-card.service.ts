import { Injectable } from '@nestjs/common';
import { HeroPlacement, PrismaClient } from '@prisma/client';

import countForEveryValue from 'src/hero-realms/hero/utils/count-for-every-value';
import { getRandomNumbers } from 'src/hero-realms/utils/math';

import { IAction, type UseActionDto } from '../action.interface';

@Injectable()
export class TakeCardActionService extends IAction {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  public async useAction(dto: UseActionDto) {
    const takeCardValue = countForEveryValue({
      value: dto.value,
      defendersCount: dto.defendersCount,
      guardiansCount: dto.guardiansCount,
      conditions: dto.action.conditions,
      fractionCount: dto.fractionHeroes.length,
    });

    const playerSelectionDeck = dto.player.heroes.filter(
      (hero) => hero.placement === HeroPlacement.SELECTION_DECK,
    );

    let takedCardCount = 0;
    const randomCards = getRandomNumbers(
      0,
      playerSelectionDeck.length - 1,
      takeCardValue - dto.player.guaranteedHeroes.length,
    );
    console.log(randomCards);
    console.log(dto.player.guaranteedHeroes);
    for (const [index, hero] of playerSelectionDeck.entries()) {
      if (takedCardCount >= takeCardValue) {
        break;
      }

      if (
        randomCards.includes(index) ||
        dto.player.guaranteedHeroes.includes(hero.id)
      ) {
        takedCardCount++;
        await this.db.hero.updateMany({
          where: { id: hero.id },
          data: { placement: HeroPlacement.ACTIVE_DECK },
        });

        if (dto.player.guaranteedHeroes.includes(hero.id)) {
          dto.player.guaranteedHeroes = dto.player.guaranteedHeroes.filter(
            (heroId) => heroId !== hero.id,
          );
        }
      }
    }
  }
}
