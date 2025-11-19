
import React, { useRef, useEffect, useState } from 'react';
import { LevelConfig, Entity, Bullet, Particle, WeaponType, Item, ItemType, GameSettings, EnemyType, FloatingText, GameStats, PlayerUpgrades, GameMode, Obstacle } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP, WEAPON_STATS, ENEMY_STATS, ITEM_STATS, DIFFICULTY_MODIFIERS, COMBO_UNLOCK_THRESHOLDS, UPGRADE_CONFIG, TIME_ATTACK_LIMIT } from '../constants';
import { soundSystem } from '../services/SoundSystem';
import { Zap, Heart, Radiation, Skull, Shield, Crosshair, Clock, Snowflake, Play, RotateCcw, Home, Hammer, User } from 'lucide-react';

interface GameEngineProps {
  level: LevelConfig;
  settings: GameSettings;
  upgrades: PlayerUpgrades;
  gameMode: GameMode;
  onGameOver: (stats: GameStats, reason: 'victory' | 'defeat') => void;
  onRestart: () => void;
  onExit: () => void;
}

interface AmmoState {
  [key: string]: { clip: number; reserve: number };
}

interface PlayerState {
  ammo: AmmoState;
  currentWeapon: WeaponType;
  unlockedWeapons: WeaponType[];
  reloadTimer: number;
  score: number;
}

const TOTAL_WAVES = 5;

// Helper for AABB collision
const checkRectCollision = (x: number, y: number, radius: number, rect: Obstacle): boolean => {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const dx = x - closestX;
  const dy = y - closestY;
  return (dx * dx + dy * dy) < (radius * radius);
};

