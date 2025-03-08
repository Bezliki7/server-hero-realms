import { Injectable } from '@nestjs/common';
import { HeroPlacement, Player, PrismaClient } from '@prisma/client';

import { CLIENT_MESSAGES } from 'src/hero-realms/battlefield/battlefield.constant';
import { DEFAULT_PLAYER_HP, MIN_PLAYER_HP } from './player.constant';
import { PlayerHelperService } from './helper/player-helper.service';
import { HeroHelperService } from 'src/hero-realms/hero/services/hero/helper/hero-herlper.service';
import { SocketService } from 'libs/socket/services/socket.service';

import type { CreatePlayerDto } from '../controllers/dtos/create-Player.dto';
import type { UpdatePlayerDto } from '../controllers/dtos/update-player.dto';
import type { AttackPlayerDto } from '../controllers/dtos/attack-player.dto';

@Injectable()
export class PlayerService {
  constructor(
    private readonly db: PrismaClient,
    private readonly heroHelper: HeroHelperService,
    private readonly playerHelper: PlayerHelperService,
    private readonly socket: SocketService,
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

    const heroes = player.heroes.map((hero) =>
      this.heroHelper.normalizeHero(hero),
    );

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

    const heroes = player.heroes.map((hero) =>
      this.heroHelper.normalizeHero(hero),
    );

    return { ...player, heroes };
  }

  public async getPlayers() {
    const players = await this.db.player.findMany({
      include: { heroes: true },
    });

    return players;
  }

  public async endPlayerMove(id: number) {
    try {
      const players: Player[] = [];
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
        const updatedOpponent = await this.db.player.update({
          where: { id: opponentPlayer.id },
          data: {
            currentTurnPlayer: true,
          },
        });

        players.push(updatedOpponent);
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
      players.push(updatedPlayer);

      this.socket.notifyAllSubsribers(CLIENT_MESSAGES.PLAYERS_UPDATED, players);

      return updatedPlayer;
    } catch (error) {
      console.log(error);
    }
  }

  public async attackPlayer(dto: AttackPlayerDto) {
    const attacker = await this.db.player.findUnique({
      where: { id: dto.attackingPlayerId },
    });

    const defendingPlayer = await this.db.player.findUnique({
      where: { id: dto.defendingPlayerId },
      include: { heroes: { where: { battlefieldId: attacker.battlefieldId } } },
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
          const updatedHero = await this.db.hero.update({
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
            include: { actions: true },
          });

          this.heroHelper.onUpdateHero(updatedHero);

          const updatedPlayer = await this.db.player.update({
            data: {
              currentDamageCount:
                attacker.currentDamageCount - heroToAttack.protection,
            },
            where: { id: dto.attackingPlayerId },
            include: { battlefield: { include: { players: true } } },
          });

          this.socket.notifyAllSubsribers(
            CLIENT_MESSAGES.PLAYERS_UPDATED,
            updatedPlayer.battlefield.players,
          );
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

      const updatedDefendingPlayer = await this.db.player.update({
        data: { health: Math.max(newDefengingPlayeHp, MIN_PLAYER_HP) },
        where: { id: dto.defendingPlayerId },
      });

      const updatedAttackingPlayer = await this.db.player.update({
        data: { currentDamageCount: 0 },
        where: { id: dto.attackingPlayerId },
      });

      this.socket.notifyAllSubsribers(CLIENT_MESSAGES.PLAYERS_UPDATED, [
        updatedDefendingPlayer,
        updatedAttackingPlayer,
      ]);
    }
  }
}
