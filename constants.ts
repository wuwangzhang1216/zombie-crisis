
import { LevelConfig, EnemyType, WeaponType, ItemType, GameSettings, Difficulty, Achievement, Obstacle } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const TIME_ATTACK_LIMIT = 180; // 3 minutes

// --- MAP GENERATION ---

const createRoom = (type: 'OPEN' | 'BOX' | 'CROSS' | 'PILLARS' | 'LAB' | 'STREET' | 'BUNKER' | 'FOREST' | 'ARENA'): Obstacle[] => {
  const obs: Obstacle[] = [];
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;

  // Boundary Walls (Always present implicitly, but adding visual chunks for some)
  if (type === 'BOX') {
    obs.push({ id: 'b1', x: 100, y: 100, width: 20, height: 400, type: 'WALL' });
    obs.push({ id: 'b2', x: 680, y: 100, width: 20, height: 400, type: 'WALL' });
    obs.push({ id: 'b3', x: 100, y: 100, width: 600, height: 20, type: 'WALL' });
    obs.push({ id: 'b4', x: 100, y: 480, width: 600, height: 20, type: 'WALL' });
  } 
  else if (type === 'CROSS') {
    obs.push({ id: 'c1', x: cx - 100, y: cy - 100, width: 200, height: 200, type: 'WALL' });
  }
  else if (type === 'PILLARS') {
    for(let x=150; x<700; x+=150) {
      for(let y=150; y<500; y+=150) {
         obs.push({ id: `p_${x}_${y}`, x, y, width: 40, height: 40, type: 'WALL' });
      }
    }
  }
  else if (type === 'LAB') {
    obs.push({ id: 'l1', x: 200, y: 200, width: 50, height: 50, type: 'CRATE', hp: 100 });
    obs.push({ id: 'l2', x: 550, y: 200, width: 50, height: 50, type: 'CRATE', hp: 100 });
    obs.push({ id: 'l3', x: 200, y: 350, width: 50, height: 50, type: 'CRATE', hp: 100 });
    obs.push({ id: 'l4', x: 550, y: 350, width: 50, height: 50, type: 'CRATE', hp: 100 });
    obs.push({ id: 'l5', x: cx - 10, y: 0, width: 20, height: 150, type: 'WALL' });
    obs.push({ id: 'l6', x: cx - 10, y: 450, width: 20, height: 150, type: 'WALL' });
  }
  else if (type === 'STREET') {
     obs.push({ id: 's1', x: 100, y: 120, width: 200, height: 30, type: 'WALL' });
     obs.push({ id: 's2', x: 500, y: 120, width: 200, height: 30, type: 'WALL' });
     obs.push({ id: 's3', x: 100, y: 450, width: 200, height: 30, type: 'WALL' });
     obs.push({ id: 's4', x: 500, y: 450, width: 200, height: 30, type: 'WALL' });
     obs.push({ id: 'c1', x: cx - 25, y: cy - 25, width: 50, height: 50, type: 'CRATE', hp: 200 });
  }
  else if (type === 'BUNKER') {
     obs.push({ id: 'bk1', x: 50, y: cy - 10, width: 200, height: 20, type: 'WALL' });
     obs.push({ id: 'bk2', x: CANVAS_WIDTH - 250, y: cy - 10, width: 200, height: 20, type: 'WALL' });
     obs.push({ id: 'bk3', x: cx - 100, y: 100, width: 200, height: 20, type: 'WALL' });
     obs.push({ id: 'bk4', x: cx - 100, y: 480, width: 200, height: 20, type: 'WALL' });
  }
  else if (type === 'FOREST') {
     for(let i=0; i<15; i++) {
        obs.push({ 
          id: `t_${i}`, 
          x: Math.random() * (CANVAS_WIDTH - 100) + 50, 
          y: Math.random() * (CANVAS_HEIGHT - 100) + 50, 
          width: 30, height: 30, type: 'CRATE', hp: 50 
        });
     }
  }
  
  return obs;
};

// Generate 18 Levels
export const LEVELS: LevelConfig[] = [];
const MAP_TYPES = ['OPEN', 'BOX', 'PILLARS', 'LAB', 'CROSS', 'STREET', 'BUNKER', 'FOREST', 'ARENA'] as const;

for (let i = 1; i <= 18; i++) {
  const mapType = MAP_TYPES[(i - 1) % MAP_TYPES.length];
  const difficultyMult = Math.ceil(i / 3);
  
  let enemies = [EnemyType.NORMAL];
  if (i > 2) enemies.push(EnemyType.RED);
  if (i > 5) enemies.push(EnemyType.EXPLODER);
  if (i > 8) enemies.push(EnemyType.SPITTER);
  if (i > 12) enemies.push(EnemyType.MUMMY);

  LEVELS.push({
    id: i,
    name: `Sector ${i}: ${mapType}`,
    description: `Containment breach in ${mapType} zone.`,
    baseEnemyCount: 10 + (i * 5),
    spawnRate: Math.max(20, 120 - (i * 5)),
    enemyTypes: enemies,
    background: i % 2 === 0 ? '#1a1a1a' : '#111827',
    obstacles: createRoom(mapType),
    isBossLevel: i % 6 === 0
  });
}

