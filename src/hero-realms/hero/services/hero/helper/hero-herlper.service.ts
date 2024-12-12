import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs-extra';
import crypto from 'crypto';

import { DATASET_PATH_FILE, FILE_ENCODING, HASH } from '../hero.constant';
import { HeroService } from '../hero.service';
import { SocketService } from 'libs/socket/services/socket.service';
import { CLIENT_MESSAGES } from 'src/hero-realms/battlefield/battlefield.constant';
import { CONVERT_HERO_PLACEMENT } from 'src/hero-realms/hero/enums/hero-placement.enum';
import { CONVERT_ACTION_CONDITION } from 'src/hero-realms/hero/enums/action-condition.enum';

import type { Dataset, HeroRaw } from '../hero.interface';

@Injectable()
export class HeroHelperService implements OnModuleInit {
  constructor(
    private readonly db: PrismaClient,
    @Inject(forwardRef(() => HeroService))
    private readonly heroService: HeroService,
    private readonly socket: SocketService,
  ) {}

  public async onModuleInit() {
    const data = await fs.readFile(DATASET_PATH_FILE, FILE_ENCODING);

    const isDifferent = await this.compareHashesForDataset(data);

    if (isDifferent) {
      await this.applyDataset(data);
    }
  }

  public onUpdateHero(hero: HeroRaw) {
    this.socket.notifyAllSubsribers(
      CLIENT_MESSAGES.HERO_UPDATED,
      this.normalizeHero(hero),
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

  private async compareHashesForDataset(data: string) {
    let isDifferent = false;
    const dataHash = crypto.hash(HASH.ALGORITHM, data, HASH.ENCODING);

    const isHashExist = await fs.exists(HASH.PATH);

    if (!isHashExist) {
      isDifferent = true;

      await fs.writeFile(HASH.PATH, dataHash);
    } else {
      const oldDataHash = (await fs.readFile(HASH.PATH)).toString();

      if (oldDataHash !== dataHash) {
        isDifferent = true;

        await fs.writeFile(HASH.PATH, dataHash);
      }
    }

    return isDifferent;
  }

  private async applyDataset(data: string) {
    try {
      const { heroes } = JSON.parse(data) as Dataset;

      for (const hero of heroes) {
        const isExist = await this.db.hero.findFirst({
          where: { name: hero.name },
        });

        if (!isExist) {
          await this.heroService.createHero(hero);
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
}