const GameEngine: React.FC<GameEngineProps> = ({ level, settings, upgrades, gameMode, onGameOver, onRestart, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const isMultiplayer = gameMode === GameMode.COOP || gameMode === GameMode.DEATHMATCH;
  const diffMod = DIFFICULTY_MODIFIERS[settings.difficulty];

  // Apply Upgrades
  const maxHp = PLAYER_MAX_HP + (upgrades.health * UPGRADE_CONFIG.health.valuePerLevel);
  const basePlayerSpeed = PLAYER_SPEED + (upgrades.speed * UPGRADE_CONFIG.speed.valuePerLevel);
  const globalDamageMult = 1 + (upgrades.damage * UPGRADE_CONFIG.damage.valuePerLevel);

  // Initialize Players
  const initPlayer = (idx: number, x: number, color: string): Entity => ({
    id: `player-${idx}`,
    playerIndex: idx,
    x,
    y: CANVAS_HEIGHT / 2,
    radius: PLAYER_RADIUS,
    color,
    speed: basePlayerSpeed,
    angle: idx === 0 ? 0 : Math.PI,
    hp: maxHp,
    maxHp: maxHp,
    dead: false,
    score: 0
  });

  const playersRef = useRef<Entity[]>([initPlayer(0, 100, '#60a5fa')]);
  
  // Track player control states (for keyboard aiming persistence)
  const playerCtrlStatesRef = useRef<{lastMoveAngle: number}[]>([{lastMoveAngle: 0}]);

  useEffect(() => {
    if (isMultiplayer && playersRef.current.length === 1) {
      playersRef.current.push(initPlayer(1, CANVAS_WIDTH - 100, '#f97316'));
      playerCtrlStatesRef.current.push({lastMoveAngle: Math.PI});
    } else if (!isMultiplayer && playersRef.current.length > 1) {
      playersRef.current = [playersRef.current[0]];
      playerCtrlStatesRef.current = [playerCtrlStatesRef.current[0]];
    }
  }, [isMultiplayer]);

  // Initialize Player States (Ammo, Weapons)
  const initPlayerState = (): PlayerState => {
    const initialAmmo: AmmoState = {};
    Object.values(WeaponType).forEach(w => {
       initialAmmo[w] = { clip: WEAPON_STATS[w].clipSize, reserve: WEAPON_STATS[w].maxReserve };
    });
    // Give starter buildables
    initialAmmo[WeaponType.BARREL].reserve = 3; 
    initialAmmo[WeaponType.WALL].reserve = 3;

    return {
      ammo: initialAmmo,
      currentWeapon: WeaponType.PISTOL,
      unlockedWeapons: [WeaponType.PISTOL, WeaponType.BARREL, WeaponType.WALL],
      reloadTimer: 0,
      score: 0
    };
  };

  const playerStatesRef = useRef<PlayerState[]>([initPlayerState()]);
  useEffect(() => {
    if (isMultiplayer && playerStatesRef.current.length === 1) {
      playerStatesRef.current.push(initPlayerState());
    }
  }, [isMultiplayer]);

  const obstaclesRef = useRef<Obstacle[]>(JSON.parse(JSON.stringify(level.obstacles || [])));
  const enemiesRef = useRef<Entity[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const scoreRef = useRef<number>(0);
  
  // Stats Tracking
  const statsRef = useRef<GameStats>({
    kills: 0, shotsFired: 0, shotsHit: 0, damageTaken: 0, maxCombo: 0, score: 0, timeElapsed: 0, weaponsUsed: [WeaponType.PISTOL], waveReached: 1
  });
  const comboRef = useRef({ count: 0, timer: 0 });

  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const lastShotTimesRef = useRef<number[]>([0, 0]);
  const spawnTimerRef = useRef<number>(0);
  const isMouseDownRef = useRef<boolean>(false);
  const shakeRef = useRef<number>(0);
  
  // Powerup timers
  const rapidFireTimerRef = useRef<number>(0);
  const doublePointsTimerRef = useRef<number>(0);
  const shieldTimerRef = useRef<number>(0);
  const freezeTimerRef = useRef<number>(0);
  
  const waveRef = useRef<number>(1);
  const enemiesToSpawnRef = useRef<number>(0);
  const waveStateRef = useRef<'SPAWNING' | 'CLEARING' | 'INTERMISSION'>('INTERMISSION');
  const intermissionTimerRef = useRef<number>(180); 
  const timeAttackTimerRef = useRef<number>(TIME_ATTACK_LIMIT * 60); 
  
  // UI Sync State
  const [uiState, setUiState] = useState<{
    hp: number[];
    score: number;
    wave: number;
    waveState: string;
    intermissionTime: number;
    weapon: WeaponType[];
    clip: number[];
    reserve: number[];
    isReloading: boolean[];
    combo: number;
    timeAttackTime: number;
    activePowerups: string[];
  }>({
    hp: [maxHp], score: 0, wave: 1, waveState: 'INTERMISSION', intermissionTime: 3,
    weapon: [WeaponType.PISTOL], clip: [0], reserve: [0], isReloading: [false], combo: 0,
    timeAttackTime: TIME_ATTACK_LIMIT, activePowerups: []
  });

  const [isPaused, setIsPaused] = useState(false);

  const getWaveEnemyCount = (waveIdx: number) => {
    if (gameMode === GameMode.ENDLESS || gameMode === GameMode.COOP) {
       return Math.ceil(10 + waveIdx * 6 * (isMultiplayer ? 1.5 : 1));
    }
    return Math.ceil(level.baseEnemyCount * 0.5) + (waveIdx * 4);
  };

  const getAutoAimAngle = (player: Entity): number | null => {
    let closest: Entity | null = null;
    let minDist = 600;
    
    enemiesRef.current.forEach(e => {
       const d = Math.hypot(e.x - player.x, e.y - player.y);
       if (d < minDist) {
          minDist = d;
          closest = e;
       }
    });
    
    if (closest) {
       // @ts-ignore
       return Math.atan2(closest.y - player.y, closest.x - player.x);
    }
    return null;
  };
  
  useEffect(() => {
    enemiesToSpawnRef.current = getWaveEnemyCount(1);
    if (gameMode === GameMode.TIME_ATTACK) {
       waveStateRef.current = 'SPAWNING';
       enemiesToSpawnRef.current = 999999;
    }
    soundSystem.startMusic();
    return () => soundSystem.stopMusic();
  }, [gameMode, level.baseEnemyCount]);

  const spawnFloatingText = (x: number, y: number, text: string, color: string, size = 16) => {
    floatingTextsRef.current.push({
      id: Math.random().toString(),
      x, y, text, color, life: 60, vy: -1, size
    });
  };

  const spawnExplosion = (x: number, y: number, radius: number, damage: number, ownerId: string) => {
    soundSystem.playPickup('nuke');
    addShake(15);
    
    for(let i=0; i<20; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 30 + Math.random() * 20,
        color: i % 2 === 0 ? '#ef4444' : '#f59e0b',
        size: Math.random() * 10 + 5
      });
    }

    enemiesRef.current.forEach(e => {
       const dist = Math.hypot(e.x - x, e.y - y);
       if (dist < radius) {
          e.hp -= damage;
          spawnFloatingText(e.x, e.y, damage.toString(), '#f59e0b', 20);
       }
    });

    playersRef.current.forEach(p => {
       const dist = Math.hypot(p.x - x, p.y - y);
       if (dist < radius && shieldTimerRef.current <= 0) {
          p.hp -= damage * 0.5;
          spawnFloatingText(p.x, p.y, Math.ceil(damage*0.5).toString(), '#ef4444', 20);
          addShake(5);
       }
    });
  };

  const spawnBlood = (x: number, y: number, color: string, count = 5) => {
    let multiplier = 1;
    if (settings.particles === 'LOW') multiplier = 0.5;
    if (settings.particles === 'HIGH') multiplier = 2;
    const finalCount = Math.ceil(count * multiplier);

    for (let i = 0; i < finalCount; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 20 + Math.random() * 10,
        color: color,
        size: Math.random() * 3 + 1
      });
    }
  };

  const addShake = (amount: number) => {
    shakeRef.current = amount;
  };

  const spawnItem = (x: number, y: number) => {
    const rand = Math.random();
    let cumulativeChance = 0;
    
    for (const type of Object.keys(ITEM_STATS) as ItemType[]) {
      cumulativeChance += ITEM_STATS[type].chance;
      if (rand < cumulativeChance) {
        itemsRef.current.push({
          id: Math.random().toString(),
          x, y, type, life: 600, angle: 0
        });
        break;
      }
    }
  };

  const checkComboUnlocks = () => {
     const currentCombo = comboRef.current.count;
     const unlockWeapon = COMBO_UNLOCK_THRESHOLDS[currentCombo];
     
     if (unlockWeapon) {
        playerStatesRef.current.forEach((ps, idx) => {
           if (!ps.unlockedWeapons.includes(unlockWeapon)) {
              ps.unlockedWeapons.push(unlockWeapon);
              spawnFloatingText(playersRef.current[idx].x, playersRef.current[idx].y - 30, `${unlockWeapon} UNLOCKED!`, '#00ff00', 20);
              soundSystem.playUnlock();
              
              if (unlockWeapon !== WeaponType.BARREL && unlockWeapon !== WeaponType.WALL) {
                 ps.currentWeapon = unlockWeapon;
              }
           }
        });
     }
  };

  const switchWeapon = (playerIdx: number, dir: 'next' | 'prev') => {
     const ps = playerStatesRef.current[playerIdx];
     if (!ps) return;
     const currentIndex = ps.unlockedWeapons.indexOf(ps.currentWeapon);
     let nextIndex = dir === 'next' ? currentIndex + 1 : currentIndex - 1;
     
     if (nextIndex >= ps.unlockedWeapons.length) nextIndex = 0;
     if (nextIndex < 0) nextIndex = ps.unlockedWeapons.length - 1;
     
     ps.currentWeapon = ps.unlockedWeapons[nextIndex];
     ps.reloadTimer = 0;
     if (!statsRef.current.weaponsUsed.includes(ps.currentWeapon)) {
        statsRef.current.weaponsUsed.push(ps.currentWeapon);
     }
  };

  const reloadWeapon = (playerIdx: number) => {
    const ps = playerStatesRef.current[playerIdx];
    if (!ps) return;
    const w = ps.currentWeapon;
    const stats = WEAPON_STATS[w];
    const currentAmmo = ps.ammo[w];
    
    if (currentAmmo.clip < stats.clipSize && (currentAmmo.reserve > 0 || w === WeaponType.PISTOL)) {
      if (ps.reloadTimer === 0) {
        ps.reloadTimer = stats.reloadTime;
        soundSystem.playReload();
      }
    }
  };

  useEffect(() => {
    const initAudio = () => {
      soundSystem.init();
      window.removeEventListener('mousedown', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
    window.addEventListener('mousedown', initAudio);
    window.addEventListener('keydown', initAudio);

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === 'Escape') setIsPaused(prev => !prev);

      if (!isPaused) {
        // P1 Weapons (Num row)
        if (e.key >= '1' && e.key <= '9') {
           const idx = parseInt(e.key) - 1;
           const ps = playerStatesRef.current[0];
           if (ps && idx < ps.unlockedWeapons.length) ps.currentWeapon = ps.unlockedWeapons[idx];
        }

        if (settings.keys.reload.includes(e.code)) reloadWeapon(0);
        if (settings.keys.prevWeapon?.includes(e.code)) switchWeapon(0, 'prev');
        if (settings.keys.nextWeapon?.includes(e.code)) switchWeapon(0, 'next');

        if (isMultiplayer && playerStatesRef.current[1]) {
           if (settings.p2Keys.reload.includes(e.code)) reloadWeapon(1);
           if (settings.p2Keys.prevWeapon?.includes(e.code)) switchWeapon(1, 'prev');
           if (settings.p2Keys.nextWeapon?.includes(e.code)) switchWeapon(1, 'next');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const handleMouseMove = (e: MouseEvent) => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }
    };
    const handleMouseDown = () => { isMouseDownRef.current = true; };
    const handleMouseUp = () => { isMouseDownRef.current = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    let animationFrameId: number;

    const gameLoop = () => {
      if (isPaused) {
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      statsRef.current.timeElapsed += 1;

      if (gameMode === GameMode.TIME_ATTACK) {
         timeAttackTimerRef.current--;
         if (timeAttackTimerRef.current <= 0) {
            onGameOver(statsRef.current, 'victory');
            return;
         }
      }

      if (comboRef.current.count > 0) {
        comboRef.current.timer--;
        if (comboRef.current.timer <= 0) {
          comboRef.current.count = 0;
        }
      }

      if (waveStateRef.current === 'INTERMISSION') {
         intermissionTimerRef.current--;
         if (intermissionTimerRef.current <= 0) {
            waveStateRef.current = 'SPAWNING';
            if (gameMode === GameMode.CAMPAIGN && level.isBossLevel && waveRef.current === 5) {
               enemiesToSpawnRef.current = 1; 
               soundSystem.playBossRoar();
               spawnFloatingText(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, "BOSS INCOMING!", "#ff0000", 40);
            } else {
               enemiesToSpawnRef.current = getWaveEnemyCount(waveRef.current);
            }
         }
      } else if (waveStateRef.current === 'SPAWNING') {
         if (enemiesToSpawnRef.current <= 0 && gameMode !== GameMode.TIME_ATTACK) {
            waveStateRef.current = 'CLEARING';
         }
      } else if (waveStateRef.current === 'CLEARING') {
         if (enemiesRef.current.length === 0) {
            if (gameMode === GameMode.ENDLESS || gameMode === GameMode.COOP || waveRef.current < TOTAL_WAVES) {
               waveRef.current++;
               statsRef.current.waveReached = waveRef.current;
               waveStateRef.current = 'INTERMISSION';
               intermissionTimerRef.current = 180;
               playersRef.current.forEach(p => {
                  if (p.dead) {
                     p.dead = false;
                     p.hp = p.maxHp;
                     p.x = CANVAS_WIDTH / 2;
                     p.y = CANVAS_HEIGHT / 2;
                     spawnFloatingText(p.x, p.y, "RESPAWNED", "#ffffff", 20);
                  }
               });
            } else {
               onGameOver(statsRef.current, 'victory');
               return;
            }
         }
      }

      // --- UPDATE LOOP ---
      ctx.save();
      ctx.fillStyle = level.background;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (shakeRef.current > 0) {
        const dx = (Math.random() - 0.5) * shakeRef.current;
        const dy = (Math.random() - 0.5) * shakeRef.current;
        ctx.translate(dx, dy);
        shakeRef.current *= 0.9;
        if (shakeRef.current < 0.5) shakeRef.current = 0;
      }

      // Draw Obstacles
      obstaclesRef.current.forEach(obs => {
        if (obs.type === 'WALL' || obs.type === 'BARREL') {
           ctx.fillStyle = obs.type === 'BARREL' ? '#ef4444' : '#374151'; 
        } else {
           ctx.fillStyle = '#78350f';
        }
        
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        
        if (obs.type === 'CRATE') {
           ctx.beginPath();
           ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
           ctx.moveTo(obs.x + obs.width, obs.y); ctx.lineTo(obs.x, obs.y + obs.height);
           ctx.stroke();
        } else if (obs.type === 'BARREL') {
           ctx.fillStyle = 'black';
           ctx.font = '12px Arial'; ctx.textAlign='center';
           ctx.fillText('TNT', obs.x + obs.width/2, obs.y + obs.height/2 + 4);
        }
      });

      // Update Players
      playersRef.current.forEach((p, idx) => {
         if (p.dead) return;

         const k = keysRef.current;
         const controls = idx === 0 ? settings.keys : settings.p2Keys;
         const ctrlState = playerCtrlStatesRef.current[idx];
         
         // Movement
         let dx = 0, dy = 0;
         if (controls.up.some(key => k.has(key))) dy -= 1;
         if (controls.down.some(key => k.has(key))) dy += 1;
         if (controls.left.some(key => k.has(key))) dx -= 1;
         if (controls.right.some(key => k.has(key))) dx += 1;

         if (dx !== 0 || dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            const ndx = dx / length;
            const ndy = dy / length;
            
            // Update Last Move Angle
            ctrlState.lastMoveAngle = Math.atan2(ndy, ndx);

            let speed = p.speed;
            if (rapidFireTimerRef.current > 0) speed *= 1.2;
            
            const nextX = p.x + ndx * speed;
            const nextY = p.y + ndy * speed;
            
            let collidedX = false;
            let collidedY = false;
            for (const obs of obstaclesRef.current) {
               if (checkRectCollision(nextX, p.y, p.radius, obs)) collidedX = true;
               if (checkRectCollision(p.x, nextY, p.radius, obs)) collidedY = true;
            }
            if (!collidedX) p.x = nextX;
            if (!collidedY) p.y = nextY;

            p.x = Math.max(p.radius, Math.min(CANVAS_WIDTH - p.radius, p.x));
            p.y = Math.max(p.radius, Math.min(CANVAS_HEIGHT - p.radius, p.y));
         }

         // Player Logic (Reload, Powerups)
         const ps = playerStatesRef.current[idx];
         if (ps.reloadTimer > 0) {
            ps.reloadTimer--;
            if (ps.reloadTimer <= 0) {
               const w = ps.currentWeapon;
               const stats = WEAPON_STATS[w];
               const current = ps.ammo[w];
               if (w === WeaponType.PISTOL) {
                  current.clip = stats.clipSize;
               } else {
                  const needed = stats.clipSize - current.clip;
                  const amount = Math.min(needed, current.reserve);
                  current.clip += amount;
                  current.reserve -= amount;
               }
            }
         }

         // Aiming Logic
         const useMouse = idx === 0 && !isMultiplayer;
         const isAutoAim = settings.coopControlScheme === 'AUTO_AIM';

         if (useMouse) {
            // Single Player / P1 Mouse Aim
            p.angle = Math.atan2(mouseRef.current.y - p.y, mouseRef.current.x - p.x);
         } else {
            // Cooperative / Keyboard Aim
            if (dx !== 0 || dy !== 0) {
               // Priority 1: Aim in movement direction
               p.angle = ctrlState.lastMoveAngle;
            } else if (isAutoAim) {
               // Priority 2: Auto-aim when standing still if enabled
               const autoAngle = getAutoAimAngle(p);
               if (autoAngle !== null) {
                  p.angle = autoAngle;
               } else {
                  p.angle = ctrlState.lastMoveAngle;
               }
            } else {
               // Priority 3: Keep last angle
               p.angle = ctrlState.lastMoveAngle;
            }
         }

         // Shooting Logic
         const isShootingKey = controls.shoot && controls.shoot.some(key => k.has(key));
         const isShootingMouse = useMouse && isMouseDownRef.current;

         let cooldown = WEAPON_STATS[ps.currentWeapon].cooldown;
         if (rapidFireTimerRef.current > 0) cooldown = Math.ceil(cooldown / 2);

         if ((isShootingKey || isShootingMouse) && frameRef.current - lastShotTimesRef.current[idx] > cooldown) {
             const w = ps.currentWeapon;
             const weapon = WEAPON_STATS[w];
             const ammo = ps.ammo[w];

             if (w === WeaponType.BARREL || w === WeaponType.WALL) {
                if (ammo.reserve > 0 && frameRef.current - lastShotTimesRef.current[idx] > 30) {
                   lastShotTimesRef.current[idx] = frameRef.current;
                   ammo.reserve--;
                   const placeX = p.x + Math.cos(p.angle) * 40;
                   const placeY = p.y + Math.sin(p.angle) * 40;
                   const snapX = Math.round(placeX / 20) * 20;
                   const snapY = Math.round(placeY / 20) * 20;

                   obstaclesRef.current.push({
                      id: Math.random().toString(),
                      x: snapX - 15, y: snapY - 15,
                      width: 30, height: 30,
                      type: w === WeaponType.BARREL ? 'BARREL' : 'WALL',
                      hp: w === WeaponType.BARREL ? 50 : 200
                   });
                   soundSystem.playShoot('pistol');
                }
             } 
             else if (ps.reloadTimer > 0) {
                // Reloading...
             } else if (ammo.clip <= 0) {
                if (frameRef.current - lastShotTimesRef.current[idx] > 20) {
                   soundSystem.playEmpty();
                   lastShotTimesRef.current[idx] = frameRef.current;
                   reloadWeapon(idx);
                }
             } else {
                lastShotTimesRef.current[idx] = frameRef.current;
                ammo.clip--;
                statsRef.current.shotsFired++;
                
                if (w === WeaponType.PISTOL) soundSystem.playShoot('pistol');
                else if (w === WeaponType.SHOTGUN) soundSystem.playShoot('shotgun');
                else if (w === WeaponType.FLAMETHROWER) soundSystem.playShoot('flame');
                else soundSystem.playShoot('pistol');

                if (w === WeaponType.SHOTGUN || w === WeaponType.SNIPER || w === WeaponType.RAILGUN) addShake(5);
                else addShake(2);

                const weaponLevel = upgrades.weaponLevels?.[w] || 0;
                const weaponDmgMult = 1 + (weaponLevel * 0.2);
                const totalDamage = weapon.damage * globalDamageMult * weaponDmgMult;

                const createBullet = (angleOffset: number) => {
                  const angle = p.angle + angleOffset;
                  bulletsRef.current.push({
                    id: Math.random().toString(),
                    ownerId: p.id,
                    x: p.x + Math.cos(angle) * 20,
                    y: p.y + Math.sin(angle) * 20,
                    vx: Math.cos(angle) * weapon.speed,
                    vy: Math.sin(angle) * weapon.speed,
                    damage: totalDamage,
                    color: rapidFireTimerRef.current > 0 ? '#60a5fa' : weapon.color,
                    radius: w === WeaponType.FLAMETHROWER ? 4 : (w === WeaponType.RAILGUN ? 5 : 3),
                    duration: weapon.duration || 1000,
                    pierce: weapon.pierce || 0
                  });
                };

                if (w === WeaponType.SHOTGUN) {
                   [0, 0.15, -0.15, 0.3, -0.3].forEach(createBullet);
                } else if (w === WeaponType.UZI) {
                   createBullet((Math.random() - 0.5) * 0.2);
                } else if (w === WeaponType.FLAMETHROWER) {
                   createBullet((Math.random() - 0.5) * 0.2);
                } else {
                   createBullet(0);
                }
             }
         }
      });

      // Check Game Over
      if (playersRef.current.every(p => p.dead)) {
         onGameOver(statsRef.current, 'defeat');
      }

      // Powerups Tick
      if (rapidFireTimerRef.current > 0) rapidFireTimerRef.current--;
      if (doublePointsTimerRef.current > 0) doublePointsTimerRef.current--;
      if (shieldTimerRef.current > 0) shieldTimerRef.current--;
      if (freezeTimerRef.current > 0) freezeTimerRef.current--;

      // Update Bullets
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
         const b = bulletsRef.current[i];
         b.x += b.vx; b.y += b.vy; b.duration--;
         let destroyed = false;

         if (b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT) destroyed = true;
         if (b.duration <= 0 && !destroyed) destroyed = true;

         if (!destroyed) {
            for (const obs of obstaclesRef.current) {
               if (checkRectCollision(b.x, b.y, b.radius, obs)) {
                  if ((obs.type === 'CRATE' || obs.type === 'BARREL') && obs.hp !== undefined) {
                     obs.hp -= b.damage;
                     spawnFloatingText(obs.x + obs.width/2, obs.y, Math.ceil(b.damage).toString(), 'orange', 10);
                     if (obs.hp <= 0) {
                        if (obs.type === 'BARREL') {
                           spawnExplosion(obs.x+15, obs.y+15, 100, 150, b.ownerId);
                        } else {
                           soundSystem.playShoot('shotgun'); 
                           spawnItem(obs.x+obs.width/2, obs.y+obs.height/2);
                           spawnBlood(obs.x+obs.width/2, obs.y+obs.height/2, '#854d0e', 8);
                        }
                        const idx = obstaclesRef.current.indexOf(obs);
                        if (idx > -1) obstaclesRef.current.splice(idx, 1);
                     }
                  }
                  destroyed = true;
                  if (b.pierce && b.pierce > 0 && obs.type !== 'WALL') destroyed = false; // Pierce through crates
                  if (obs.type === 'WALL') destroyed = true;
                  break;
               }
            }
         }

         if (destroyed) { bulletsRef.current.splice(i, 1); continue; }

         // Enemy Hit Logic
         let hitCount = 0;
         const maxHits = 1 + (b.pierce || 0);

         for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
            const enemy = enemiesRef.current[j];
            if (Math.hypot(b.x - enemy.x, b.y - enemy.y) < enemy.radius + b.radius) {
               enemy.hp -= b.damage;
               spawnBlood(enemy.x, enemy.y, '#166534');
               statsRef.current.shotsHit++;
               soundSystem.playEnemyHit();
               spawnFloatingText(enemy.x, enemy.y, Math.ceil(b.damage).toString(), 'white', 12);
               hitCount++;
               if (hitCount >= maxHits) {
                  bulletsRef.current.splice(i, 1);
                  break;
               }
            }
         }
      }

      // Update Enemies
      if (waveStateRef.current === 'SPAWNING' && enemiesToSpawnRef.current > 0) {
         spawnTimerRef.current++;
         let currentSpawnRate = Math.max(30, level.spawnRate - (waveRef.current * 5));
         if (gameMode === GameMode.TIME_ATTACK) currentSpawnRate = 40; 

         if (spawnTimerRef.current > currentSpawnRate) {
           spawnTimerRef.current = 0;
           if (gameMode !== GameMode.TIME_ATTACK) enemiesToSpawnRef.current--;
           
           const isBoss = level.isBossLevel && waveRef.current === 5;
           let type = isBoss ? EnemyType.BOSS : EnemyType.NORMAL;
           
           if (!isBoss) {
              const types = level.enemyTypes;
              const rand = Math.random();
              if (types.includes(EnemyType.MUMMY) && rand > 0.85) type = EnemyType.MUMMY;
              else if (types.includes(EnemyType.EXPLODER) && rand > 0.75) type = EnemyType.EXPLODER;
              else if (types.includes(EnemyType.SPITTER) && rand > 0.65) type = EnemyType.SPITTER;
              else if (types.includes(EnemyType.RED) && rand > 0.50) type = EnemyType.RED;
           }
           
           const stats = ENEMY_STATS[type];
           const edge = Math.floor(Math.random() * 4);
           let ex = 0, ey = 0;
           if (edge === 0) { ex = Math.random() * CANVAS_WIDTH; ey = -50; }
           else if (edge === 1) { ex = CANVAS_WIDTH + 50; ey = Math.random() * CANVAS_HEIGHT; }
           else if (edge === 2) { ex = Math.random() * CANVAS_WIDTH; ey = CANVAS_HEIGHT + 50; }
           else { ex = -50; ey = Math.random() * CANVAS_HEIGHT; }

           let hpMultiplier = diffMod.hp;
           if (gameMode === GameMode.ENDLESS) hpMultiplier += (waveRef.current * 0.2);

           enemiesRef.current.push({
             id: Math.random().toString(),
             x: ex, y: ey,
             type: type,
             radius: stats.radius,
             color: stats.color,
             speed: stats.speed * diffMod.speed,
             angle: 0,
             hp: stats.hp * hpMultiplier,
             maxHp: stats.hp * hpMultiplier
           });
         }
      }

      for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
         const enemy = enemiesRef.current[i];
         
         let target = playersRef.current[0];
         let minDist = 999999;
         playersRef.current.forEach(p => {
            if (p.dead) return;
            const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
            if (d < minDist) {
               minDist = d;
               target = p;
            }
         });

         if (freezeTimerRef.current <= 0 && enemy.type !== EnemyType.BOSS) {
             const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
             enemy.angle = angle;
             
             let speed = enemy.speed;
             if (enemy.type === EnemyType.SPITTER && minDist < 300) {
                speed = 0; 
                enemy.attackTimer = (enemy.attackTimer || 0) + 1;
                if (enemy.attackTimer > 120) {
                   enemy.attackTimer = 0;
                   enemyBulletsRef.current.push({
                      id: Math.random().toString(), ownerId: enemy.id,
                      x: enemy.x, y: enemy.y, vx: Math.cos(angle)*4, vy: Math.sin(angle)*4,
                      damage: 15 * diffMod.damage, color: '#8b5cf6', radius: 6, duration: 200, isEnemy: true
                   });
                }
             }

             if (speed > 0) {
                const nx = enemy.x + Math.cos(angle) * speed;
                const ny = enemy.y + Math.sin(angle) * speed;
                let collided = false;
                for(const obs of obstaclesRef.current) {
                   if(checkRectCollision(nx, ny, enemy.radius, obs)) { collided = true; break; }
                }
                if(!collided) { enemy.x = nx; enemy.y = ny; }
             }
         }

         if (enemy.type === EnemyType.BOSS) {
             if (!enemy.enraged && enemy.hp < enemy.maxHp * 0.5) {
                 enemy.enraged = true; enemy.speed *= 1.6; enemy.color = '#ff0000';
                 spawnFloatingText(enemy.x, enemy.y, "ENRAGED!", "#ff0000", 40);
                 addShake(20);
             }
             if (frameRef.current % 300 === 0) {
                 for(let k=0;k<3;k++) enemiesRef.current.push({
                     id: Math.random().toString(), x: enemy.x, y: enemy.y, type: EnemyType.NORMAL,
                     radius: 15, color: '#4ade80', speed: 2, angle: 0, hp: 30, maxHp: 30
                 });
             }
         }

         playersRef.current.forEach(p => {
            if (p.dead) return;
            if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < p.radius + enemy.radius) {
               if (enemy.type === EnemyType.EXPLODER) {
                  enemy.hp = 0; 
               } else if (frameRef.current % 30 === 0 && shieldTimerRef.current <= 0) {
                  p.hp -= 10 * diffMod.damage;
                  spawnFloatingText(p.x, p.y, "-10", "red");
                  addShake(5);
                  spawnBlood(p.x, p.y, '#ef4444');
                  if (p.hp <= 0) p.dead = true;
               }
            }
         });

         if (enemy.hp <= 0) {
            let s = ENEMY_STATS[enemy.type!].score * diffMod.score;
            if (doublePointsTimerRef.current > 0) s *= 2;
            scoreRef.current += s;
            statsRef.current.score = scoreRef.current;
            statsRef.current.kills++;
            
            comboRef.current.count++;
            comboRef.current.timer = 120;
            checkComboUnlocks();

            if (enemy.type === EnemyType.EXPLODER) {
               spawnExplosion(enemy.x, enemy.y, 80, 50, 'enemy');
            }

            spawnItem(enemy.x, enemy.y);
            enemiesRef.current.splice(i, 1);
         }
      }

      for (let i = enemyBulletsRef.current.length - 1; i >= 0; i--) {
         const b = enemyBulletsRef.current[i];
         b.x += b.vx; b.y += b.vy; b.duration--;
         let destroyed = false;
         for(const obs of obstaclesRef.current) {
            if(checkRectCollision(b.x, b.y, b.radius, obs)) { destroyed = true; break; }
         }
         if (!destroyed) {
            playersRef.current.forEach(p => {
               if (!p.dead && Math.hypot(p.x - b.x, p.y - b.y) < p.radius + b.radius) {
                  if (shieldTimerRef.current <= 0) {
                     p.hp -= b.damage;
                     if (p.hp <= 0) p.dead = true;
                  }
                  destroyed = true;
               }
            });
         }
         if (destroyed || b.duration <= 0) enemyBulletsRef.current.splice(i, 1);
      }

      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
         const item = itemsRef.current[i];
         item.life--;
         let picked = false;
         playersRef.current.forEach((p, pIdx) => {
            if (p.dead) return;
            if (Math.hypot(p.x - item.x, p.y - item.y) < p.radius + 15) {
               const stats = ITEM_STATS[item.type];
               spawnFloatingText(p.x, p.y - 30, stats.symbol, stats.color, 20);
               
               if (item.type === ItemType.MEDKIT) p.hp = Math.min(p.maxHp, p.hp + stats.heal!);
               else if (item.type === ItemType.AMMO) {
                  const ps = playerStatesRef.current[pIdx];
                  Object.keys(ps.ammo).forEach(k => {
                     const w = k as WeaponType;
                     ps.ammo[w].reserve = Math.min(WEAPON_STATS[w].maxReserve, ps.ammo[w].reserve + WEAPON_STATS[w].clipSize * 2);
                  });
               }
               else if (item.type === ItemType.NUKE) enemiesRef.current.forEach(e => e.hp = 0);
               else if (item.type === ItemType.RAPID_FIRE) rapidFireTimerRef.current = stats.duration!;
               else if (item.type === ItemType.DOUBLE_POINTS) doublePointsTimerRef.current = stats.duration!;
               else if (item.type === ItemType.SHIELD) shieldTimerRef.current = stats.duration!;
               else if (item.type === ItemType.FREEZE) freezeTimerRef.current = stats.duration!;
               
               soundSystem.playPickup('powerup');
               picked = true;
            }
         });
         if (picked || item.life <= 0) itemsRef.current.splice(i, 1);
      }

      // Render Entities
      playersRef.current.forEach(p => {
         if (p.dead) return;
         ctx.save();
         ctx.translate(p.x, p.y);
         if (shieldTimerRef.current > 0) {
            ctx.strokeStyle = 'cyan'; ctx.beginPath(); ctx.arc(0, 0, p.radius+5, 0, Math.PI*2); ctx.stroke();
         }
         ctx.rotate(p.angle);
         ctx.fillStyle = p.color;
         ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI*2); ctx.fill();
         ctx.fillStyle = '#333'; ctx.fillRect(0, -4, 25, 8); // gun
         ctx.restore();
      });

      enemiesRef.current.forEach(e => {
         ctx.save();
         ctx.translate(e.x, e.y);
         ctx.rotate(e.angle);
         ctx.fillStyle = freezeTimerRef.current > 0 ? '#06b6d4' : e.color;
         ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI*2); ctx.fill();
         if (e.hp < e.maxHp) {
            ctx.fillStyle = 'red'; ctx.fillRect(-15, -e.radius-10, 30, 4);
            ctx.fillStyle = 'lime'; ctx.fillRect(-15, -e.radius-10, 30 * (e.hp/e.maxHp), 4);
         }
         ctx.restore();
      });

      bulletsRef.current.forEach(b => { ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); });
      particlesRef.current.forEach(p => { ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); });
      floatingTextsRef.current.forEach(t => { ctx.fillStyle=t.color; ctx.fillText(t.text, t.x, t.y); });
      itemsRef.current.forEach(i => { ctx.fillStyle=ITEM_STATS[i.type].color; ctx.fillRect(i.x-5,i.y-5,10,10); });

      ctx.restore();

      const activePs = playerStatesRef.current;
      const actives = [];
      if (rapidFireTimerRef.current > 0) actives.push('RAPID');
      if (doublePointsTimerRef.current > 0) actives.push('2X');
      if (shieldTimerRef.current > 0) actives.push('SHIELD');
      if (freezeTimerRef.current > 0) actives.push('FREEZE');

      setUiState({
         hp: playersRef.current.map(p => p.hp),
         score: scoreRef.current,
         wave: waveRef.current,
         waveState: waveStateRef.current,
         intermissionTime: Math.ceil(intermissionTimerRef.current / 60),
         weapon: activePs.map(ps => ps.currentWeapon),
         clip: activePs.map(ps => ps.ammo[ps.currentWeapon].clip),
         reserve: activePs.map(ps => ps.ammo[ps.currentWeapon].reserve),
         isReloading: activePs.map(ps => ps.reloadTimer > 0),
         combo: comboRef.current.count,
         timeAttackTime: Math.ceil(timeAttackTimerRef.current / 60),
         activePowerups: actives
      });

      frameRef.current++;
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, [level, settings, upgrades, gameMode, onGameOver, isPaused, onRestart, onExit, isMultiplayer]);

  return (
    <div className="relative">
       <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="block border-4 border-zinc-800 bg-black rounded shadow-2xl cursor-crosshair mx-auto"/>
       
       {uiState.waveState === 'INTERMISSION' && gameMode !== GameMode.TIME_ATTACK && (
         <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
             <div className="bg-black/70 p-6 rounded text-center border-y-4 border-green-600 w-full backdrop-blur-sm">
               <h3 className="text-4xl font-bold text-green-500 mb-2">WAVE {uiState.wave} CLEARED</h3>
               <p className="text-white text-xl animate-pulse">NEXT WAVE IN {uiState.intermissionTime}...</p>
             </div>
         </div>
       )}

       <div className="absolute top-4 left-0 w-full px-4 flex justify-between pointer-events-none">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-2 bg-black/60 p-2 rounded border border-blue-900 text-blue-400">
                <User size={20} /> P1
                <div className="w-32 h-3 bg-zinc-800 rounded overflow-hidden">
                   <div className="h-full bg-blue-500" style={{width: `${Math.max(0, uiState.hp[0])}%`}}></div>
                </div>
             </div>
             <div className="bg-black/60 p-2 rounded border border-zinc-700 text-white">
                <div className="text-yellow-400 text-xl">{uiState.weapon[0]}</div>
                <div className="text-2xl font-bold">{uiState.isReloading[0] ? 'RLD' : uiState.clip[0]} <span className="text-sm text-zinc-400">/ {uiState.reserve[0]}</span></div>
             </div>
          </div>

          <div className="flex flex-col items-center">
             <div className="bg-black/60 px-4 py-1 rounded border border-zinc-700 text-white font-bold text-xl">
                SCORE: {uiState.score}
             </div>
             {uiState.combo > 1 && <div className="text-yellow-500 font-bold animate-bounce text-2xl mt-2">{uiState.combo}x COMBO</div>}
             <div className="flex gap-2 mt-1">
                {uiState.activePowerups.map(p => (
                   <span key={p} className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded text-xs border border-blue-500">{p}</span>
                ))}
             </div>
          </div>

          {isMultiplayer ? (
            <div className="flex flex-col gap-1 items-end">
               <div className="flex items-center gap-2 bg-black/60 p-2 rounded border border-orange-900 text-orange-400">
                  <div className="w-32 h-3 bg-zinc-800 rounded overflow-hidden">
                     <div className="h-full bg-orange-500" style={{width: `${Math.max(0, uiState.hp[1] || 0)}%`}}></div>
                  </div>
                  P2 <User size={20} />
               </div>
               <div className="bg-black/60 p-2 rounded border border-zinc-700 text-white text-right">
                  <div className="text-yellow-400 text-xl">{uiState.weapon[1]}</div>
                  <div className="text-2xl font-bold">{uiState.isReloading[1] ? 'RLD' : uiState.clip[1]} <span className="text-sm text-zinc-400">/ {uiState.reserve[1]}</span></div>
               </div>
            </div>
          ) : (
             <div className="bg-black/60 p-2 rounded border border-zinc-700 text-zinc-300 w-32">
                <div className="text-sm">WAVE {uiState.wave}</div>
                {gameMode === GameMode.TIME_ATTACK && <div className="text-xl text-red-400 font-mono">{Math.floor(uiState.timeAttackTime/60)}:{(uiState.timeAttackTime%60).toString().padStart(2,'0')}</div>}
             </div>
          )}
       </div>

       {isPaused && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
           <div className="bg-zinc-900 border-2 border-zinc-700 p-8 w-80 text-center shadow-2xl">
             <h2 className="text-4xl font-bold text-white mb-6 tracking-widest border-b border-zinc-700 pb-4">PAUSED</h2>
             <div className="space-y-4">
                <button onClick={() => setIsPaused(false)} className="w-full flex items-center justify-center gap-2 py-3 bg-green-900/20 border border-green-800 text-green-500 font-bold"><Play size={20} /> RESUME</button>
                <button onClick={onRestart} className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-800 border border-zinc-600 text-zinc-300 font-bold"><RotateCcw size={20} /> RESTART</button>
                <button onClick={onExit} className="w-full flex items-center justify-center gap-2 py-3 bg-red-900/20 border border-red-800 text-red-500 font-bold"><Home size={20} /> QUIT</button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

export default GameEngine;
