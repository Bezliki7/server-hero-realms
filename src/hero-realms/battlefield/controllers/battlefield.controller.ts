import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';

import { BattlefieldService } from '../services/battlefield.service';

import type { CreateBattlefieldDto } from './dtos/create-battlefield.dto';
import type { UpdateBattlefieldDto } from './dtos/update-battlefield.dto';

@Controller({ path: 'battlefield', version: '1' })
export class BattlefieldController {
  constructor(private readonly battlefield: BattlefieldService) {}

  @Post()
  public createBattlefield(@Body() dto: CreateBattlefieldDto) {
    return this.battlefield.createBattleField(dto);
  }

  @Get('/all-battlefields')
  public getBattlefields() {
    return this.battlefield.getBattleFileds();
  }

  @Get(':id')
  public getBattlefield(@Param('id', ParseIntPipe) id: number) {
    return this.battlefield.getBattleFiled(id);
  }

  @Put('clear/:id')
  public clearBattleFiled(@Param('id', ParseIntPipe) id: number) {
    return this.battlefield.clearBattlefield(id);
  }

  @Put(':id')
  public updateBattleFiled(
    @Body() dto: Omit<UpdateBattlefieldDto, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.battlefield.updateBattleFiled({ ...dto, id });
  }
}
