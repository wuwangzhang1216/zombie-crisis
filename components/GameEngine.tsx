
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
    respawnTimer: 0,
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
    respawnTimers: number[];
  }>({
    hp: [maxHp], score: 0, wave: 1, waveState: 'INTERMISSION', intermissionTime: 3,
    weapon: [WeaponType.PISTOL], clip: [0], reserve: [0], isReloading: [false], combo: 0,
    timeAttackTime: TIME_ATTACK_LIMIT, activePowerups: [], respawnTimers: [0]
  });

  const [isPaused, setIsPaused] = useState(false);

  const getWaveEnemyCount = (waveIdx: number) => {
    if (gameMode === GameMode.ENDLESS || gameMode === GameMode.COOP) {
       // Reduced multiplier from 1.5 to 1.1 for better balance in Co-op
       return Math.ceil(10 + waveIdx * 6 * (isMultiplayer ? 1.1 : 1));
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
    // Increase drop rate in multiplayer to account for split resources
    const chanceMultiplier = isMultiplayer ? 2.0 : 1.0;
    
    for (const type of Object.keys(ITEM_STATS) as ItemType[]) {
      cumulativeChance += ITEM_STATS[type].chance * chanceMultiplier;
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

      // Timers
      if (rapidFireTimerRef.current > 0) rapidFireTimerRef.current--;
      if (doublePointsTimerRef.current > 0) doublePointsTimerRef.current--;
      if (shieldTimerRef.current > 0) shieldTimerRef.current--;
      if (freezeTimerRef.current > 0) freezeTimerRef.current--;

      if (gameMode === GameMode.TIME_ATTACK) {
         timeAttackTimerRef.current--;
         if (timeAttackTimerRef.current <= 0) {
            onGameOver(statsRef.current, 'victory');
            return;
         }
      }

      // Multiplayer Auto-Respawn Logic
      if (isMultiplayer) {
        const alivePlayers = playersRef.current.filter(p => !p.dead);
        if (alivePlayers.length > 0) {
            playersRef.current.forEach(p => {
                if (p.dead) {
                    if (p.respawnTimer && p.respawnTimer > 0) {
                        p.respawnTimer--;
                        if (p.respawnTimer <= 0) {
                            // Revive
                            p.dead = false;
                            p.hp = p.maxHp;
                            p.respawnTimer = 0;
                            // Teleport to an alive player
                            const buddy = alivePlayers[0];
                            p.x = buddy.x;
                            p.y = buddy.y;
                            spawnFloatingText(p.x, p.y, "REINFORCEMENTS!", "#00ff00", 24);
                            soundSystem.playPickup('powerup');
                        }
                    }
                }
            });
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
                     p.respawnTimer = 0;
                     p.x = CANVAS_WIDTH / 2;
                     p.y = CANVAS_HEIGHT / 2;
                     spawnFloatingText(p.x, p.y, "RESPAWNED", "#ffffff", 20);
                  } else {
                    // Heal survivor slightly
                    p.hp = Math.min(p.hp + 20, p.maxHp);
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

      // Screen Shake
      if (shakeRef.current > 0) {
          const shakeX = (Math.random() - 0.5) * shakeRef.current;
          const shakeY = (Math.random() - 0.5) * shakeRef.current;
          ctx.translate(shakeX, shakeY);
          shakeRef.current *= 0.9;
          if (shakeRef.current < 0.5) shakeRef.current = 0;
      }

      // Draw Obstacles
      ctx.lineWidth = 2;
      obstaclesRef.current.forEach(obs => {
        if (obs.type === 'WALL') {
           ctx.fillStyle = '#3f3f46';
           ctx.strokeStyle = '#18181b';
           ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
           ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        } else if (obs.type === 'CRATE') {
           ctx.fillStyle = '#713f12'; 
           ctx.strokeStyle = '#451a03';
           ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
           ctx.beginPath();
           ctx.moveTo(obs.x, obs.y);
           ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
           ctx.moveTo(obs.x + obs.width, obs.y);
           ctx.lineTo(obs.x, obs.y + obs.height);
           ctx.stroke();
        } else if (obs.type === 'BARREL') {
            ctx.fillStyle = '#ef4444';
            ctx.strokeStyle = '#7f1d1d';
            ctx.beginPath();
            ctx.arc(obs.x + obs.width/2, obs.y + obs.height/2, obs.width/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Symbol
            ctx.fillStyle = '#000';
            ctx.font = '12px monospace';
            ctx.fillText('!', obs.x + obs.width/2 - 4, obs.y + obs.height/2 + 4);
        }
      });

      // Draw Items
      itemsRef.current = itemsRef.current.filter(item => {
          item.life--;
          if (item.life <= 0) return false;

          // Wobble
          const wobble = Math.sin(frameRef.current * 0.1) * 3;
          
          ctx.fillStyle = ITEM_STATS[item.type].color;
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(item.x, item.y + wobble, ITEM_STATS[item.type].radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.fillStyle = '#fff';
          ctx.font = '14px monospace';
          ctx.fillText(ITEM_STATS[item.type].symbol, item.x - 5, item.y + wobble + 5);
          
          return true;
      });

      // Update & Draw Players
      playersRef.current.forEach((p, idx) => {
         if(p.dead) return;
         const ps = playerStatesRef.current[idx];
         
         // Movement
         let dx = 0; 
         let dy = 0;
         const pKeys = p.playerIndex === 0 ? settings.keys : settings.p2Keys;
         
         if (pKeys.up.some(k => keysRef.current.has(k))) dy -= 1;
         if (pKeys.down.some(k => keysRef.current.has(k))) dy += 1;
         if (pKeys.left.some(k => keysRef.current.has(k))) dx -= 1;
         if (pKeys.right.some(k => keysRef.current.has(k))) dx += 1;

         if (dx !== 0 || dy !== 0) {
            const mag = Math.hypot(dx, dy);
            dx = (dx / mag) * p.speed;
            dy = (dy / mag) * p.speed;
            
            // Collision with obstacles
            let nextX = p.x + dx;
            let nextY = p.y + dy;
            let colX = false;
            let colY = false;
            
            // Screen bounds
            if (nextX < p.radius || nextX > CANVAS_WIDTH - p.radius) colX = true;
            if (nextY < p.radius || nextY > CANVAS_HEIGHT - p.radius) colY = true;

            obstaclesRef.current.forEach(obs => {
               if (checkRectCollision(nextX, p.y, p.radius, obs)) colX = true;
               if (checkRectCollision(p.x, nextY, p.radius, obs)) colY = true;
            });

            if (!colX) p.x += dx;
            if (!colY) p.y += dy;
            
            // Store movement angle for P2/Coop auto-aim fallback
            if (dx !== 0 || dy !== 0) {
               playerCtrlStatesRef.current[idx].lastMoveAngle = Math.atan2(dy, dx);
            }
         }

         // Aiming
         if (idx === 0 && !isMultiplayer) {
            p.angle = Math.atan2(mouseRef.current.y - p.y, mouseRef.current.x - p.x);
         } else {
            // Coop / Controller logic
            if (settings.coopControlScheme === 'AUTO_AIM') {
               const autoAngle = getAutoAimAngle(p);
               if (autoAngle !== null) {
                  p.angle = autoAngle;
               } else if (dx !== 0 || dy !== 0) {
                  p.angle = Math.atan2(dy, dx);
               } else {
                  p.angle = playerCtrlStatesRef.current[idx].lastMoveAngle;
               }
            } else {
               if (dx !== 0 || dy !== 0) p.angle = Math.atan2(dy, dx);
               else p.angle = playerCtrlStatesRef.current[idx].lastMoveAngle;
            }
         }

         // Item Pickup
         itemsRef.current = itemsRef.current.filter(item => {
             const dist = Math.hypot(item.x - p.x, item.y - p.y);
             if (dist < p.radius + ITEM_STATS[item.type].radius) {
                soundSystem.playPickup(item.type === 'MEDKIT' ? 'health' : item.type === 'AMMO' ? 'ammo' : 'powerup');
                
                if (item.type === ItemType.MEDKIT) {
                   p.hp = Math.min(p.maxHp, p.hp + ITEM_STATS.MEDKIT.heal!);
                   spawnFloatingText(p.x, p.y, `+${ITEM_STATS.MEDKIT.heal}`, '#22c55e');
                } else if (item.type === ItemType.AMMO) {
                   Object.keys(ps.ammo).forEach(k => {
                      const w = k as WeaponType;
                      if (w !== WeaponType.BARREL && w !== WeaponType.WALL) {
                         ps.ammo[w].reserve = Math.min(WEAPON_STATS[w].maxReserve, ps.ammo[w].reserve + WEAPON_STATS[w].clipSize * 2);
                      }
                   });
                   spawnFloatingText(p.x, p.y, "AMMO MAX", '#a8a29e');
                } else if (item.type === ItemType.NUKE) {
                   spawnExplosion(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 1000, 500, p.id);
                   spawnFloatingText(p.x, p.y, "NUKE!", '#f59e0b');
                } else if (item.type === ItemType.RAPID_FIRE) {
                   rapidFireTimerRef.current = ITEM_STATS.RAPID_FIRE.duration!;
                   spawnFloatingText(p.x, p.y, "RAPID FIRE", '#3b82f6');
                } else if (item.type === ItemType.DOUBLE_POINTS) {
                   doublePointsTimerRef.current = ITEM_STATS.DOUBLE_POINTS.duration!;
                   spawnFloatingText(p.x, p.y, "2X POINTS", '#eab308');
                } else if (item.type === ItemType.SHIELD) {
                   shieldTimerRef.current = ITEM_STATS.SHIELD.duration!;
                   spawnFloatingText(p.x, p.y, "SHIELD", '#8b5cf6');
                } else if (item.type === ItemType.FREEZE) {
                   freezeTimerRef.current = ITEM_STATS.FREEZE.duration!;
                   spawnFloatingText(p.x, p.y, "FREEZE", '#06b6d4');
                   soundSystem.playFreeze();
                }
                return false;
             }
             return true;
         });

         // Shooting
         const shootKeys = pKeys.shoot || [];
         const isShooting = idx === 0 && !isMultiplayer ? isMouseDownRef.current || shootKeys.some(k => keysRef.current.has(k)) : shootKeys.some(k => keysRef.current.has(k));
         
         if (ps.reloadTimer > 0) ps.reloadTimer--;

         if (isShooting && ps.reloadTimer <= 0 && frameRef.current - lastShotTimesRef.current[idx] > (rapidFireTimerRef.current > 0 ? WEAPON_STATS[ps.currentWeapon].cooldown / 2 : WEAPON_STATS[ps.currentWeapon].cooldown)) {
             const wStats = WEAPON_STATS[ps.currentWeapon];
             const ammo = ps.ammo[ps.currentWeapon];
             
             if (ammo.clip > 0) {
                lastShotTimesRef.current[idx] = frameRef.current;
                ammo.clip--;
                statsRef.current.shotsFired++;
                addShake(2);
                
                const fireBullet = (angleOffset: number) => {
                    const spread = (Math.random() - 0.5) * wStats.spread;
                    const angle = p.angle + spread + angleOffset;
                    
                    bulletsRef.current.push({
                       id: Math.random().toString(),
                       ownerId: p.id,
                       x: p.x + Math.cos(p.angle) * 20,
                       y: p.y + Math.sin(p.angle) * 20,
                       vx: Math.cos(angle) * wStats.speed,
                       vy: Math.sin(angle) * wStats.speed,
                       damage: wStats.damage * globalDamageMult,
                       color: wStats.color,
                       radius: 3,
                       duration: wStats.duration || 60,
                       pierce: wStats.pierce || 0
                    });
                };

                if (ps.currentWeapon === WeaponType.SHOTGUN) {
                   for(let i=0; i< (wStats.count || 5); i++) fireBullet(0);
                   soundSystem.playShoot('shotgun');
                } else if (ps.currentWeapon === WeaponType.BARREL) {
                   obstaclesRef.current.push({ id: Math.random().toString(), x: p.x, y: p.y, width: 20, height: 20, type: 'BARREL', hp: 50 });
                   spawnFloatingText(p.x, p.y, "PLACED", "#fff");
                } else if (ps.currentWeapon === WeaponType.WALL) {
                   obstaclesRef.current.push({ id: Math.random().toString(), x: p.x, y: p.y, width: 30, height: 10, type: 'WALL' });
                   spawnFloatingText(p.x, p.y, "BUILT", "#fff");
                } else {
                   fireBullet(0);
                   soundSystem.playShoot(ps.currentWeapon === WeaponType.FLAMETHROWER ? 'flame' : 'pistol');
                }

             } else {
                if (ps.reloadTimer === 0 && ammo.reserve > 0) {
                   reloadWeapon(idx);
                } else if (frameRef.current % 30 === 0) {
                   soundSystem.playEmpty();
                   spawnFloatingText(p.x, p.y, "RELOAD!", "#ff0000");
                }
             }
         }
         
         if (ps.reloadTimer === 1) {
            // Finish Reload
            const w = ps.currentWeapon;
            const need = WEAPON_STATS[w].clipSize - ps.ammo[w].clip;
            const take = w === WeaponType.PISTOL ? need : Math.min(need, ps.ammo[w].reserve);
            ps.ammo[w].clip += take;
            if (w !== WeaponType.PISTOL) ps.ammo[w].reserve -= take;
         }

         // Draw Player
         ctx.save();
         ctx.translate(p.x, p.y);
         ctx.rotate(p.angle);
         
         // Legs
         if (dx !== 0 || dy !== 0) {
             const walk = Math.sin(frameRef.current * 0.3) * 5;
             ctx.fillStyle = '#333';
             ctx.fillRect(-8, -8 + walk, 6, 6);
             ctx.fillRect(-8, 2 - walk, 6, 6);
         }

         // Body
         ctx.fillStyle = p.color;
         ctx.beginPath();
         ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
         ctx.fill();
         // Shield overlay
         if (shieldTimerRef.current > 0) {
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 2;
            ctx.stroke();
         }

         // Arms/Weapon
         ctx.fillStyle = '#000';
         ctx.fillRect(0, -4, 18, 8); // Gun
         
         ctx.restore();
      });

      // 5. Enemies
      // Spawn
      if (waveStateRef.current === 'SPAWNING' && enemiesToSpawnRef.current > 0) {
          spawnTimerRef.current--;
          if (spawnTimerRef.current <= 0) {
              const spawnDist = 400;
              const angle = Math.random() * Math.PI * 2;
              const type = level.enemyTypes[Math.floor(Math.random() * level.enemyTypes.length)];
              const stats = ENEMY_STATS[type];
              
              // Boss logic
              const isBoss = gameMode === GameMode.CAMPAIGN && level.isBossLevel && waveRef.current === 5 && enemiesToSpawnRef.current === 1;
              const finalType = isBoss ? EnemyType.BOSS : type;
              const finalStats = ENEMY_STATS[finalType];

              enemiesRef.current.push({
                  id: Math.random().toString(),
                  x: playersRef.current[0].x + Math.cos(angle) * spawnDist,
                  y: playersRef.current[0].y + Math.sin(angle) * spawnDist,
                  radius: finalStats.radius,
                  color: finalStats.color,
                  speed: finalStats.speed * diffMod.speed * (freezeTimerRef.current > 0 ? 0.5 : 1),
                  angle: 0,
                  hp: finalStats.hp * diffMod.hp,
                  maxHp: finalStats.hp * diffMod.hp,
                  type: finalType,
                  score: finalStats.score
              });
              enemiesToSpawnRef.current--;
              spawnTimerRef.current = level.spawnRate / (rapidFireTimerRef.current > 0 ? 2 : 1); // Spawn faster if player is OP
          }
      }

      // Enemy Logic
      enemiesRef.current = enemiesRef.current.filter(e => {
         // Find target
         let target = playersRef.current[0];
         let minDist = 9999;
         playersRef.current.forEach(p => {
            if (!p.dead) {
               const d = Math.hypot(p.x - e.x, p.y - e.y);
               if (d < minDist) { minDist = d; target = p; }
            }
         });

         if (target && !target.dead) {
            const angle = Math.atan2(target.y - e.y, target.x - e.x);
            e.angle = angle;
            
            let spd = e.speed;
            if (freezeTimerRef.current > 0) spd *= 0.5;

            const vx = Math.cos(angle) * spd;
            const vy = Math.sin(angle) * spd;
            
            // Simple collision avoidance
            let pushX = 0, pushY = 0;
            enemiesRef.current.forEach(other => {
               if (other === e) return;
               const dx = e.x - other.x;
               const dy = e.y - other.y;
               const dist = Math.hypot(dx, dy);
               if (dist < e.radius + other.radius) {
                  pushX += dx / dist;
                  pushY += dy / dist;
               }
            });

            e.x += vx + pushX * 0.1;
            e.y += vy + pushY * 0.1;

            // Collision with Player
            if (minDist < e.radius + target.radius) {
               if (shieldTimerRef.current <= 0) {
                  if (frameRef.current % 30 === 0) { // dps throttle
                     const dmg = 10 * diffMod.damage;
                     target.hp -= dmg;
                     statsRef.current.damageTaken += dmg;
                     spawnFloatingText(target.x, target.y, `-${Math.ceil(dmg)}`, '#ef4444');
                     spawnBlood(target.x, target.y, '#ef4444');
                     soundSystem.playPlayerHit();
                     addShake(5);
                     
                     if (target.hp <= 0) {
                        target.dead = true;
                        target.hp = 0;
                        target.respawnTimer = 300; // 5 seconds auto respawn timer
                        // Check all dead
                        if (playersRef.current.every(p => p.dead)) {
                           onGameOver(statsRef.current, 'defeat');
                        }
                     }
                  }
               }
            }
         }

         // Draw Enemy
         ctx.fillStyle = e.color;
         ctx.beginPath();
         ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
         ctx.fill();
         
         // HP Bar for big enemies
         if (e.hp < e.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(e.x - 10, e.y - e.radius - 8, 20, 4);
            ctx.fillStyle = 'green';
            ctx.fillRect(e.x - 10, e.y - e.radius - 8, 20 * (e.hp / e.maxHp), 4);
         }

         return e.hp > 0;
      });

      // 6. Bullets
      bulletsRef.current = bulletsRef.current.filter(b => {
          b.x += b.vx;
          b.y += b.vy;
          b.duration--;
          
          // Obstacle Collision
          let hitWall = false;
          obstaclesRef.current.forEach(obs => {
             if (checkRectCollision(b.x, b.y, b.radius, obs)) {
                hitWall = true;
                if (obs.type === 'CRATE' || obs.type === 'BARREL') {
                   if (obs.hp) obs.hp -= b.damage;
                   if (obs.hp! <= 0) {
                      // Destroy crate
                      spawnExplosion(obs.x + obs.width/2, obs.y + obs.height/2, 40, 20, b.ownerId);
                      if (obs.type === 'BARREL') spawnExplosion(obs.x, obs.y, 100, 100, b.ownerId);
                      spawnItem(obs.x + obs.width/2, obs.y + obs.height/2);
                      // Remove obs from array (tricky inside loop, modify array directly or mark dead)
                      // For simplicity, filter obstacles later or assumes obstaclesRef is stable. 
                      // Actually let's mark for deletion.
                      obs.width = 0; 
                      statsRef.current.score += 50;
                      checkAchievements();
                   }
                }
             }
          });
          obstaclesRef.current = obstaclesRef.current.filter(o => o.width > 0);

          if (hitWall || b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT || b.duration <= 0) return false;

          // Enemy Collision
          let hit = false;
          enemiesRef.current.forEach(e => {
             if (hit) return; // Pierce logic needs improvement for multi-hit, simpler here
             const dist = Math.hypot(e.x - b.x, e.y - b.y);
             if (dist < e.radius + b.radius) {
                e.hp -= b.damage;
                spawnBlood(e.x, e.y, '#10b981'); // Green zombie blood
                soundSystem.playEnemyHit();
                spawnFloatingText(e.x, e.y, Math.ceil(b.damage).toString(), '#fff');
                
                if (b.pierce && b.pierce > 0) {
                   b.pierce--;
                } else {
                   hit = true;
                }

                statsRef.current.shotsHit++;

                if (e.hp <= 0) {
                   statsRef.current.kills++;
                   const pts = Math.ceil(e.score! * diffMod.score * (doublePointsTimerRef.current > 0 ? 2 : 1));
                   statsRef.current.score += pts;
                   scoreRef.current += pts;
                   spawnFloatingText(e.x, e.y, `+${pts}`, '#eab308', 20);
                   
                   // Combo
                   comboRef.current.count++;
                   comboRef.current.timer = 120; // 2 seconds
                   soundSystem.playCombo(comboRef.current.count);
                   checkComboUnlocks();
                   
                   // Chance for item
                   spawnItem(e.x, e.y);
                }
             }
          });
          
          if (hit) return false;

          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();

          return true;
      });

      // 7. Particles & Text
      particlesRef.current = particlesRef.current.filter(p => {
         p.x += p.vx;
         p.y += p.vy;
         p.life--;
         p.vx *= 0.9;
         p.vy *= 0.9;
         
         ctx.fillStyle = p.color;
         ctx.globalAlpha = p.life / 30;
         ctx.beginPath();
         ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         ctx.fill();
         ctx.globalAlpha = 1;
         return p.life > 0;
      });

      floatingTextsRef.current = floatingTextsRef.current.filter(t => {
         t.y += t.vy;
         t.life--;
         
         ctx.fillStyle = t.color;
         ctx.font = `bold ${t.size}px monospace`;
         ctx.strokeStyle = 'black';
         ctx.lineWidth = 2;
         ctx.strokeText(t.text, t.x, t.y);
         ctx.fillText(t.text, t.x, t.y);
         return t.life > 0;
      });

      ctx.restore();
      
      // Helper to check achievements mid-game
      const checkAchievements = () => {
         // handled in onGameOver for efficiency usually, but simple checks can be here
      };

      // UI State Sync (throttle)
      if (frameRef.current % 5 === 0) {
          const activePups = [];
          if (rapidFireTimerRef.current > 0) activePups.push('RAPID FIRE');
          if (doublePointsTimerRef.current > 0) activePups.push('2X POINTS');
          if (shieldTimerRef.current > 0) activePups.push('SHIELD');
          if (freezeTimerRef.current > 0) activePups.push('FREEZE');

          setUiState({
             hp: playersRef.current.map(p => p.hp),
             score: statsRef.current.score,
             wave: waveRef.current,
             waveState: waveStateRef.current,
             intermissionTime: Math.ceil(intermissionTimerRef.current / 60),
             weapon: playerStatesRef.current.map(ps => ps.currentWeapon),
             clip: playerStatesRef.current.map(ps => ps.ammo[ps.currentWeapon]?.clip || 0),
             reserve: playerStatesRef.current.map(ps => ps.ammo[ps.currentWeapon]?.reserve || 0),
             isReloading: playerStatesRef.current.map(ps => ps.reloadTimer > 0),
             combo: comboRef.current.count,
             timeAttackTime: Math.ceil(timeAttackTimerRef.current / 60),
             activePowerups: activePups,
             respawnTimers: playersRef.current.map(p => p.respawnTimer || 0)
          });
      }
      
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
  }, [level, settings, upgrades, gameMode, onGameOver, isPaused]); 

  // Calculate UI health bar width
  const getHpPercent = (current: number, max: number) => Math.max(0, (current / max) * 100);

  return (
    <div className="relative w-full h-full flex justify-center items-center bg-black">
       <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="bg-zinc-900 shadow-2xl cursor-crosshair" />
       
       {/* HUD OVERLAY */}
       <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-4 flex flex-col justify-between" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
          
          {/* TOP BAR */}
          <div className="flex justify-between items-start">
             {/* P1 STATUS */}
             <div className="bg-black/50 p-2 border border-blue-500/50 rounded w-64 backdrop-blur-sm">
                <div className="flex justify-between mb-1">
                   <span className="text-blue-400 font-bold">P1</span>
                   <span className="text-white">
                     {uiState.hp[0] > 0 
                       ? `${Math.ceil(uiState.hp[0])} HP` 
                       : (uiState.respawnTimers[0] > 0 ? `REVIVE IN ${Math.ceil(uiState.respawnTimers[0]/60)}` : 'KIA')}
                   </span>
                </div>
                <div className="h-3 bg-zinc-800 w-full rounded overflow-hidden mb-2">
                   <div className="h-full bg-green-500 transition-all duration-200" style={{ width: `${getHpPercent(uiState.hp[0], maxHp)}%` }}/>
                </div>
                <div className="flex items-center gap-2 text-yellow-500">
                   <Crosshair size={16} />
                   <span className="text-lg font-bold">{uiState.weapon[0]}</span>
                   <span className="ml-auto text-white">
                      {uiState.isReloading[0] ? 'RLD' : `${uiState.clip[0]} / ${uiState.reserve[0]}`}
                   </span>
                </div>
             </div>

             {/* GAME INFO */}
             <div className="text-center">
                <div className="text-4xl font-bold text-white drop-shadow-md">{uiState.score.toLocaleString()}</div>
                {gameMode === GameMode.TIME_ATTACK ? (
                   <div className="text-red-500 text-2xl font-mono flex items-center justify-center gap-2">
                      <Clock /> {Math.floor(uiState.timeAttackTime / 60)}:{(uiState.timeAttackTime % 60).toString().padStart(2, '0')}
                   </div>
                ) : (
                   <div className="text-zinc-400 text-xl">
                      {uiState.waveState === 'INTERMISSION' ? <span className="text-green-400 animate-pulse">NEXT WAVE IN {uiState.intermissionTime}</span> : `WAVE ${uiState.wave}`}
                   </div>
                )}
                {uiState.combo > 1 && (
                   <div className="text-yellow-500 text-3xl font-black animate-bounce mt-2">
                      {uiState.combo}x COMBO!
                   </div>
                )}
             </div>

             {/* P2 STATUS (If Coop) */}
             {isMultiplayer ? (
                <div className="bg-black/50 p-2 border border-orange-500/50 rounded w-64 backdrop-blur-sm">
                   <div className="flex justify-between mb-1">
                      <span className="text-orange-400 font-bold">P2</span>
                      <span className="text-white">
                        {uiState.hp[1] > 0 
                          ? `${Math.ceil(uiState.hp[1])} HP` 
                          : (uiState.respawnTimers[1] > 0 ? `REVIVE IN ${Math.ceil(uiState.respawnTimers[1]/60)}` : 'KIA')}
                      </span>
                   </div>
                   <div className="h-3 bg-zinc-800 w-full rounded overflow-hidden mb-2">
                      <div className="h-full bg-green-500 transition-all duration-200" style={{ width: `${getHpPercent(uiState.hp[1], maxHp)}%` }}/>
                   </div>
                   <div className="flex items-center gap-2 text-yellow-500">
                      <Crosshair size={16} />
                      <span className="text-lg font-bold">{uiState.weapon[1]}</span>
                      <span className="ml-auto text-white">
                         {uiState.isReloading[1] ? 'RLD' : `${uiState.clip[1]} / ${uiState.reserve[1]}`}
                      </span>
                   </div>
                </div>
             ) : (
                <div className="w-64" /> 
             )}
          </div>

          {/* BOTTOM BAR */}
          <div className="flex justify-start items-end gap-2">
             {uiState.activePowerups.map(p => (
                <div key={p} className="bg-blue-900/80 text-blue-200 px-3 py-1 rounded border border-blue-400 animate-pulse font-bold">
                   {p}
                </div>
             ))}
          </div>
       </div>
       
       {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
             <div className="text-center">
                <h2 className="text-6xl font-bold text-white mb-4">PAUSED</h2>
                <button onClick={() => setIsPaused(false)} className="bg-green-600 text-white px-8 py-3 rounded font-bold hover:bg-green-500 flex items-center gap-2 mx-auto mb-2"><Play /> RESUME</button>
                <button onClick={onRestart} className="bg-yellow-600 text-white px-8 py-3 rounded font-bold hover:bg-yellow-500 flex items-center gap-2 mx-auto mb-2"><RotateCcw /> RESTART</button>
                <button onClick={onExit} className="bg-red-600 text-white px-8 py-3 rounded font-bold hover:bg-red-500 flex items-center gap-2 mx-auto"><Home /> QUIT TO MENU</button>
             </div>
          </div>
       )}
    </div>
  );
};

export default GameEngine;
