import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import countForEveryValue from 'src/hero-realms/hero/utils/count-for-every-value';

import { IAction, type UseActionDto } from '../action.interface';

@Injectable()
export class DamageActionService extends IAction {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  public async useAction(dto: UseActionDto) {
    const damage = countForEveryValue({
      value: dto.value,
      defendersCount: dto.defendersCount,
      guardiansCount: dto.guardiansCount,
      conditions: dto.action.conditions,
      fractionCount: dto.fractionHeroes.length,
    });

    dto.player.currentDamageCount += damage;
  }
}