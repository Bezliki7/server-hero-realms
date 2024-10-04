import { Injectable } from '@nestjs/common';
import { HeroPlacement, PrismaClient } from '@prisma/client';

import { BattlefieldService } from 'src/hero-realms/battlefield/services/battlefield.service';
import { CLIENT_MESSAGES } from 'src/hero-realms/battlefield/battlefield.constant';
import { HeroService } from 'src/hero-realms/hero/services/hero/hero.service';
import { DEFAULT_PLAYER_HP, MIN_PLAYER_HP } from './player.constant';
import { PlayerHelperService } from './helper/player-helper.service';

import type { CreatePlayerDto } from '../controllers/dtos/create-Player.dto';
import type { UpdatePlayerDto } from '../controllers/dtos/update-player.dto';
import type { AttackPlayerDto } from '../controllers/dtos/attack-player.dto';

@Injectable()
export class PlayerService {
  constructor(
    private readonly db: PrismaClient,
    private readonly battlefield: BattlefieldService,
    private readonly hero: HeroService,
    private readonly playerHelper: PlayerHelperService,
  ) {}

  public async createPlayer(dto: CreatePlayerDto) {
    const player = await this.db.player.create({
      data: {
        name: dto.name,
        battlefieldId: dto.battlefieldId,
        image: '',
        health: DEFAULT_PLAYER_HP,
        turnOrder: 1,
        currentTurnPlayer: false,
      },
      include: { heroes: { include: { actions: true } } },
    });

    const heroes = player.heroes.map((hero) => this.hero.normalizeHero(hero));

    return { ...player, heroes };
  }

  public async updatePlayer(dto: UpdatePlayerDto) {
    const updatedPlayer = await this.db.player.update({
      where: { id: dto.id },
      data: {
        name: dto.name,
        battlefieldId: dto.battlefieldId,
        image: dto.image,
        health: dto.health,
        turnOrder: dto.turnOrder,
        currentTurnPlayer: dto.currentTurnPlayer,
      },
    });

    return updatedPlayer;
  }

  public async getPlayer(id: number) {
    const player = await this.db.player.findUnique({
      where: {
        id,
      },
      include: {
        heroes: { include: { actions: true } },
      },
    });

    const heroes = player.heroes.map((hero) => this.hero.normalizeHero(hero));

    return { ...player, heroes };
  }

  public async getPlayers() {
    const players = await this.db.player.findMany({
      include: { heroes: true },
    });

    return players;
  }

  public async endPlayerMove(id: number) {
    const player = await this.db.player.findUnique({
      where: { id },
      include: {
        battlefield: { include: { players: true } },
        heroes: true,
      },
    });

    const [opponentPlayer] = player.battlefield.players.filter(
      (player) => player.id !== id,
    );

    if (opponentPlayer) {
      await this.db.player.update({
        where: { id: opponentPlayer.id },
        data: {
          currentTurnPlayer: true,
        },
      });
    }

    await this.playerHelper.updateActiveDeck(player);

    const updatedPlayer = await this.db.player.update({
      where: { id },
      data: {
        currentTurnPlayer: false,
        currentGoldCount: 0,
        currentDamageCount: 0,
        guaranteedHeroes: player.guaranteedHeroes,
      },
    });

    await this.battlefield.getBattlefieldAndNotifyAllSubs(
      CLIENT_MESSAGES.BATTLEFIELD_UPDATED,
      updatedPlayer.battlefieldId,
    );

    return updatedPlayer;
  }

  public async attackPlayer(dto: AttackPlayerDto) {
    const attacker = await this.db.player.findUnique({
      where: { id: dto.attackingPlayerId },
    });

    const defendingPlayer = await this.db.player.findUnique({
      where: { id: dto.defendingPlayerId },
      include: { heroes: true },
    });

    if (!attacker || !defendingPlayer) {
      return 'игрок не найден';
    }

    const isDefendingPlayerHaveGuardian = defendingPlayer.heroes.some(
      (hero) =>
        hero.isGuardian && hero.placement === HeroPlacement.DEFENDERS_ROW,
    );

    if (dto.heroIdToAttack) {
      const heroToAttack = defendingPlayer.heroes.find(
        (hero) => hero.id === dto.heroIdToAttack,
      );
      const isEnoughDamage =
        heroToAttack.protection <= attacker.currentDamageCount;

      if (!isEnoughDamage) {
        return 'недостаточно урона';
      }

      if (
        heroToAttack &&
        heroToAttack.placement === HeroPlacement.DEFENDERS_ROW
      ) {
        if (heroToAttack.isGuardian || !isDefendingPlayerHaveGuardian) {
          await this.db.hero.update({
            where: { id: dto.heroIdToAttack },
            data: {
              placement: HeroPlacement.RESET_DECK,
              actions: {
                updateMany: {
                  where: { heroId: dto.heroIdToAttack },
                  data: { isUsed: false },
                },
              },
            },
          });

          await this.db.player.update({
            data: {
              currentDamageCount:
                attacker.currentDamageCount - heroToAttack.protection,
            },
            where: { id: dto.attackingPlayerId },
          });
        } else {
          return 'необходимо атаковать стража';
        }
      }
    } else {
      if (isDefendingPlayerHaveGuardian) {
        return 'необходимо атаковать стража';
      }

      const newDefengingPlayeHp =
        defendingPlayer.health - attacker.currentDamageCount;
      await this.db.player.update({
        data: { health: Math.max(newDefengingPlayeHp, MIN_PLAYER_HP) },
        where: { id: dto.defendingPlayerId },
      });

      await this.db.player.update({
        data: { currentDamageCount: 0 },
        where: { id: dto.attackingPlayerId },
      });
    }

    await this.battlefield.getBattlefieldAndNotifyAllSubs(
      CLIENT_MESSAGES.BATTLEFIELD_UPDATED,
      attacker.battlefieldId,
    );
  }
}
