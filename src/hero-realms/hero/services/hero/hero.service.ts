import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ActionCondition, HeroPlacement, PrismaClient } from '@prisma/client';
import omit from 'lodash.omit';

import { CONVERT_ACTION_CONDITION } from '../../enums/action-condition.enum';
import { ADDITIONAL_ACTION_INFO } from './hero.constant';
import { BattlefieldService } from 'src/hero-realms/battlefield/services/battlefield.service';
import {
  CONVERT_HERO_PLACEMENT,
  HERO_PLACEMENT,
} from '../../enums/hero-placement.enum';
import { CLIENT_MESSAGES } from 'src/hero-realms/battlefield/battlefield.constant';
import { getRandomNumber } from 'src/hero-realms/utils/math';
import {
  getHeroesInfo,
  getIsActionCanBeUsed,
} from '../../utils/get-info-for-used-action';
import { ActionsService } from '../actions/action.service';
import { MAX_PLAYER_HP } from 'src/hero-realms/player/services/player.constant';

import type {
  ActionWithoutAdditionalInfo,
  HeroRaw,
  HeroStats,
} from './hero.interface';
import type { HireHeroDto } from '../../controllers/dtos/hire-hero.dto';
import type { UseHeroActionsDto } from '../../controllers/dtos/use-hero-actions.dto';

@Injectable()
export class HeroService {
  constructor(
    private readonly db: PrismaClient,
    @Inject(forwardRef(() => BattlefieldService))
    private readonly battlefield: BattlefieldService,
    private readonly actions: ActionsService,
  ) {}

  public async getHeroes(byBattlefieldId: number = null) {
    const heroes = await this.db.hero.findMany({
      include: { actions: true },
      where: { battlefieldId: byBattlefieldId },
    });

    const normalizedHeroes = heroes.map((hero) => this.normalizeHero(hero));

    return normalizedHeroes;
  }

  public async createHero(hero: HeroStats) {
    const createdHero = await this.db.hero.create({
      data: {
        ...hero,
        placement: CONVERT_HERO_PLACEMENT.TO_BD[hero.placement],
        actions: {
          createMany: {
            data: hero.actions.map((action) => ({
              ...omit(action, ['heroId', 'id']),
              isOptional: action.isOptional,
              conditions: action.conditions.map(
                (condition) => CONVERT_ACTION_CONDITION.TO_DB[condition],
              ),
            })),
          },
        },
      },
      include: { actions: true },
    });

    return createdHero;
  }

  public async hireHero(dto: HireHeroDto) {
    const player = await this.db.player.findUnique({
      where: { id: dto.playerId },
      include: { heroes: { include: { actions: true } } },
    });

    const hero = await this.db.hero.findUnique({
      where: { id: dto.heroId },
      include: { actions: true },
    });

    if (!player || !hero) {
      return;
    }

    if (!player.currentTurnPlayer) {
      return 'Сейчас ход другого игрока';
    }

    if (player.currentGoldCount < hero.price) {
      return 'Недостаточно голды';
    }

    if (hero.placement === HeroPlacement.SUPPORTS_ROW) {
      const nomalized = {
        ...this.normalizeHero(hero),
        placement: HERO_PLACEMENT.RESET_DECK,
      };

      const newH = await this.createHero(omit(nomalized, 'id'));
      await this.db.hero.update({
        where: { id: newH.id },
        data: { playerId: player.id, battlefieldId: player.battlefieldId },
      });
    } else {
      await this.db.hero.update({
        where: { id: dto.heroId },
        data: {
          playerId: dto.playerId,
          placement: dto.putToSelectionDeck
            ? HeroPlacement.SELECTION_DECK
            : HeroPlacement.RESET_DECK,
        },
      });

      const tradingDeckHeroes = await this.db.hero.findMany({
        where: {
          battlefieldId: player.battlefieldId,
          placement: HeroPlacement.TRADING_DECK,
        },
      });

      if (tradingDeckHeroes.length) {
        const newRandomHeroIndex = getRandomNumber(
          0,
          tradingDeckHeroes.length - 1,
        );

        await this.db.hero.update({
          where: { id: tradingDeckHeroes[newRandomHeroIndex].id },
          data: {
            placement: HeroPlacement.TRADING_ROW,
          },
        });
      }
    }

    await this.db.player.update({
      data: {
        currentGoldCount: player.currentGoldCount - hero.price,
      },
      where: {
        id: player.id,
      },
    });

    await this.battlefield.getBattlefieldAndNotifyAllSubs(
      CLIENT_MESSAGES.BATTLEFIELD_UPDATED,
      player.battlefieldId,
    );
  }

