import { forwardRef, Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import { ActionCondition, HeroPlacement, PrismaClient } from '@prisma/client';
import omit from 'lodash.omit';

import { CONVERT_ACTION_CONDITION } from '../enums/action-condition.enum';
import {
  ACTION_TYPE,
  ADDITIONAL_ACTION_INFO,
  DATASET_PATH_FILE,
  MAX_PLAYER_HP,
} from './hero.constant';
import { BattlefieldService } from 'src/hero-realms/battlefield/services/battlefield.service';
import { CONVERT_HERO_PLACEMENT } from '../enums/hero-placement.enum';
import { CLIENT_MESSAGES } from 'src/hero-realms/battlefield/battlefield.constant';
import { getRandomNumber, getRandomNumbers } from 'src/hero-realms/utils/math';
import countForEveryValue from '../utils/count-for-every-value';
import {
  getHeroesInfo,
  getIsActionCanBeUsed,
  getPlacementForUsedAction,
} from '../utils/get-info-for-used-action';
import { SocketService } from 'libs/socket/services/socket.service';

import type {
  ActionWithoutAdditionalInfo,
  Dataset,
  HeroRaw,
  HeroStats,
} from './hero.interface';
import type { HireHeroDto } from '../controllers/dtos/hire-hero.dto';
import type { UseHeroActionsDto } from '../controllers/dtos/use-hero-actions.dto';

@Injectable()
export class HeroService {
  constructor(
    private readonly db: PrismaClient,
    @Inject(forwardRef(() => BattlefieldService))
    private readonly battlefield: BattlefieldService,
    private readonly socket: SocketService,
  ) {}

  public async getHeroes() {
    const heroes = await this.db.hero.findMany({ include: { actions: true } });

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
              isOptional: action.isOptional,
              conditions: action.conditions.map(
                (condition) => CONVERT_ACTION_CONDITION.TO_DB[condition],
              ),
              damage: action.damage ?? 0,
              gold: action.gold ?? 0,
              heal: action.heal ?? 0,
              prepareHero: action.prepareHero ?? 0,
              takeCard: action.takeCard ?? 0,
              sacrificeCard: action.sacrificeCard ?? 0,
              resetCard: action.resetCard ?? 0,
              resetOpponentsCard: action.resetOpponentsCard ?? 0,
              stanOpponentsHero: action.stanOpponentsHero ?? 0,
              putToDeckResetedCard: action.putToDeckResetedCard ?? 0,
              putToDeckResetedDefender: action.putToDeckResetedDefender ?? 0,
              putPurchasedCardIntoDeck: action.putPurchasedCardIntoDeck ?? 0,
            })),
          },
        },
      },
      include: { actions: true },
    });

    return createdHero;
  }

  public async applyDataset() {
    try {
      const data = await fs.readFile(DATASET_PATH_FILE, 'utf8');
      const { heroes } = JSON.parse(data) as Dataset;

      for (const hero of heroes) {
        const isExist = await this.db.hero.findFirst({
          where: { name: hero.name },
        });

        if (!isExist) {
          await this.createHero(hero);
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  public async hireHero(dto: HireHeroDto) {
    const player = await this.db.player.findUnique({
      where: { id: dto.playerId },
      include: { heroes: { include: { actions: true } } },
    });

    const hero = await this.db.hero.findUnique({ where: { id: dto.heroId } });

    if (!player || !hero) {
      return;
    }

    if (!player.currentTurnPlayer) {
      return 'Сейчас ход другого игрока';
    }

    if (player.currentGoldCount < hero.price) {
      return 'Недостаточно голды';
    }

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

    if (!hero || !player || !opponentPlayer) {
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

    let { currentDamageCount, currentGoldCount, health } = player;

    for (const action of hero.actions) {
      const isActionCanBeUsed = getIsActionCanBeUsed(
        action,
        dto,
        fractionHeroes.length,
      );

      if (!isActionCanBeUsed) {
        continue;
      }

      const isSacrificeSelf =
        dto.heroId === dto.heroIdForAction &&
        action.conditions.includes(ActionCondition.SACRIFICE);

      if (isSacrificeSelf) {
        await this.db.hero.updateMany({
          where: { id: dto.heroIdForAction },
          data: { placement: HeroPlacement.SACRIFICIAL_DECK },
        });
      }

      const actionTypes = omit(
        action,
        ADDITIONAL_ACTION_INFO,
      ) as ActionWithoutAdditionalInfo;

      for (const [actionName, actionValue] of Object.entries(actionTypes)) {
        if (!actionValue) {
          continue;
        }

        switch (actionName) {
          case ACTION_TYPE.DAMAGE: {
            const damage = countForEveryValue({
              value: actionValue,
              defendersCount,
              guardiansCount,
              conditions: action.conditions,
              fractionCount: hero.protection
                ? fractionHeroes.length + 1
                : fractionHeroes.length,
            });
            currentDamageCount += damage;
            break;
          }

          case ACTION_TYPE.GOLD: {
            const gold = countForEveryValue({
              value: actionValue,
              defendersCount,
              guardiansCount,
              conditions: action.conditions,
              fractionCount: fractionHeroes.length,
            });
            currentGoldCount += gold;
            break;
          }

          case ACTION_TYPE.HEAL: {
            const heal = countForEveryValue({
              value: actionValue,
              defendersCount,
              guardiansCount,
              conditions: action.conditions,
              fractionCount: fractionHeroes.length,
            });
            health += heal;
            break;
          }

          case ACTION_TYPE.STAN_OPPONENTS_HERO:
          case ACTION_TYPE.PREPARE_HERO:
          case ACTION_TYPE.SACRIFICE_CARD:
          case ACTION_TYPE.RESET_CARD: {
            const placement = getPlacementForUsedAction(actionName);

            if (dto.heroIdForAction && placement) {
              await this.db.hero.update({
                where: { id: dto.heroIdForAction },
                data: {
                  placement,
                },
              });
            } else {
              continue;
            }

            break;
          }

          case ACTION_TYPE.PUT_TO_DECK_RESETED_CARD: {
            if (dto.heroIdForAction) {
              await this.db.hero.update({
                where: { id: dto.heroIdForAction },
                data: {
                  placement: HeroPlacement.SELECTION_DECK,
                },
              });

              player.guaranteedHeroes.push(dto.heroIdForAction);
              await this.db.player.update({
                where: { id: player.id },
                data: { guaranteedHeroes: player.guaranteedHeroes },
              });
            }
            break;
          }


          case ACTION_TYPE.TAKE_CARD: {
            const takeCardValue = countForEveryValue({
              value: actionValue,
              defendersCount,
              guardiansCount,
              conditions: action.conditions,
              fractionCount: fractionHeroes.length,
            });

            const playerSelectionDeck = player.heroes.filter(
              (hero) => hero.placement === HeroPlacement.SELECTION_DECK,
            );

            let takedCardCount = 0;
            const randomCards = getRandomNumbers(
              0,
              playerSelectionDeck.length - 1,
              takeCardValue - player.guaranteedHeroes.length,
            );
            console.log(randomCards);
            console.log(player.guaranteedHeroes);
            for (const [index, hero] of playerSelectionDeck.entries()) {
              if (takedCardCount >= takeCardValue) {
                break;
              }

              if (
                randomCards.includes(index) ||
                player.guaranteedHeroes.includes(hero.id)
              ) {
                takedCardCount++;
                await this.db.hero.updateMany({
                  where: { id: hero.id },
                  data: { placement: HeroPlacement.ACTIVE_DECK },
                });

                if (player.guaranteedHeroes.includes(hero.id)) {
                  player.guaranteedHeroes = player.guaranteedHeroes.filter(
                    (heroId) => heroId !== hero.id,
                  );
                }
              }
            }
            break;
          }

          default: {
            continue;
          }
        }
      }

      await this.db.action.update({
        where: { id: action.id },
        data: { isUsed: true },
      });
    }

    await this.db.player.update({
      where: { id: player.id },
      data: {
        currentDamageCount,
        currentGoldCount,
        health: health < MAX_PLAYER_HP ? health : MAX_PLAYER_HP,
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
        damage: action.damage ? action.damage : undefined,
        gold: action.gold ? action.gold : undefined,
        prepareHero: action.prepareHero ? action.prepareHero : undefined,
        putPurchasedCardIntoDeck: action.putPurchasedCardIntoDeck
          ? action.putPurchasedCardIntoDeck
          : undefined,
        putToDeckResetedDefender: action.putToDeckResetedDefender
          ? action.putToDeckResetedDefender
          : undefined,
        putToDeckResetedCard: action.putToDeckResetedCard
          ? action.putToDeckResetedCard
          : undefined,
        heal: action.heal ? action.heal : undefined,
        sacrificeCard: action.sacrificeCard ? action.sacrificeCard : undefined,
        resetCard: action.resetCard ? action.resetCard : undefined,
        resetOpponentsCard: action.resetOpponentsCard
          ? action.resetOpponentsCard
          : undefined,
        stanOpponentsHero: action.stanOpponentsHero
          ? action.stanOpponentsHero
          : undefined,
        takeCard: action.takeCard ? action.takeCard : undefined,
        conditions: action.conditions.map(
          (condition) => CONVERT_ACTION_CONDITION.FROM_DB[condition],
        ),
      })),
    };
  }
}
