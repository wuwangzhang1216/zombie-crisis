
import React, { useRef, useEffect, useState } from 'react';
import { LevelConfig, Entity, Bullet, Particle, WeaponType, Item, ItemType, GameSettings, EnemyType, FloatingText, GameStats, PlayerUpgrades, GameMode, Obstacle } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP, WEAPON_STATS, ENEMY_STATS, ITEM_STATS, DIFFICULTY_MODIFIERS, BOSS_STATS, UPGRADE_CONFIG, TIME_ATTACK_LIMIT } from '../constants';
import { soundSystem } from '../services/SoundSystem';
import { Zap, Heart, Radiation, Skull, Shield, Crosshair, Clock, Snowflake } from 'lucide-react';

interface GameEngineProps {
  level: LevelConfig;
  settings: GameSettings;
  upgrades: PlayerUpgrades;
  gameMode: GameMode;
  onGameOver: (stats: GameStats, reason: 'victory' | 'defeat') => void;
}

interface AmmoState {
  [key: string]: { clip: number; reserve: number };
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

const GameEngine: React.FC<GameEngineProps> = ({ level, settings, upgrades, gameMode, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Determine unlocked weapons based on level ID or game mode
  const unlockedWeapons = [WeaponType.PISTOL];
  const isEndlessOrTime = gameMode === GameMode.ENDLESS || gameMode === GameMode.TIME_ATTACK;
  
  if (level.id >= 2 || isEndlessOrTime) unlockedWeapons.push(WeaponType.SHOTGUN);
  if (level.id >= 3 || isEndlessOrTime) unlockedWeapons.push(WeaponType.ASSAULT_RIFLE);
  if (level.id >= 4 || isEndlessOrTime) unlockedWeapons.push(WeaponType.SNIPER);
  if (level.id >= 5 || isEndlessOrTime) unlockedWeapons.push(WeaponType.FLAMETHROWER);

  const diffMod = DIFFICULTY_MODIFIERS[settings.difficulty];

  // Apply Upgrades
  const maxHp = PLAYER_MAX_HP + (upgrades.health * UPGRADE_CONFIG.health.valuePerLevel);
  const playerSpeed = PLAYER_SPEED + (upgrades.speed * UPGRADE_CONFIG.speed.valuePerLevel);
  const globalDamageMult = 1 + (upgrades.damage * UPGRADE_CONFIG.damage.valuePerLevel);

  const playerRef = useRef<Entity>({
    id: 'player',
    x: 100, // Start near left
    y: CANVAS_HEIGHT / 2,
    radius: PLAYER_RADIUS,
    color: '#60a5fa',
    speed: playerSpeed,
    angle: 0,
    hp: maxHp,
    maxHp: maxHp
  });
  
  const obstaclesRef = useRef<Obstacle[]>(JSON.parse(JSON.stringify(level.obstacles || [])));
  const enemiesRef = useRef<Entity[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<Bullet[]>([]); // New for spitters
  const particlesRef = useRef<Particle[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  
  // Stats Tracking
  const statsRef = useRef<GameStats>({
    kills: 0, shotsFired: 0, shotsHit: 0, damageTaken: 0, maxCombo: 0, score: 0, timeElapsed: 0, weaponsUsed: [WeaponType.PISTOL], waveReached: 1
  });
  const scoreRef = useRef(0);
  const comboRef = useRef({ count: 0, timer: 0 });

  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const lastShotTimeRef = useRef<number>(0);
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
  
  const currentWeaponRef = useRef<WeaponType>(WeaponType.PISTOL);
  
  // Initialize ammo
  const initialAmmo: AmmoState = {};
  Object.values(WeaponType).forEach(w => {
     initialAmmo[w] = { clip: WEAPON_STATS[w].clipSize, reserve: WEAPON_STATS[w].maxReserve };
  });
  const ammoRef = useRef<AmmoState>(initialAmmo);
  
  const reloadTimerRef = useRef<number>(0);

  const [hp, setHp] = useState(maxHp);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [waveStateUI, setWaveStateUI] = useState<'SPAWNING' | 'CLEARING' | 'INTERMISSION'>('INTERMISSION');
  const [intermissionTimeUI, setIntermissionTimeUI] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [timeAttackTime, setTimeAttackTime] = useState(TIME_ATTACK_LIMIT);
  
  // HUD
  const [weapon, setWeapon] = useState<WeaponType>(WeaponType.PISTOL);
  const [clip, setClip] = useState(0);
  const [reserve, setReserve] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [combo, setCombo] = useState(0);
  const [activePowerups, setActivePowerups] = useState<string[]>([]);

  const getWaveEnemyCount = (waveIdx: number) => {
    if (gameMode === GameMode.ENDLESS) {
       return Math.ceil(10 + waveIdx * 4);
    }
    return Math.ceil(level.baseEnemyCount * 0.5) + (waveIdx * 4);
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

  const reloadWeapon = () => {
    const w = currentWeaponRef.current;
    const stats = WEAPON_STATS[w];
    const currentAmmo = ammoRef.current[w];
    
    // Apply reload speed upgrade from weapon levels? (Not implemented yet, using base stats)
    
    if (currentAmmo.clip < stats.clipSize && (currentAmmo.reserve > 0 || w === WeaponType.PISTOL)) {
      if (reloadTimerRef.current === 0) {
        reloadTimerRef.current = stats.reloadTime;
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
      
      if (e.code === 'Escape') {
        setIsPaused(prev => !prev);
      }

      if (!isPaused) {
        const switchWeapon = (w: WeaponType) => {
           if (unlockedWeapons.includes(w)) {
             currentWeaponRef.current = w;
             reloadTimerRef.current = 0;
             if (!statsRef.current.weaponsUsed.includes(w)) {
               statsRef.current.weaponsUsed.push(w);
             }
           }
        };

        if (e.key === '1') switchWeapon(WeaponType.PISTOL);
        if (e.key === '2') switchWeapon(WeaponType.SHOTGUN);
        if (e.key === '3') switchWeapon(WeaponType.ASSAULT_RIFLE);
        if (e.key === '4') switchWeapon(WeaponType.SNIPER);
        if (e.key === '5') switchWeapon(WeaponType.FLAMETHROWER);
        
        if (settings.keys.reload.includes(e.code)) {
          reloadWeapon();
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

      // Combo Decay
      if (comboRef.current.count > 0) {
        comboRef.current.timer--;
        if (comboRef.current.timer <= 0) {
          comboRef.current.count = 0;
        }
      }

      // Wave Logic
      if (waveStateRef.current === 'INTERMISSION') {
         intermissionTimerRef.current--;
         setIntermissionTimeUI(Math.ceil(intermissionTimerRef.current / 60));
         if (intermissionTimerRef.current <= 0) {
            waveStateRef.current = 'SPAWNING';
            if (gameMode === GameMode.CAMPAIGN && level.id === 6 && waveRef.current === 5) {
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
            if (gameMode === GameMode.ENDLESS || waveRef.current < TOTAL_WAVES) {
               waveRef.current++;
               statsRef.current.waveReached = waveRef.current;
               waveStateRef.current = 'INTERMISSION';
               intermissionTimerRef.current = 180;
            } else {
               onGameOver(statsRef.current, 'victory');
               return;
            }
         }
      }

      // Clear & Background
      ctx.save();
      ctx.fillStyle = level.background;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Obstacles (Behind entities)
      obstaclesRef.current.forEach(obs => {
        ctx.fillStyle = obs.type === 'WALL' ? '#374151' : '#78350f'; // Gray vs Brown
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        
        // Obstacle detail
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        
        if (obs.type === 'CRATE') {
           // Cross pattern
           ctx.beginPath();
           ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
           ctx.moveTo(obs.x + obs.width, obs.y); ctx.lineTo(obs.x, obs.y + obs.height);
           ctx.stroke();
        }
      });

      // Shake
      if (shakeRef.current > 0) {
        const dx = (Math.random() - 0.5) * shakeRef.current;
        const dy = (Math.random() - 0.5) * shakeRef.current;
        ctx.translate(dx, dy);
        shakeRef.current *= 0.9;
        if (shakeRef.current < 0.5) shakeRef.current = 0;
      }

      // Player Movement
      let dx = 0;
      let dy = 0;
      const k = keysRef.current;
      if (settings.keys.up.some(key => k.has(key))) dy -= 1;
      if (settings.keys.down.some(key => k.has(key))) dy += 1;
      if (settings.keys.left.some(key => k.has(key))) dx -= 1;
      if (settings.keys.right.some(key => k.has(key))) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
        let speed = playerRef.current.speed;
        if (rapidFireTimerRef.current > 0) speed *= 1.2;
        
        const nextX = playerRef.current.x + dx * speed;
        const nextY = playerRef.current.y + dy * speed;

        // Check collision with obstacles
        let collidedX = false;
        let collidedY = false;
        
        for (const obs of obstaclesRef.current) {
           if (checkRectCollision(nextX, playerRef.current.y, playerRef.current.radius, obs)) collidedX = true;
           if (checkRectCollision(playerRef.current.x, nextY, playerRef.current.radius, obs)) collidedY = true;
        }

        if (!collidedX) playerRef.current.x = nextX;
        if (!collidedY) playerRef.current.y = nextY;

        // Bounds
        playerRef.current.x = Math.max(playerRef.current.radius, Math.min(CANVAS_WIDTH - playerRef.current.radius, playerRef.current.x));
        playerRef.current.y = Math.max(playerRef.current.radius, Math.min(CANVAS_HEIGHT - playerRef.current.radius, playerRef.current.y));
      }
      playerRef.current.angle = Math.atan2(mouseRef.current.y - playerRef.current.y, mouseRef.current.x - playerRef.current.x);

      // Powerups
      if (rapidFireTimerRef.current > 0) rapidFireTimerRef.current--;
      if (doublePointsTimerRef.current > 0) doublePointsTimerRef.current--;
      if (shieldTimerRef.current > 0) shieldTimerRef.current--;
      if (freezeTimerRef.current > 0) freezeTimerRef.current--;

      // Reload Logic
      if (reloadTimerRef.current > 0) {
        reloadTimerRef.current--;
        if (reloadTimerRef.current <= 0) {
          const w = currentWeaponRef.current;
          const stats = WEAPON_STATS[w];
          const current = ammoRef.current[w];
          const needed = stats.clipSize - current.clip;
          if (w === WeaponType.PISTOL) {
            current.clip = stats.clipSize;
          } else {
            const amount = Math.min(needed, current.reserve);
            current.clip += amount;
            current.reserve -= amount;
          }
        }
      }

      // Shooting
      let cooldown = WEAPON_STATS[currentWeaponRef.current].cooldown;
      if (rapidFireTimerRef.current > 0) cooldown = Math.ceil(cooldown / 2);

      if (isMouseDownRef.current && frameRef.current - lastShotTimeRef.current > cooldown) {
        const weapon = WEAPON_STATS[currentWeaponRef.current];
        const currentAmmo = ammoRef.current[currentWeaponRef.current];

        if (reloadTimerRef.current > 0) {
           // Reloading...
        } else if (currentAmmo.clip <= 0) {
          if (frameRef.current - lastShotTimeRef.current > 20) {
             soundSystem.playEmpty();
             lastShotTimeRef.current = frameRef.current;
             reloadWeapon();
          }
        } else {
          lastShotTimeRef.current = frameRef.current;
          currentAmmo.clip--;
          statsRef.current.shotsFired++;

          if (currentWeaponRef.current === WeaponType.PISTOL) soundSystem.playShoot('pistol');
          else if (currentWeaponRef.current === WeaponType.SHOTGUN) soundSystem.playShoot('shotgun');
          else soundSystem.playShoot('flame'); // Use flame sound for generic rapid

          if (currentWeaponRef.current === WeaponType.SHOTGUN || currentWeaponRef.current === WeaponType.SNIPER) addShake(5);
          else addShake(2);

          // Weapon Damage Upgrade Calculation
          const weaponLevel = upgrades.weaponLevels?.[currentWeaponRef.current] || 0;
          const weaponDmgMult = 1 + (weaponLevel * 0.2); // 20% damage increase per level
          const totalDamage = weapon.damage * globalDamageMult * weaponDmgMult;

          const createBullet = (angleOffset: number) => {
            const angle = playerRef.current.angle + angleOffset;
            bulletsRef.current.push({
              id: Math.random().toString(),
              x: playerRef.current.x + Math.cos(angle) * 20,
              y: playerRef.current.y + Math.sin(angle) * 20,
              vx: Math.cos(angle) * weapon.speed,
              vy: Math.sin(angle) * weapon.speed,
              damage: totalDamage,
              color: rapidFireTimerRef.current > 0 ? '#60a5fa' : weapon.color,
              radius: currentWeaponRef.current === WeaponType.FLAMETHROWER ? 4 : 3,
              duration: weapon.duration || 1000,
              pierce: weapon.pierce || 0
            });
          };

          if (currentWeaponRef.current === WeaponType.SHOTGUN) {
            [0, 0.15, -0.15, 0.3, -0.3].forEach(createBullet);
          } else if (currentWeaponRef.current === WeaponType.FLAMETHROWER) {
            createBullet((Math.random() - 0.5) * 0.2);
          } else if (currentWeaponRef.current === WeaponType.ASSAULT_RIFLE) {
             createBullet((Math.random() - 0.5) * 0.05);
          } else {
            createBullet(0);
          }
        }
      }

      // Spawning
      if (waveStateRef.current === 'SPAWNING' && enemiesToSpawnRef.current > 0) {
        spawnTimerRef.current++;
        let currentSpawnRate = Math.max(30, level.spawnRate - (waveRef.current * 5));
        if (gameMode === GameMode.TIME_ATTACK) currentSpawnRate = 40; 

        if (spawnTimerRef.current > currentSpawnRate) {
          spawnTimerRef.current = 0;
          if (gameMode !== GameMode.TIME_ATTACK) enemiesToSpawnRef.current--;
          
          const isBoss = gameMode === GameMode.CAMPAIGN && level.id === 6 && waveRef.current === 5;
          let type = EnemyType.NORMAL;
          
          if (isBoss) {
             type = EnemyType.BOSS;
          } else {
             const types = level.enemyTypes;
             // Weighted Random Spawn
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
            maxHp: stats.hp * hpMultiplier,
            attackTimer: 0
          });
        }
      }

      // Enemies Update
      for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
        const enemy = enemiesRef.current[i];
        
        if (freezeTimerRef.current > 0 && enemy.type !== EnemyType.BOSS) {
            // Frozen
        } else {
           let moveAngle = Math.atan2(playerRef.current.y - enemy.y, playerRef.current.x - enemy.x);
           let speed = enemy.speed;

           // SPITTER Logic: Stop if close enough to shoot
           if (enemy.type === EnemyType.SPITTER) {
              const distToPlayer = Math.hypot(playerRef.current.x - enemy.x, playerRef.current.y - enemy.y);
              if (distToPlayer < 300) {
                 speed = 0; // Stop to shoot
                 enemy.attackTimer = (enemy.attackTimer || 0) + 1;
                 if (enemy.attackTimer > 120) { // Shoot every 2 seconds
                    enemy.attackTimer = 0;
                    soundSystem.playShoot('pistol'); // Use pistol sound as placeholder for spit
                    enemyBulletsRef.current.push({
                       id: Math.random().toString(),
                       x: enemy.x, y: enemy.y,
                       vx: Math.cos(moveAngle) * 4,
                       vy: Math.sin(moveAngle) * 4,
                       damage: 15 * diffMod.damage,
                       color: '#8b5cf6',
                       radius: 6,
                       duration: 200,
                       isEnemy: true
                    });
                 }
              }
           }

           if (speed > 0) {
              const nextEX = enemy.x + Math.cos(moveAngle) * speed;
              const nextEY = enemy.y + Math.sin(moveAngle) * speed;
              
              // Simple slide against obstacles
              let collided = false;
              for (const obs of obstaclesRef.current) {
                 if (checkRectCollision(nextEX, nextEY, enemy.radius, obs)) {
                    collided = true;
                    // Try X only
                    if (!checkRectCollision(nextEX, enemy.y, enemy.radius, obs)) {
                       enemy.x = nextEX;
                    } 
                    // Try Y only
                    else if (!checkRectCollision(enemy.x, nextEY, enemy.radius, obs)) {
                       enemy.y = nextEY;
                    }
                    break;
                 }
              }
              
              if (!collided) {
                 enemy.x = nextEX;
                 enemy.y = nextEY;
              }
           }
           enemy.angle = moveAngle;
        }

        // Boss Minion Spawn
        if (enemy.type === EnemyType.BOSS) {
           if (frameRef.current % 300 === 0) { 
              spawnFloatingText(enemy.x, enemy.y, "ARISE!", "#ff0000", 20);
              for(let j=0; j<3; j++) {
                 enemiesRef.current.push({
                    id: Math.random().toString(),
                    x: enemy.x + (Math.random() - 0.5) * 50,
                    y: enemy.y + (Math.random() - 0.5) * 50,
                    type: EnemyType.NORMAL,
                    radius: ENEMY_STATS[EnemyType.NORMAL].radius,
                    color: ENEMY_STATS[EnemyType.NORMAL].color,
                    speed: ENEMY_STATS[EnemyType.NORMAL].speed * 1.5,
                    angle: 0,
                    hp: 30, maxHp: 30
                 });
              }
           }
        }

        // Player Collision
        const dist = Math.hypot(playerRef.current.x - enemy.x, playerRef.current.y - enemy.y);
        if (dist < playerRef.current.radius + enemy.radius) {
           // Exploder Logic: Boom on contact
           if (enemy.type === EnemyType.EXPLODER) {
              enemy.hp = 0; // Will trigger death logic below
           } else {
              if (frameRef.current % 30 === 0) {
                 if (shieldTimerRef.current <= 0) {
                    let dmg = 10 * diffMod.damage;
                    if (enemy.type === EnemyType.BOSS) dmg = 30 * diffMod.damage;
                    playerRef.current.hp -= dmg; 
                    statsRef.current.damageTaken += dmg;
                    addShake(10);
                    soundSystem.playPlayerHit();
                    spawnBlood(playerRef.current.x, playerRef.current.y, '#ef4444');
                    spawnFloatingText(playerRef.current.x, playerRef.current.y, `-${Math.ceil(dmg)}`, 'red');
                    
                    if (playerRef.current.hp <= 0) {
                      onGameOver(statsRef.current, 'defeat');
                    }
                 } else {
                    soundSystem.playPickup('powerup'); 
                    spawnFloatingText(playerRef.current.x, playerRef.current.y, "BLOCKED", "#8b5cf6");
                 }
              }
           }
        }

        // Death Check (Moved here to handle Exploder logic consistently)
        if (enemy.hp <= 0) {
           let s = ENEMY_STATS[enemy.type!].score * diffMod.score;
           if (doublePointsTimerRef.current > 0) s *= 2;
           
           scoreRef.current += s;
           statsRef.current.score = scoreRef.current;
           statsRef.current.kills++;
           
           comboRef.current.count++;
           comboRef.current.timer = 120; 
           if (comboRef.current.count > statsRef.current.maxCombo) statsRef.current.maxCombo = comboRef.current.count;
           if (comboRef.current.count > 1) {
              spawnFloatingText(enemy.x, enemy.y - 20, `${comboRef.current.count}x COMBO!`, '#facc15', 16 + Math.min(comboRef.current.count, 20));
              if (comboRef.current.count % 5 === 0) soundSystem.playCombo(comboRef.current.count);
           }

           // Exploder Death Effect
           if (enemy.type === EnemyType.EXPLODER) {
               addShake(15);
               soundSystem.playShoot('shotgun'); // Explosion sound
               spawnFloatingText(enemy.x, enemy.y, "BOOM!", "#10b981", 24);
               // Damage player if close
               if (Math.hypot(playerRef.current.x - enemy.x, playerRef.current.y - enemy.y) < 80 && shieldTimerRef.current <= 0) {
                   playerRef.current.hp -= 25 * diffMod.damage;
                   statsRef.current.damageTaken += 25;
                   spawnFloatingText(playerRef.current.x, playerRef.current.y, "-25", "red");
               }
               // Damage other enemies
               enemiesRef.current.forEach(other => {
                   if (other !== enemy && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 100) {
                       other.hp -= 100;
                   }
               });
           }

           spawnItem(enemy.x, enemy.y); 
           enemiesRef.current.splice(i, 1);
        }
      }

      // Enemy Bullets (Spitters)
      for (let i = enemyBulletsRef.current.length - 1; i >= 0; i--) {
         const b = enemyBulletsRef.current[i];
         b.x += b.vx; b.y += b.vy; b.duration--;
         
         // Check obstacle collision
         let hitObs = false;
         for (const obs of obstaclesRef.current) {
            if (checkRectCollision(b.x, b.y, b.radius, obs)) {
               hitObs = true;
               break;
            }
         }

         if (b.duration <= 0 || hitObs) {
            enemyBulletsRef.current.splice(i, 1);
            continue;
         }

         const dist = Math.hypot(b.x - playerRef.current.x, b.y - playerRef.current.y);
         if (dist < playerRef.current.radius + b.radius) {
            if (shieldTimerRef.current <= 0) {
               playerRef.current.hp -= b.damage;
               statsRef.current.damageTaken += b.damage;
               addShake(5);
               soundSystem.playPlayerHit();
               spawnFloatingText(playerRef.current.x, playerRef.current.y, `-${Math.ceil(b.damage)}`, "red");
            } else {
               spawnFloatingText(playerRef.current.x, playerRef.current.y, "BLOCKED", "#8b5cf6");
            }
            enemyBulletsRef.current.splice(i, 1);
         }
      }

      // Player Bullets
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const b = bulletsRef.current[i];
        b.x += b.vx; b.y += b.vy; b.duration--;

        let destroyed = false;

        if (b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT || (currentWeaponRef.current === WeaponType.FLAMETHROWER && b.duration <= 0)) {
          destroyed = true;
        }

        // Obstacle Collision
        if (!destroyed) {
           for (const obs of obstaclesRef.current) {
              if (checkRectCollision(b.x, b.y, b.radius, obs)) {
                 if (obs.type === 'CRATE' && obs.hp !== undefined) {
                    obs.hp -= b.damage;
                    spawnFloatingText(obs.x + obs.width/2, obs.y, Math.ceil(b.damage).toString(), 'orange', 10);
                    if (obs.hp <= 0) {
                       // Break Crate
                       soundSystem.playShoot('shotgun'); // break sound
                       // Remove crate
                       const idx = obstaclesRef.current.indexOf(obs);
                       if (idx > -1) obstaclesRef.current.splice(idx, 1);
                       spawnItem(obs.x + obs.width/2, obs.y + obs.height/2);
                       spawnBlood(obs.x + obs.width/2, obs.y + obs.height/2, '#854d0e', 8); // Wood particles
                    }
                 }
                 destroyed = true;
                 break;
              }
           }
        }

        if (destroyed) {
           bulletsRef.current.splice(i, 1);
           continue;
        }

        let hitCount = 0;
        const maxHits = 1 + (b.pierce || 0);

        for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
          const enemy = enemiesRef.current[j];
          const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          
          if (dist < enemy.radius + b.radius) {
            enemy.hp -= b.damage;
            spawnBlood(enemy.x, enemy.y, '#166534');
            statsRef.current.shotsHit++;
            soundSystem.playEnemyHit();
            spawnFloatingText(enemy.x, enemy.y, Math.ceil(b.damage).toString(), 'white', 12);

            hitCount++;
            
            // Handling death is done in Enemy Update loop to avoid splicing issues here if piercing
            if (hitCount >= maxHits) {
               bulletsRef.current.splice(i, 1);
               break;
            }
          }
        }
      }

      // Items
      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
        const item = itemsRef.current[i];
        item.life--; item.angle += 0.05;
        const dist = Math.hypot(playerRef.current.x - item.x, playerRef.current.y - item.y);
        if (dist < playerRef.current.radius + 15) { 
           const stats = ITEM_STATS[item.type];
           spawnFloatingText(playerRef.current.x, playerRef.current.y - 30, stats.symbol + " PICKUP", stats.color, 20);

           if (item.type === ItemType.MEDKIT) {
             playerRef.current.hp = Math.min(playerRef.current.maxHp, playerRef.current.hp + stats.heal!);
             soundSystem.playPickup('health');
           } else if (item.type === ItemType.NUKE) {
             enemiesRef.current.forEach(e => e.hp = 0); // Set to 0 to trigger death loop
             addShake(20);
             soundSystem.playPickup('nuke');
           } else if (item.type === ItemType.RAPID_FIRE) {
             rapidFireTimerRef.current = stats.duration!;
             soundSystem.playPickup('powerup');
           } else if (item.type === ItemType.AMMO) {
             Object.keys(ammoRef.current).forEach(key => {
                const w = key as WeaponType;
                ammoRef.current[w].reserve = Math.min(WEAPON_STATS[w].maxReserve, ammoRef.current[w].reserve + WEAPON_STATS[w].clipSize * 2);
             });
             soundSystem.playPickup('ammo');
           } else if (item.type === ItemType.DOUBLE_POINTS) {
             doublePointsTimerRef.current = stats.duration!;
             soundSystem.playPickup('powerup');
           } else if (item.type === ItemType.SHIELD) {
             shieldTimerRef.current = stats.duration!;
             soundSystem.playPickup('powerup');
           } else if (item.type === ItemType.FREEZE) {
             freezeTimerRef.current = stats.duration!;
             soundSystem.playFreeze();
           }
           
           scoreRef.current += stats.score || 0;
           itemsRef.current.splice(i, 1);
           continue;
        }
        if (item.life <= 0) itemsRef.current.splice(i, 1);
      }

      // Floating Text Physics
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
         const ft = floatingTextsRef.current[i];
         ft.y += ft.vy;
         ft.life--;
         if (ft.life <= 0) floatingTextsRef.current.splice(i, 1);
      }

      // --- RENDERING (Items, Particles, Enemies, Player, Bullets, FloatingText, Minimap) ---

      // Items
      itemsRef.current.forEach(item => {
        const stats = ITEM_STATS[item.type];
        const floatY = Math.sin(frameRef.current * 0.1) * 3;
        ctx.save();
        ctx.translate(item.x, item.y + floatY);
        ctx.shadowBlur = 10; ctx.shadowColor = stats.color;
        ctx.fillStyle = stats.color;
        ctx.fillRect(-10, -10, 20, 20);
        ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
        ctx.strokeRect(-10, -10, 20, 20);
        ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(stats.symbol, 0, 1);
        ctx.restore();
      });

      // Particles
      particlesRef.current.forEach(p => {
        ctx.fillStyle = p.color; ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });

      // Enemies
      enemiesRef.current.forEach(enemy => {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(enemy.angle);
        
        if (enemy.type === EnemyType.BOSS) {
           ctx.shadowBlur = 15; ctx.shadowColor = 'red';
           ctx.fillStyle = enemy.color;
           ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI*2); ctx.fill();
           ctx.fillStyle = 'black'; ctx.font = '30px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
           ctx.fillText('☠', 0, 0);
        } else if (enemy.type === EnemyType.EXPLODER) {
           // Pulsing effect
           const pulse = Math.sin(frameRef.current * 0.2) * 3;
           ctx.fillStyle = enemy.color;
           ctx.beginPath(); ctx.arc(0, 0, enemy.radius + pulse, 0, Math.PI * 2); ctx.fill();
           ctx.fillStyle = '#fff'; ctx.fillRect(-5, -5, 10, 10); // White core
        } else if (enemy.type === EnemyType.SPITTER) {
           ctx.fillStyle = enemy.color;
           ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.fill();
           // Mouth
           ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(8, 0, 4, 0, Math.PI*2); ctx.fill();
        } else {
           ctx.fillStyle = freezeTimerRef.current > 0 ? '#06b6d4' : enemy.color;
           ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.fill();
           ctx.fillStyle = freezeTimerRef.current > 0 ? '#06b6d4' : enemy.color; 
           ctx.fillRect(0, -enemy.radius, enemy.radius + 5, 8); 
           ctx.fillRect(0, enemy.radius - 8, enemy.radius + 5, 8);
        }
        
        if (enemy.hp < enemy.maxHp) {
           ctx.fillStyle = 'red'; ctx.fillRect(-15, -enemy.radius - 10, 30, 4);
           ctx.fillStyle = 'lime'; ctx.fillRect(-15, -enemy.radius - 10, 30 * (enemy.hp/enemy.maxHp), 4);
        }
        ctx.restore();
      });

      // Player
      ctx.save();
      ctx.translate(playerRef.current.x, playerRef.current.y);
      if (shieldTimerRef.current > 0) {
         ctx.strokeStyle = `rgba(139, 92, 246, ${Math.abs(Math.sin(frameRef.current * 0.1))})`;
         ctx.lineWidth = 3;
         ctx.beginPath(); ctx.arc(0, 0, playerRef.current.radius + 10, 0, Math.PI*2); ctx.stroke();
      }
      if (reloadTimerRef.current > 0) {
        const maxTime = WEAPON_STATS[currentWeaponRef.current].reloadTime;
        const progress = 1 - (reloadTimerRef.current / maxTime);
        ctx.fillStyle = 'black'; ctx.fillRect(-15, -30, 30, 6);
        ctx.fillStyle = 'yellow'; ctx.fillRect(-14, -29, 28 * progress, 4);
      }
      ctx.rotate(playerRef.current.angle);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(-5, 8, 10, 5); ctx.fillRect(-5, -12, 10, 5); // feet
      ctx.fillStyle = rapidFireTimerRef.current > 0 ? '#93c5fd' : playerRef.current.color; 
      ctx.beginPath(); ctx.arc(0, 0, playerRef.current.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(0, -4, 25, 8); // Gun barrel
      if (frameRef.current - lastShotTimeRef.current < 5) {
         ctx.fillStyle = '#fef08a';
         ctx.beginPath(); ctx.arc(28, 0, 8 + Math.random()*5, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();

      // Bullets
      bulletsRef.current.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
      });

      enemyBulletsRef.current.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
      });

      // Text
      floatingTextsRef.current.forEach(ft => {
         ctx.save();
         ctx.globalAlpha = Math.max(0, ft.life / 30);
         ctx.fillStyle = ft.color;
         ctx.font = `bold ${ft.size}px Arial`;
         ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
         ctx.textAlign = 'center';
         ctx.strokeText(ft.text, ft.x, ft.y);
         ctx.fillText(ft.text, ft.x, ft.y);
         ctx.restore();
      });

      // Minimap
      const mapSize = 120;
      const mapPadding = 20;
      const mapX = CANVAS_WIDTH - mapSize - mapPadding;
      const mapY = mapPadding;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 20, 0, 0.7)';
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.fillRect(mapX, mapY, mapSize, mapSize);
      ctx.strokeRect(mapX, mapY, mapSize, mapSize);
      const scaleX = mapSize / CANVAS_WIDTH;
      const scaleY = mapSize / CANVAS_HEIGHT;
      
      // Draw walls on map
      ctx.fillStyle = '#4b5563';
      obstaclesRef.current.forEach(obs => {
         ctx.fillRect(mapX + obs.x * scaleX, mapY + obs.y * scaleY, obs.width * scaleX, obs.height * scaleY);
      });

      ctx.fillStyle = '#60a5fa';
      ctx.beginPath(); ctx.arc(mapX + playerRef.current.x * scaleX, mapY + playerRef.current.y * scaleY, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ef4444';
      enemiesRef.current.forEach(e => {
         ctx.fillRect(mapX + e.x * scaleX - 1.5, mapY + e.y * scaleY - 1.5, 3, 3);
      });
      ctx.restore();

      ctx.restore();

      // Sync State
      setHp(playerRef.current.hp);
      setScore(scoreRef.current);
      setWave(waveRef.current);
      setWaveStateUI(waveStateRef.current);
      setWeapon(currentWeaponRef.current);
      setClip(ammoRef.current[currentWeaponRef.current].clip);
      setReserve(ammoRef.current[currentWeaponRef.current].reserve);
      setIsReloading(reloadTimerRef.current > 0);
      setCombo(comboRef.current.count);
      setTimeAttackTime(Math.ceil(timeAttackTimerRef.current / 60));
      
      const actives = [];
      if (rapidFireTimerRef.current > 0) actives.push('RAPID');
      if (doublePointsTimerRef.current > 0) actives.push('2X SCORE');
      if (shieldTimerRef.current > 0) actives.push('SHIELD');
      if (freezeTimerRef.current > 0) actives.push('FREEZE');
      setActivePowerups(actives);

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

  return (
    <div className="relative">
       <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="block border-4 border-zinc-800 bg-black rounded shadow-2xl cursor-crosshair mx-auto"/>
       
       {gameMode === GameMode.TIME_ATTACK && (
         <div className="absolute top-4 left-4 bg-black/60 border border-blue-500 p-3 rounded flex items-center gap-2 animate-pulse">
           <Clock className="text-blue-400" />
           <span className={`text-2xl font-bold ${timeAttackTime < 30 ? 'text-red-500' : 'text-white'}`}>
              {Math.floor(timeAttackTime / 60)}:{(timeAttackTime % 60).toString().padStart(2, '0')}
           </span>
         </div>
       )}

       {waveStateUI === 'INTERMISSION' && gameMode !== GameMode.TIME_ATTACK && (
         <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
             <div className="bg-black/70 p-6 rounded text-center border-y-4 border-green-600 w-full backdrop-blur-sm">
               <h3 className="text-4xl font-bold text-green-500 mb-2">WAVE {wave} CLEARED</h3>
               {gameMode === GameMode.CAMPAIGN && level.id === 6 && wave === 4 
                 ? <p className="text-red-500 text-2xl animate-pulse font-bold">WARNING: MASSIVE SIGNAL DETECTED</p>
                 : <p className="text-white text-xl animate-pulse">NEXT WAVE IN {intermissionTimeUI}...</p>
               }
             </div>
         </div>
       )}

       {/* HUD */}
       <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[780px] flex justify-between text-white font-bold text-xl pointer-events-none">
          <div className="flex flex-col bg-black/50 p-2 rounded border border-zinc-700 w-48">
             <div className="flex items-center gap-2">
                <Heart className="text-red-500" size={20} />
                <span className={hp < 30 ? 'text-red-500 animate-pulse' : 'text-green-400'}>{Math.ceil(hp)}</span>
             </div>
             <div className="w-full h-3 bg-red-900 mt-1 rounded overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-200" style={{ width: `${Math.max(0, (hp/playerRef.current.maxHp)*100)}%` }}></div>
             </div>
          </div>
          
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex gap-1 bg-black/50 p-1 rounded border border-zinc-700">
              {unlockedWeapons.map((w, idx) => (
                <div key={w} className={`w-8 h-8 flex items-center justify-center text-sm border ${weapon === w ? 'border-green-500 text-green-500 bg-green-900/30' : 'border-zinc-600 text-zinc-600'}`}>
                  {idx + 1}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 bg-black/50 px-4 py-2 rounded border border-zinc-700 min-w-[160px] justify-center">
               <div className="text-right">
                 <div className={`text-2xl leading-none ${clip === 0 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>{isReloading ? 'RLD' : clip}</div>
                 <div className="text-xs text-zinc-400">/ {reserve > 900 ? '∞' : reserve}</div>
               </div>
               <div className="text-sm text-zinc-300 border-l border-zinc-600 pl-3">{weapon.toUpperCase()}</div>
            </div>
             <div className="flex gap-2">
               {activePowerups.map(p => (
                 <div key={p} className="text-blue-400 text-xs flex items-center gap-1 animate-pulse border border-blue-500 bg-blue-900/30 px-2 rounded">
                   {p === 'FREEZE' ? <Snowflake size={10} /> : <Zap size={10} />} {p}
                 </div>
               ))}
             </div>
          </div>

          <div className="flex flex-col items-end bg-black/50 p-2 rounded border border-zinc-700 w-48">
             <span className="text-blue-400">SCORE: {score.toString().padStart(6, '0')}</span>
             <span className="text-yellow-400 text-sm flex items-center gap-1"><Radiation size={14} /> WAVE {wave}{gameMode === GameMode.ENDLESS ? '' : `/${TOTAL_WAVES}`}</span>
             {combo > 1 && <span className="text-yellow-500 text-lg animate-bounce mt-1 font-black">{combo}x COMBO</span>}
          </div>
       </div>

       {isPaused && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
           <div className="bg-zinc-900 border-2 border-zinc-700 p-8 w-80 text-center shadow-2xl">
             <h2 className="text-4xl font-bold text-white mb-4 tracking-widest">PAUSED</h2>
             <p className="text-zinc-500 text-sm mb-8">Press ESC to Resume</p>
           </div>
         </div>
       )}
    </div>
  );
};

export default GameEngine;
