export const MIN_BATTLEFIELD_PLAYERS_COUNT = 2;
export const TRADING_ROW_CARDS_COUNT = 6;
export const INITIAL_CARDS_COUNT = {
  FIRST_PLAYER: 3,
  SECOND_PLAYER: 5,
};

export const BASE_HEROES = ['Ято', 'Ехидна', 'Зангецу', 'Мусаши'];

export const CLIENT_MESSAGES = {
  PREPARE_BATTLEFIELD: 'client:prepare-battlefiled',
  BATTLEFIELD_UPDATED: 'client:battlefiled-updated',
  NEED_TO_RESET_CARD: 'client:need-to-reset-card',
  RESET_CARD: 'client:reset-card',

  PLAYERS_UPDATED: 'client:players-updated',
  HERO_UPDATED: 'client:hero-updated',
};

export const TRANSPORTS = ['websocket'];
export const NAMESPACE = 'battlefiled';
