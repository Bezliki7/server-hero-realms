import { Injectable } from '@nestjs/common';
import { HeroPlacement, PrismaClient } from '@prisma/client';

import { HeroHelperService } from '../../hero/helper/hero-herlper.service';

import { IAction, type UseActionDto } from '../action.interface';

@Injectable()
export class PutToDeckResetedCardActionService extends IAction {
  constructor(
    private readonly db: PrismaClient,
    private readonly heroHelper: HeroHelperService,
  ) {
    super();
  }

  public async useAction(dto: UseActionDto) {
    if (dto.heroIdForAction) {
      const updatedHero = await this.db.hero.update({
        where: { id: dto.heroIdForAction },
        data: {
          placement: HeroPlacement.SELECTION_DECK,
        },
        include: { actions: true },
      });

      this.heroHelper.onUpdateHero(updatedHero);

      dto.player.guaranteedHeroes.push(dto.heroIdForAction);
      await this.db.player.update({
        where: { id: dto.player.id },
        data: { guaranteedHeroes: dto.player.guaranteedHeroes },
      });
    }
  }
}
