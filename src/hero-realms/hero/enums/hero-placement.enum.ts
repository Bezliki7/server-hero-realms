import { HeroPlacement } from '@prisma/client';

export const HERO_PLACEMENT = {
  ACTIVE_DECK: 'active-deck',
  SELECTION_DECK: 'selection-deck',
  RESET_DECK: 'reset-deck',
  SACRIFICIAL_DECK: 'sacrificial-deck',
  TRADING_DECK: 'trading-deck',
  TRADING_ROW: 'trading-row',
} as const;

export const CONVERT_HERO_PLACEMENT = {
  TO_BD: {
    [HERO_PLACEMENT.ACTIVE_DECK]: HeroPlacement.ACTIVE_DECK,
    [HERO_PLACEMENT.SELECTION_DECK]: HeroPlacement.SELECTION_DECK,
    [HERO_PLACEMENT.RESET_DECK]: HeroPlacement.RESET_DECK,
    [HERO_PLACEMENT.SACRIFICIAL_DECK]: HeroPlacement.SACRIFICIAL_DECK,
    [HERO_PLACEMENT.TRADING_DECK]: HeroPlacement.TRADING_DECK,
    [HERO_PLACEMENT.TRADING_ROW]: HeroPlacement.TRADING_ROW,
  } as const,
  FROM_BD: {
    [HeroPlacement.ACTIVE_DECK]: HERO_PLACEMENT.ACTIVE_DECK,
    [HeroPlacement.SELECTION_DECK]: HERO_PLACEMENT.SELECTION_DECK,
    [HeroPlacement.RESET_DECK]: HERO_PLACEMENT.RESET_DECK,
    [HeroPlacement.SACRIFICIAL_DECK]: HERO_PLACEMENT.SACRIFICIAL_DECK,
    [HeroPlacement.TRADING_DECK]: HERO_PLACEMENT.TRADING_DECK,
    [HeroPlacement.TRADING_ROW]: HERO_PLACEMENT.TRADING_ROW,
  } as const,
};