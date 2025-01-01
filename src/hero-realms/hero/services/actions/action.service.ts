import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { TakeCardActionService } from './take-card/take-card.service';
import { DamageActionService } from './damage/damage.service';
import { GoldActionService } from './gold/gold.service';
import { ResetOpponentsCardActionService } from './reset-opponents-card/reset-opponents-card.service';
import { PutToDeckResetedCardActionService } from './put-to-deck-reseted-card/put-to-deck-reseted-card.service';
import { HealActionService } from './heal/heal.service';
import { ActionsWithUpdatePlacementService } from './actions-with-update-placement/actions-with-update-placement.service';
import { ACTIONS_WITH_UPDATE_PLACEMENT } from './action.constant';
import { HeroHelperService } from '../hero/helper/hero-herlper.service';

import type { UseActionDto } from './action.interface';

@Injectable()
export class ActionsService {
  constructor(
    readonly db: PrismaClient,
    readonly actionsWithUpdatePlacement: ActionsWithUpdatePlacementService,
    readonly damageAction: DamageActionService,
    readonly goldAction: GoldActionService,
    readonly healAction: HealActionService,
    readonly putToDeckResetedCardAction: PutToDeckResetedCardActionService,
    readonly resetOpponentsCardAction: ResetOpponentsCardActionService,
    readonly takeCardAction: TakeCardActionService,
    readonly heroHelper: HeroHelperService,
  ) {}

  public async useAction(dto: UseActionDto) {
    const actionServiceName = this.getActionServiceName(dto.actionName);

    if (!actionServiceName) {
      return;
    }

    await this[actionServiceName].useAction(dto);

    if (dto.action.isOptional && !dto.heroIdForAction) {
      return;
    }

    const usedAction = await this.db.action.update({
      where: { id: dto.action.id },
      data: { isUsed: true },
      include: { hero: { include: { actions: true } } },
    });

    this.heroHelper.onUpdateHero(usedAction.hero);
  }

  private getActionServiceName(actionName: string) {
    if (ACTIONS_WITH_UPDATE_PLACEMENT.includes(actionName)) {
      return 'actionsWithUpdatePlacement';
    }

    return `${actionName}Action`;
  }
}
