
export enum GameState {
  MENU = 'MENU',
  BRIEFING = 'BRIEFING',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export enum GameMode {
  CAMPAIGN = 'CAMPAIGN',
  ENDLESS = 'ENDLESS',
  TIME_ATTACK = 'TIME_ATTACK'
}

export enum WeaponType {
  PISTOL = 'Pistol',
  SHOTGUN = 'Shotgun',
  FLAMETHROWER = 'Flamethrower',
  ASSAULT_RIFLE = 'Assault Rifle',
  SNIPER = 'Sniper Rifle'
}

export enum EnemyType {
  NORMAL = 'NORMAL',
  RED = 'RED',
  MUMMY = 'MUMMY',
  EXPLODER = 'EXPLODER',
  SPITTER = 'SPITTER',
  BOSS = 'BOSS'
}

export enum ItemType {
  MEDKIT = 'MEDKIT',
  NUKE = 'NUKE',
  RAPID_FIRE = 'RAPID_FIRE',
  AMMO = 'AMMO',
  DOUBLE_POINTS = 'DOUBLE_POINTS',
  SHIELD = 'SHIELD',
  FREEZE = 'FREEZE'
}

export enum Difficulty {
  EASY = 'EASY',
  NORMAL = 'NORMAL',
  HARD = 'HARD'
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'WALL' | 'CRATE'; // Wall is indestructible, Crate can be broken
  hp?: number; // Only for crates
}

export interface LevelConfig {
  id: number;
  name: string;
  description: string;
  baseEnemyCount: number; 
  spawnRate: number; 
  enemyTypes: EnemyType[];
  unlockedWeapon?: WeaponType;
  background: string;
  obstacles: Obstacle[];
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
  attackTimer?: number; // For spitters
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
  duration: number; 
  pierce?: number; // For Sniper
  isEnemy?: boolean; // For Spitter
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
  life: number; 
  angle: number; 
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
  size: number;
}

export interface GameStats {
  kills: number;
  shotsFired: number;
  shotsHit: number;
  damageTaken: number;
  maxCombo: number;
  score: number;
  timeElapsed: number;
  weaponsUsed: WeaponType[];
  waveReached: number;
}

export interface PlayerUpgrades {
  health: number;
  speed: number;
  damage: number;
  weaponLevels: { [key in WeaponType]?: number }; // Level 0-5
}

export interface KeyBindings {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  reload: string[];
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  difficulty: Difficulty;
  particles: 'LOW' | 'MEDIUM' | 'HIGH';
  keys: KeyBindings;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}
