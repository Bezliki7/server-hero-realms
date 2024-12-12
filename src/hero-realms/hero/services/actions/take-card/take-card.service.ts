import { Injectable } from '@nestjs/common';
import { HeroPlacement, PrismaClient } from '@prisma/client';

import countForEveryValue from 'src/hero-realms/hero/utils/count-for-every-value';
import { getRandomNumbers } from 'src/hero-realms/utils/math';
import { HeroHelperService } from '../../hero/helper/hero-herlper.service';

import { IAction, type UseActionDto } from '../action.interface';

@Injectable()
export class TakeCardActionService extends IAction {
  constructor(
    private readonly db: PrismaClient,
    private readonly heroHelper: HeroHelperService,
  ) {
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
      (hero) =>
        hero.placement === HeroPlacement.SELECTION_DECK ||
        hero.placement === HeroPlacement.RESET_DECK,
    );

    let takedCardCount = 0;
    const randomCards = getRandomNumbers(
      0,
      playerSelectionDeck.length - 1,
      takeCardValue - dto.player.guaranteedHeroes.length,
    );
    console.log({ randomCards });
    console.log(
      'guaranteed',
      dto.player.guaranteedHeroes,
      playerSelectionDeck.map((h) => h.name),
    );
    for (const [index, hero] of playerSelectionDeck.entries()) {
      if (takedCardCount >= takeCardValue) {
        break;
      }

      if (
        randomCards.includes(index) ||
        dto.player.guaranteedHeroes.includes(hero.id)
      ) {
        takedCardCount++;
        const updatedHero = await this.db.hero.update({
          where: { id: hero.id },
          data: { placement: HeroPlacement.ACTIVE_DECK },
          include: { actions: true },
        });

        this.heroHelper.onUpdateHero(updatedHero);

        if (dto.player.guaranteedHeroes.includes(hero.id)) {
          dto.player.guaranteedHeroes = dto.player.guaranteedHeroes.filter(
            (heroId) => heroId !== hero.id,
          );
        }
      }
    }
  }
}
