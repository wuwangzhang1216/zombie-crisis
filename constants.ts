
import { LevelConfig, EnemyType, WeaponType, ItemType, GameSettings, Difficulty, Achievement } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const TIME_ATTACK_LIMIT = 180; // 3 minutes

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
    reloadTime: 60, 
    maxReserve: 999 
  },
  [WeaponType.SHOTGUN]: { 
    damage: 15, 
    cooldown: 50, 
    speed: 10, 
    spread: 0.3, 
    count: 5, 
    color: '#f87171',
    clipSize: 6,
    reloadTime: 120, 
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
    reloadTime: 180, 
    maxReserve: 400
  }
};

export const ENEMY_STATS = {
  [EnemyType.NORMAL]: { hp: 50, speed: 1.5, color: '#4ade80', score: 100, radius: 15 },
  [EnemyType.RED]: { hp: 30, speed: 4.0, color: '#ef4444', score: 200, radius: 12 },
  [EnemyType.MUMMY]: { hp: 200, speed: 0.8, color: '#fde047', score: 500, radius: 20 },
  [EnemyType.BOSS]: { hp: 3000, speed: 1.2, color: '#7f1d1d', score: 5000, radius: 45 }
};

export const BOSS_STATS = ENEMY_STATS[EnemyType.BOSS];

export const ITEM_STATS = {
  [ItemType.MEDKIT]: { color: '#22c55e', radius: 12, heal: 30, score: 0, chance: 0.03, symbol: '+' },
  [ItemType.NUKE]: { color: '#f59e0b', radius: 12, heal: 0, score: 1000, chance: 0.01, symbol: '☢' },
  [ItemType.RAPID_FIRE]: { color: '#3b82f6', radius: 12, heal: 0, score: 0, chance: 0.03, duration: 300, symbol: '⚡' },
  [ItemType.AMMO]: { color: '#a8a29e', radius: 12, heal: 0, score: 0, chance: 0.08, symbol: '▮' },
  [ItemType.DOUBLE_POINTS]: { color: '#eab308', radius: 12, heal: 0, score: 0, chance: 0.02, duration: 600, symbol: '2x' },
  [ItemType.SHIELD]: { color: '#8b5cf6', radius: 12, heal: 0, score: 0, chance: 0.02, duration: 300, symbol: '🛡️' },
  [ItemType.FREEZE]: { color: '#06b6d4', radius: 12, heal: 0, score: 0, chance: 0.02, duration: 300, symbol: '❄️' }
};

export const PLAYER_SPEED = 3.5;
export const PLAYER_RADIUS = 12;
export const PLAYER_MAX_HP = 100;

export const UPGRADE_CONFIG = {
  health: { baseCost: 500, costMult: 1.5, maxLevel: 5, valuePerLevel: 20, name: "Nanite Armor" }, 
  speed: { baseCost: 500, costMult: 1.5, maxLevel: 5, valuePerLevel: 0.2, name: "Hydraulic Legs" }, 
  damage: { baseCost: 1000, costMult: 1.5, maxLevel: 5, valuePerLevel: 0.1, name: "High-Caliber Rounds" }, 
};

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

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'FIRST_BLOOD', name: 'First Blood', description: 'Eliminate your first zombie.', icon: 'Skull' },
  { id: 'PISTOL_PRO', name: 'Pistol Pro', description: 'Complete a level using ONLY the pistol.', icon: 'Crosshair' },
  { id: 'SURVIVOR', name: 'Untouchable', description: 'Complete a level without taking any damage.', icon: 'Shield' },
  { id: 'SLAUGHTER', name: 'Massacre', description: 'Accumulate 500 total kills.', icon: 'Zap' },
  { id: 'IRON_WILL', name: 'Iron Will', description: 'Reach Wave 10 in Endless Mode.', icon: 'Crown' }
];
