import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import omit from 'lodash.omit';

import { HeroService } from 'src/hero-realms/hero/services/hero/hero.service';
import { getRandomNumber, getRandomNumbers } from '../../utils/math';
import { HERO_PLACEMENT } from 'src/hero-realms/hero/enums/hero-placement.enum';
import {
  CLIENT_MESSAGES,
  INITIAL_CARDS_COUNT,
  MIN_BATTLEFIELD_PLAYERS_COUNT,
  TRADING_ROW_CARDS_COUNT,
} from '../battlefield.constant';
import { SocketService } from 'libs/socket/services/socket.service';
import { HeroHelperService } from 'src/hero-realms/hero/services/hero/helper/hero-herlper.service';

import type { CreateBattlefieldDto } from '../controllers/dtos/create-battlefield.dto';
import type { UpdateBattlefieldDto } from '../controllers/dtos/update-battlefield.dto';
import type { RawBattlefield } from './battlefield.interface';

@Injectable()
export class BattlefieldService {
  constructor(
    private readonly db: PrismaClient,
    @Inject(forwardRef(() => HeroService))
    private readonly hero: HeroService,
    private readonly heroHelper: HeroHelperService,
    private readonly socket: SocketService,
  ) {}

  public async createBattleField(dto: CreateBattlefieldDto) {
    const battlefield = await this.db.battlefield.create({
      data: {
        name: dto.name,
      },
    });

    return battlefield;
  }

  public async getBattleFiled(id: number) {
    const battlefield = await this.db.battlefield.findUnique({
      where: {
        id,
      },
      include: {
        heroes: { include: { actions: true } },
        players: { include: { heroes: { include: { actions: true } } } },
      },
    });

    return this.normalizedBattlefield(battlefield);
  }

  public async getBattleFileds() {
    const battlefields = await this.db.battlefield.findMany({
      include: { heroes: true, players: true },
    });

    return battlefields;
  }

  public async updateBattleFiled(dto: UpdateBattlefieldDto) {
    const players = await this.db.player.findMany({
      where: {
        id: {
          in: dto.playersIds,
        },
      },
    });

    const heroes = await this.db.hero.findMany({
      where: {
        id: {
          in: dto.heroIds,
        },
      },
    });

    for (const player of players) {
      await this.db.battlefield.update({
        where: { id: dto.id },
        data: {
          players: {
            connect: {
              id: player.id,
            },
          },
        },
      });
    }

    const updatedPlayer = await this.db.battlefield.update({
      where: { id: dto.id },
      data: {
        name: dto.name,
        round: dto.round,
      },
      include: { players: true },
    });

    return updatedPlayer;
  }

  public async clearBattlefield(id: number) {
    await this.db.hero.deleteMany({ where: { battlefieldId: id } });

    await this.db.player.updateMany({
      where: { battlefieldId: id },
      data: {
        health: 50,
        guaranteedHeroes: [],
        currentDamageCount: 0,
        currentGoldCount: 0,
        currentTurnPlayer: false,
      },
    });

    await this.prepareBattlefield(id);
  }

  public async prepareBattlefield(id: number) {
    let battlefield = await this.getBattleFiled(id);
    console.log(battlefield);
    if (battlefield.players.length < MIN_BATTLEFIELD_PLAYERS_COUNT) {
      return;
    }

    const heroes = await this.hero.getHeroes();
    console.log(heroes);
    if (!battlefield.heroes.length) {
      const heroesForTrade = heroes.filter(
        (hero) => hero.price && hero.fraction,
      );

      const indexCardsForTraidingRow = getRandomNumbers(
        0,
        heroesForTrade.length - 1,
        TRADING_ROW_CARDS_COUNT,
      );

      for (const [index, hero] of heroesForTrade.entries()) {
        const omittedHero = omit(hero, 'id');
        await this.hero.createHero({
          ...omittedHero,
          battlefieldId: id,
          placement: indexCardsForTraidingRow.includes(index)
            ? HERO_PLACEMENT.TRADING_ROW
            : HERO_PLACEMENT.TRADING_DECK,
        });
      }

      const supportHeroes = heroes.filter(
        (hero) => hero.price && !hero.fraction,
      );
      for (const hero of supportHeroes.values()) {
        const omittedHero = omit(hero, 'id');
        await this.hero.createHero({
          ...omittedHero,
          battlefieldId: id,
          placement: HERO_PLACEMENT.SUPPORTS_ROW,
        });
      }
    }

    const filteredPlayers = battlefield.players.filter(
      (player) => !player.heroes.length,
    );

    if (filteredPlayers.length) {
      const randomPlayerIndex = getRandomNumber(0, 1);
      const playerToChangeTurnOrder = battlefield.players[randomPlayerIndex];

      await this.db.player.update({
        data: { currentTurnPlayer: true },
        where: { id: playerToChangeTurnOrder.id },
      });

      const baseHeroes = heroes.filter((hero) => !hero.price);

      const cardForDuplicate = baseHeroes.find((hero) => hero.name === 'Ято');
      const duplicates = new Array(4).fill(cardForDuplicate);
      baseHeroes.push(...duplicates);

      for (const player of filteredPlayers) {
        const initialCountCards =
          playerToChangeTurnOrder.id === player.id
            ? INITIAL_CARDS_COUNT.FIRST_PLAYER
            : INITIAL_CARDS_COUNT.SECOND_PLAYER;

        const indexCardsForActiveDeck = getRandomNumbers(
          0,
          baseHeroes.length - 1,
          initialCountCards,
        );

        for (const [index, hero] of baseHeroes.entries()) {
          const omittedHero = omit(hero, 'id');
          const isActiveHero = indexCardsForActiveDeck.includes(index);

          await this.hero.createHero({
            ...omittedHero,
            battlefieldId: id,
            playerId: player.id,
            placement: isActiveHero
              ? HERO_PLACEMENT.ACTIVE_DECK
              : HERO_PLACEMENT.SELECTION_DECK,
          });
        }
      }
    }

    if (!battlefield.heroes.length) {
      battlefield = await this.getBattleFiled(id);
    }

    this.socket.notifyAllSubsribers(
      CLIENT_MESSAGES.BATTLEFIELD_UPDATED,
      battlefield,
    );
  }

  private normalizedBattlefield(battlefield: RawBattlefield) {
    const normalizedBattlefield = {
      ...battlefield,
      heroes:
        battlefield.heroes?.map((hero) =>
          this.heroHelper.normalizeHero(hero),
        ) ?? [],
      players: battlefield.players?.map((player) => ({
        ...player,
        heroes: player.heroes.map((hero) =>
          this.heroHelper.normalizeHero(hero),
        ),
      })),
    };

    return normalizedBattlefield;
  }
}
