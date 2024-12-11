import { Body, Controller, Get, Put } from '@nestjs/common';

import { HeroService } from '../services/hero/hero.service';

import type { HireHeroDto } from './dtos/hire-hero.dto';
import type { UseHeroActionsDto } from './dtos/use-hero-actions.dto';

@Controller({ path: 'hero', version: '1' })
export class HeroController {
  constructor(private readonly hero: HeroService) {}

  @Get('heroes')
  public getHeroes() {
    return this.hero.getHeroes();
  }

  @Put('hire')
  public hireHero(@Body() dto: HireHeroDto) {
    return this.hero.hireHero(dto);
  }

  @Put('use-actions')
  public useHeroActions(@Body() dto: UseHeroActionsDto) {
    return this.hero.useHeroActions(dto);
  }
}