  public async useHeroActions(dto: UseHeroActionsDto) {
    const hero = await this.db.hero.findUnique({
      where: { id: dto.heroId },
      include: { actions: true, battlefield: { include: { players: true } } },
    });

    const player = await this.db.player.findUnique({
      where: { id: dto.playerId },
      include: { heroes: true },
    });
    const [opponentPlayer] = hero.battlefield.players.filter(
      ({ id }) => id !== player.id,
    );

    if (!(hero && player && opponentPlayer)) {
      return;
    }

    if (hero.protection) {
      await this.db.hero.update({
        where: { id: hero.id },
        data: { placement: HeroPlacement.DEFENDERS_ROW },
      });
    }

    const { defendersCount, fractionHeroes, guardiansCount } = getHeroesInfo(
      player.heroes,
      hero,
    );

    for (const action of hero.actions) {
      const isSacrificeSelf =
        dto.heroId === dto.heroIdForAction &&
        action.conditions.includes(ActionCondition.SACRIFICE);

      if (isSacrificeSelf) {
        await this.db.hero.updateMany({
          where: { id: dto.heroIdForAction },
          data: { placement: HeroPlacement.SACRIFICIAL_DECK },
        });
      }

      const isActionCanBeUsed = getIsActionCanBeUsed(
        action,
        dto,
        hero.name,
        fractionHeroes.length,
      );

      if (!isActionCanBeUsed) {
        continue;
      }

      const actionTypes = omit(
        action,
        ADDITIONAL_ACTION_INFO,
      ) as ActionWithoutAdditionalInfo;

      for (const [actionName, actionValue] of Object.entries(actionTypes)) {
        if (!actionValue) {
          continue;
        }

        await this.actions.useAction({
          action,
          actionName,
          value: actionValue,
          defendersCount,
          guardiansCount,
          fractionHeroes: fractionHeroes,
          player,
          opponentPlayer,
          heroIdForAction: dto.heroIdForAction,
          heroId: hero.id,
        });
      }
    }

    await this.db.player.update({
      where: { id: player.id },
      data: {
        currentDamageCount: player.currentDamageCount,
        currentGoldCount: player.currentGoldCount,
        health: Math.min(player.health, MAX_PLAYER_HP),
        guaranteedHeroes: player.guaranteedHeroes,
      },
    });

    await this.battlefield.getBattlefieldAndNotifyAllSubs(
      CLIENT_MESSAGES.BATTLEFIELD_UPDATED,
      player.battlefieldId,
    );
  }

  public normalizeHero(hero: HeroRaw) {
    return {
      ...hero,
      placement: CONVERT_HERO_PLACEMENT.FROM_BD[hero.placement],
      actions: hero.actions.map((action) => ({
        ...action,
        conditions: action.conditions.map(
          (condition) => CONVERT_ACTION_CONDITION.FROM_DB[condition],
        ),
        damage: action.damage || undefined,
        gold: action.gold || undefined,
        prepareHero: action.prepareHero || undefined,
        putPurchasedCardIntoDeck: action.putPurchasedCardIntoDeck || undefined,
        putToDeckResetedDefender: action.putToDeckResetedDefender || undefined,
        putToDeckResetedCard: action.putToDeckResetedCard || undefined,
        heal: action.heal || undefined,
        sacrificeCard: action.sacrificeCard || undefined,
        resetCard: action.resetCard || undefined,
        resetOpponentsCard: action.resetOpponentsCard || undefined,
        stanOpponentsHero: action.stanOpponentsHero || undefined,
        takeCard: action.takeCard || undefined,
      })),
    };
  }
}
