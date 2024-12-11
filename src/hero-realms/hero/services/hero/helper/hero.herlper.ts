import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs-extra';
import crypto from 'crypto';

import { DATASET_PATH_FILE, FILE_ENCODING, HASH } from '../hero.constant';
import { HeroService } from '../hero.service';

import type { Dataset } from '../hero.interface';

@Injectable()
export class HeroHelper implements OnModuleInit {
  constructor(
    private readonly db: PrismaClient,
    private readonly heroService: HeroService,
  ) {}

  public async onModuleInit() {
    const data = await fs.readFile(DATASET_PATH_FILE, FILE_ENCODING);

    const isDifferent = await this.compareHashesForDataset(data);

    if (isDifferent) {
      await this.applyDataset(data);
    }
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
