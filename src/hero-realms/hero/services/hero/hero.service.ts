import { Injectable } from '@nestjs/common';
import { ActionCondition, HeroPlacement, PrismaClient } from '@prisma/client';
import omit from 'lodash.omit';

import { CONVERT_ACTION_CONDITION } from '../../enums/action-condition.enum';
import { ADDITIONAL_ACTION_INFO } from './hero.constant';
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
import { SocketService } from 'libs/socket/services/socket.service';
import { HeroHelperService } from './helper/hero-herlper.service';

import type { ActionWithoutAdditionalInfo, HeroStats } from './hero.interface';
import type { HireHeroDto } from '../../controllers/dtos/hire-hero.dto';
import type { UseHeroActionsDto } from '../../controllers/dtos/use-hero-actions.dto';

@Injectable()
export class HeroService {
  constructor(
    private readonly db: PrismaClient,
    private readonly actions: ActionsService,
    private readonly socket: SocketService,
    private readonly heroHelper: HeroHelperService,
  ) {}

  public async getHeroes(byBattlefieldId: number = null) {
    const heroes = await this.db.hero.findMany({
      include: { actions: true },
      where: { battlefieldId: byBattlefieldId },
    });

    const normalizedHeroes = heroes.map((hero) =>
      this.heroHelper.normalizeHero(hero),
    );

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
        ...this.heroHelper.normalizeHero(hero),
        placement: HERO_PLACEMENT.RESET_DECK,
        playerId: player.id,
        battlefieldId: player.battlefieldId,
      };

      const newSupportHero = await this.createHero(omit(nomalized, 'id'));
      this.heroHelper.onUpdateHero(newSupportHero);
    } else {
      const hiredHero = await this.db.hero.update({
        where: { id: dto.heroId },
        data: {
          playerId: dto.playerId,
          placement: dto.putToSelectionDeck
            ? HeroPlacement.SELECTION_DECK
            : HeroPlacement.RESET_DECK,
        },
        include: { actions: true },
      });

      this.heroHelper.onUpdateHero(hiredHero);

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

        const newHeroOnTrading = await this.db.hero.update({
          where: { id: tradingDeckHeroes[newRandomHeroIndex].id },
          data: {
            placement: HeroPlacement.TRADING_ROW,
          },
          include: { actions: true },
        });
        this.heroHelper.onUpdateHero(newHeroOnTrading);
      }
    }

    const updatedPlayer = await this.db.player.update({
      data: {
        currentGoldCount: player.currentGoldCount - hero.price,
      },
      where: {
        id: player.id,
      },
      include: { battlefield: { include: { players: true } } },
    });

    this.socket.notifyAllSubsribers(
      CLIENT_MESSAGES.PLAYERS_UPDATED,
      updatedPlayer.battlefield.players,
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

    if (hero.protection && hero.placement !== HeroPlacement.DEFENDERS_ROW) {
      const updatedHero = await this.db.hero.update({
        where: { id: hero.id },
        data: { placement: HeroPlacement.DEFENDERS_ROW },
        include: { actions: true },
      });

      this.heroHelper.onUpdateHero(updatedHero);
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
        const droppedHero = await this.db.hero.update({
          where: { id: dto.heroIdForAction },
          data: { placement: HeroPlacement.SACRIFICIAL_DECK },
          include: { actions: true },
        });

        this.heroHelper.onUpdateHero(droppedHero);
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

    const updatedPlayer = await this.db.player.update({
      where: { id: player.id },
      data: {
        currentDamageCount: player.currentDamageCount,
        currentGoldCount: player.currentGoldCount,
        health: Math.min(player.health, MAX_PLAYER_HP),
        guaranteedHeroes: player.guaranteedHeroes,
      },
      include: { battlefield: { include: { players: true } } },
    });

    this.socket.notifyAllSubsribers(
      CLIENT_MESSAGES.PLAYERS_UPDATED,
      updatedPlayer.battlefield.players,
    );
  }
}
