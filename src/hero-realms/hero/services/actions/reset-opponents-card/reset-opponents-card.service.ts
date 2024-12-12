import { Injectable } from '@nestjs/common';
import { HeroPlacement, PrismaClient } from '@prisma/client';

import { CLIENT_MESSAGES } from 'src/hero-realms/battlefield/battlefield.constant';
import { SocketService } from 'libs/socket/services/socket.service';
import { HeroHelperService } from '../../hero/helper/hero-herlper.service';

import { IAction, type UseActionDto } from '../action.interface';

@Injectable()
export class ResetOpponentsCardActionService extends IAction {
  constructor(
    private readonly db: PrismaClient,
    private readonly socket: SocketService,
    private readonly heroHelper: HeroHelperService,
  ) {
    super();
  }

  public async useAction(dto: UseActionDto) {
    const connection = this.socket.getConnection(dto.opponentPlayer.id);
    connection.emit(CLIENT_MESSAGES.NEED_TO_RESET_CARD);

    connection.on(CLIENT_MESSAGES.RESET_CARD, async (id: number) => {
      const updatedHero = await this.db.hero.update({
        where: { id },
        data: { placement: HeroPlacement.RESET_DECK },
        include: { actions: true },
      });

      this.heroHelper.onUpdateHero(updatedHero);
    });
  }
}
