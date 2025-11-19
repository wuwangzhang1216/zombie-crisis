
import { LevelConfig, EnemyType, WeaponType, ItemType, GameSettings, Difficulty } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "Sector 7: Outskirts",
    description: "Initial containment breach. Multiple slow-moving hostiles detected.",
    baseEnemyCount: 12,
    spawnRate: 120,
    enemyTypes: [EnemyType.NORMAL],
    unlockedWeapon: WeaponType.PISTOL,
    background: "#1a1a1a"
  },
  {
    id: 2,
    name: "Sector 4: Laboratory",
    description: "The virus has mutated. Fast-moving targets approaching.",
    baseEnemyCount: 18,
    spawnRate: 90,
    enemyTypes: [EnemyType.NORMAL, EnemyType.RED],
    unlockedWeapon: WeaponType.SHOTGUN,
    background: "#1f1a1a"
  },
  {
    id: 3,
    name: "Sector 1: The Tomb",
    description: "Ancient pathogens released. Heavily armored units inbound.",
    baseEnemyCount: 25,
    spawnRate: 60,
    enemyTypes: [EnemyType.NORMAL, EnemyType.RED, EnemyType.MUMMY],
    unlockedWeapon: WeaponType.FLAMETHROWER,
    background: "#262215"
  }
];

export const WEAPON_STATS = {
  [WeaponType.PISTOL]: { 
    damage: 25, 
    cooldown: 20, 
    speed: 12, 
    spread: 0, 
    color: '#fbbf24',
    clipSize: 12,
    reloadTime: 60, // 1 second
    maxReserve: 999 // Infinite
  },
  [WeaponType.SHOTGUN]: { 
    damage: 15, 
    cooldown: 50, 
    speed: 10, 
    spread: 0.3, 
    count: 5, 
    color: '#f87171',
    clipSize: 6,
    reloadTime: 120, // 2 seconds
    maxReserve: 32
  },
  [WeaponType.FLAMETHROWER]: { 
    damage: 3, 
    cooldown: 4, 
    speed: 7, 
    spread: 0.1, 
    duration: 20, 
    color: '#f97316',
    clipSize: 100,
    reloadTime: 180, // 3 seconds
    maxReserve: 400
  }
};

export const ENEMY_STATS = {
  [EnemyType.NORMAL]: { hp: 50, speed: 1.5, color: '#4ade80', score: 100, radius: 15 },
  [EnemyType.RED]: { hp: 30, speed: 4.0, color: '#ef4444', score: 200, radius: 12 },
  [EnemyType.MUMMY]: { hp: 200, speed: 0.8, color: '#fde047', score: 500, radius: 20 }
};

export const ITEM_STATS = {
  [ItemType.MEDKIT]: { color: '#22c55e', radius: 12, heal: 30, score: 0, chance: 0.05, symbol: '+' },
  [ItemType.NUKE]: { color: '#f59e0b', radius: 12, heal: 0, score: 1000, chance: 0.01, symbol: '☢' },
  [ItemType.RAPID_FIRE]: { color: '#3b82f6', radius: 12, heal: 0, score: 0, chance: 0.04, duration: 300, symbol: '⚡' },
  [ItemType.AMMO]: { color: '#a8a29e', radius: 12, heal: 0, score: 0, chance: 0.1, symbol: '▮' }
};

export const PLAYER_SPEED = 3.5;
export const PLAYER_RADIUS = 12;
export const PLAYER_MAX_HP = 100;

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.5,
  musicVolume: 0.4,
  sfxVolume: 0.7,
  difficulty: Difficulty.NORMAL,
  particles: 'MEDIUM',
  keys: {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    reload: ['KeyR']
  }
};

export const DIFFICULTY_MODIFIERS = {
  [Difficulty.EASY]: { hp: 0.7, speed: 0.8, damage: 0.5, score: 0.8 },
  [Difficulty.NORMAL]: { hp: 1.0, speed: 1.0, damage: 1.0, score: 1.0 },
  [Difficulty.HARD]: { hp: 1.4, speed: 1.2, damage: 1.5, score: 1.5 }
};
