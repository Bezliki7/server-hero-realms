import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { getPlacementForUsedAction } from 'src/hero-realms/hero/utils/get-info-for-used-action';
import { HeroHelperService } from '../../hero/helper/hero-herlper.service';

import { IAction, type UseActionDto } from '../action.interface';

@Injectable()
export class ActionsWithUpdatePlacementService extends IAction {
  constructor(
    private readonly db: PrismaClient,
    private readonly heroHelper: HeroHelperService,
  ) {
    super();
  }

  public async useAction(dto: UseActionDto) {
    const placement = getPlacementForUsedAction(dto.actionName);

    if (dto.heroIdForAction && placement) {
      const updatedHero = await this.db.hero.update({
        where: { id: dto.heroIdForAction },
        data: {
          placement,
        },
        include: { actions: true },
      });

      this.heroHelper.onUpdateHero(updatedHero);
    }
  }
}
