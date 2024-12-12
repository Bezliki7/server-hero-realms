import { forwardRef, Module } from '@nestjs/common';

import { SocketModule } from 'libs/socket/socket.module';
import { HeroController } from './controllers/hero.controller';
import { HeroService } from './services/hero/hero.service';
import { ActionsService } from './services/actions/action.service';
import { TakeCardActionService } from './services/actions/take-card/take-card.service';
import { DamageActionService } from './services/actions/damage/damage.service';
import { BattlefieldModule } from '../battlefield/battlefield.module';
import { HealActionService } from './services/actions/heal/heal.service';
import { ActionsWithUpdatePlacementService } from './services/actions/actions-with-update-placement/actions-with-update-placement.service';
import { GoldActionService } from './services/actions/gold/gold.service';
import { PutToDeckResetedCardActionService } from './services/actions/put-to-deck-reseted-card/put-to-deck-reseted-card.service';
import { ResetOpponentsCardActionService } from './services/actions/reset-opponents-card/reset-opponents-card.service';
import { HeroHelperService } from './services/hero/helper/hero-herlper.service';

@Module({
  imports: [SocketModule, forwardRef(() => BattlefieldModule)],
  controllers: [HeroController],
  providers: [
    HeroService,
    HeroHelperService,
    ActionsService,
    TakeCardActionService,
    DamageActionService,
    HealActionService,
    GoldActionService,
    ActionsWithUpdatePlacementService,
    PutToDeckResetedCardActionService,
    ResetOpponentsCardActionService,
  ],
  exports: [HeroService, HeroHelperService],
})
export class HeroModule {}
