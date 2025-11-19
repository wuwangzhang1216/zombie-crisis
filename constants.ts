import { LevelConfig, EnemyType, WeaponType } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "Sector 7: Outskirts",
    description: "Initial containment breach. Multiple slow-moving hostiles detected.",
    enemyCount: 15,
    spawnRate: 120,
    enemyTypes: [EnemyType.NORMAL],
    unlockedWeapon: WeaponType.PISTOL,
    background: "#1a1a1a"
  },
  {
    id: 2,
    name: "Sector 4: Laboratory",
    description: "The virus has mutated. Fast-moving targets approaching.",
    enemyCount: 25,
    spawnRate: 90,
    enemyTypes: [EnemyType.NORMAL, EnemyType.RED],
    unlockedWeapon: WeaponType.SHOTGUN,
    background: "#1f1a1a"
  },
  {
    id: 3,
    name: "Sector 1: The Tomb",
    description: "Ancient pathogens released. Heavily armored units inbound.",
    enemyCount: 40,
    spawnRate: 60,
    enemyTypes: [EnemyType.NORMAL, EnemyType.RED, EnemyType.MUMMY],
    unlockedWeapon: WeaponType.FLAMETHROWER,
    background: "#262215"
  }
];

export const WEAPON_STATS = {
  [WeaponType.PISTOL]: { damage: 25, cooldown: 20, speed: 12, spread: 0, color: '#fbbf24' },
  [WeaponType.SHOTGUN]: { damage: 15, cooldown: 50, speed: 10, spread: 0.3, count: 5, color: '#f87171' },
  [WeaponType.FLAMETHROWER]: { damage: 2, cooldown: 3, speed: 7, spread: 0.1, duration: 20, color: '#f97316' }
};

export const ENEMY_STATS = {
  [EnemyType.NORMAL]: { hp: 50, speed: 1.5, color: '#4ade80', score: 100, radius: 15 },
  [EnemyType.RED]: { hp: 30, speed: 4.0, color: '#ef4444', score: 200, radius: 12 },
  [EnemyType.MUMMY]: { hp: 200, speed: 0.8, color: '#fde047', score: 500, radius: 20 }
};

export const PLAYER_SPEED = 3.5;
export const PLAYER_RADIUS = 12;
export const PLAYER_MAX_HP = 100;