// --- COMBO UNLOCKS ---
export const COMBO_UNLOCK_THRESHOLDS: { [key: number]: WeaponType } = {
  0: WeaponType.PISTOL,
  5: WeaponType.UZI,
  15: WeaponType.SHOTGUN,
  25: WeaponType.BARREL, // Tactical
  40: WeaponType.ASSAULT_RIFLE,
  60: WeaponType.WALL, // Tactical
  80: WeaponType.SNIPER,
  100: WeaponType.FLAMETHROWER,
  150: WeaponType.RAILGUN
};

export const WEAPON_STATS = {
  [WeaponType.PISTOL]: { 
    damage: 25, cooldown: 20, speed: 12, spread: 0.05, color: '#fbbf24', clipSize: 12, reloadTime: 60, maxReserve: 999, pierce: 0 
  },
  [WeaponType.UZI]: { 
    damage: 12, cooldown: 5, speed: 14, spread: 0.25, color: '#fde047', clipSize: 32, reloadTime: 80, maxReserve: 320, pierce: 0 
  },
  [WeaponType.SHOTGUN]: { 
    damage: 15, cooldown: 50, speed: 10, spread: 0.35, count: 6, color: '#f87171', clipSize: 6, reloadTime: 120, maxReserve: 48, pierce: 0 
  },
  [WeaponType.ASSAULT_RIFLE]: { 
    damage: 22, cooldown: 8, speed: 16, spread: 0.08, color: '#60a5fa', clipSize: 40, reloadTime: 90, maxReserve: 240, pierce: 0 
  },
  [WeaponType.SNIPER]: { 
    damage: 200, cooldown: 70, speed: 30, spread: 0, color: '#a855f7', clipSize: 5, reloadTime: 150, maxReserve: 25, pierce: 5 
  },
  [WeaponType.FLAMETHROWER]: { 
    damage: 4, cooldown: 3, speed: 8, spread: 0.15, duration: 25, color: '#f97316', clipSize: 100, reloadTime: 180, maxReserve: 500, pierce: 1 
  },
  [WeaponType.RAILGUN]: { 
    damage: 1000, cooldown: 120, speed: 40, spread: 0, color: '#06b6d4', clipSize: 1, reloadTime: 120, maxReserve: 10, pierce: 99 
  },
  // Buildables (Ammo = Count)
  [WeaponType.BARREL]: { 
    damage: 0, cooldown: 30, speed: 0, spread: 0, color: '#ef4444', clipSize: 1, reloadTime: 0, maxReserve: 5, pierce: 0 
  },
  [WeaponType.WALL]: { 
    damage: 0, cooldown: 30, speed: 0, spread: 0, color: '#4b5563', clipSize: 1, reloadTime: 0, maxReserve: 5, pierce: 0 
  },
};

export const ENEMY_STATS = {
  [EnemyType.NORMAL]: { hp: 50, speed: 1.5, color: '#4ade80', score: 100, radius: 15 },
  [EnemyType.RED]: { hp: 30, speed: 4.0, color: '#ef4444', score: 200, radius: 12 },
  [EnemyType.MUMMY]: { hp: 200, speed: 0.8, color: '#fde047', score: 500, radius: 20 },
  [EnemyType.EXPLODER]: { hp: 40, speed: 3.0, color: '#10b981', score: 300, radius: 18 }, 
  [EnemyType.SPITTER]: { hp: 60, speed: 1.2, color: '#8b5cf6', score: 400, radius: 16 }, 
  [EnemyType.BOSS]: { hp: 5000, speed: 1.3, color: '#7f1d1d', score: 10000, radius: 50 }
};

export const ITEM_STATS = {
  [ItemType.MEDKIT]: { color: '#22c55e', radius: 12, heal: 50, score: 0, chance: 0.05, symbol: '+' },
  [ItemType.NUKE]: { color: '#f59e0b', radius: 12, heal: 0, score: 1000, chance: 0.005, symbol: '☢' },
  [ItemType.RAPID_FIRE]: { color: '#3b82f6', radius: 12, heal: 0, score: 0, chance: 0.03, duration: 300, symbol: '⚡' },
  [ItemType.AMMO]: { color: '#a8a29e', radius: 12, heal: 0, score: 0, chance: 0.15, symbol: '▮' }, // Higher chance for ammo
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

export const WEAPON_UPGRADE_COST = 800;

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.5,
  musicVolume: 0.4,
  sfxVolume: 0.7,
  difficulty: Difficulty.NORMAL,
  particles: 'MEDIUM',
  coopControlScheme: 'FOLLOW_MOVE',
  keys: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    reload: ['KeyR'],
    shoot: ['Space'],
    prevWeapon: ['KeyQ'],
    nextWeapon: ['KeyE']
  },
  p2Keys: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    reload: ['ShiftRight', 'NumpadDecimal', 'Period'],
    shoot: ['Enter', 'Numpad0', 'Return'],
    prevWeapon: ['PageDown', 'NumpadSubtract', 'Comma'],
    nextWeapon: ['PageUp', 'NumpadAdd', 'Quote']
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
  { id: 'IRON_WILL', name: 'Iron Will', description: 'Reach Wave 10 in Endless Mode.', icon: 'Crown' },
  { id: 'DEMOLITION', name: 'Demolition', description: 'Destroy 10 crates.', icon: 'Box' },
  { id: 'COOP_BUDDY', name: 'Battle Brothers', description: 'Play a game in Coop Mode.', icon: 'Users' },
  { id: 'BUILDER', name: 'Fortress', description: 'Build 20 Walls or Barrels.', icon: 'Hammer' }
];
