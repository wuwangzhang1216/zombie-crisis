export enum GameState {
  MENU = 'MENU',
  BRIEFING = 'BRIEFING',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export enum WeaponType {
  PISTOL = 'Pistol',
  SHOTGUN = 'Shotgun',
  FLAMETHROWER = 'Flamethrower'
}

export enum EnemyType {
  NORMAL = 'NORMAL',
  RED = 'RED',
  MUMMY = 'MUMMY'
}

export enum ItemType {
  MEDKIT = 'MEDKIT',
  NUKE = 'NUKE',
  RAPID_FIRE = 'RAPID_FIRE'
}

export interface LevelConfig {
  id: number;
  name: string;
  description: string;
  enemyCount: number;
  spawnRate: number; // frames between spawns
  enemyTypes: EnemyType[];
  unlockedWeapon: WeaponType;
  background: string;
}

export interface Entity {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  speed: number;
  angle: number;
  hp: number;
  maxHp: number;
  type?: EnemyType;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  radius: number;
  duration: number; // for flamethrower
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface Item {
  id: string;
  x: number;
  y: number;
  type: ItemType;
  life: number; // Despawn timer
  angle: number; // For floating animation
}