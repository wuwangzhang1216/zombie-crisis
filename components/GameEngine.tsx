
import React, { useRef, useEffect, useState } from 'react';
import { LevelConfig, Entity, Bullet, Particle, WeaponType, Item, ItemType, GameSettings } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP, WEAPON_STATS, ENEMY_STATS, ITEM_STATS, DIFFICULTY_MODIFIERS } from '../constants';
import { soundSystem } from '../services/SoundSystem';
import { Pause, Zap, Heart, Radiation, Skull } from 'lucide-react';

interface GameEngineProps {
  level: LevelConfig;
  settings: GameSettings;
  onGameOver: (score: number, reason: 'victory' | 'defeat') => void;
}

interface AmmoState {
  [key: string]: { clip: number; reserve: number };
}

const TOTAL_WAVES = 5;

const GameEngine: React.FC<GameEngineProps> = ({ level, settings, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const unlockedWeapons = [WeaponType.PISTOL];
  if (level.id >= 2) unlockedWeapons.push(WeaponType.SHOTGUN);
  if (level.id >= 3) unlockedWeapons.push(WeaponType.FLAMETHROWER);

  // Difficulty Multipliers
  const diffMod = DIFFICULTY_MODIFIERS[settings.difficulty];

  // Game State Refs
  const playerRef = useRef<Entity>({
    id: 'player',
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    radius: PLAYER_RADIUS,
    color: '#60a5fa',
    speed: PLAYER_SPEED,
    angle: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP
  });
  
  const enemiesRef = useRef<Entity[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const itemsRef = useRef<Item[]>([]);
  
  // Logic Refs
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const lastShotTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const isMouseDownRef = useRef<boolean>(false);
  const shakeRef = useRef<number>(0);
  const rapidFireTimerRef = useRef<number>(0);
  
  // Wave Logic Refs
  const waveRef = useRef<number>(1);
  const enemiesToSpawnRef = useRef<number>(0);
  const waveStateRef = useRef<'SPAWNING' | 'CLEARING' | 'INTERMISSION'>('INTERMISSION');
  const intermissionTimerRef = useRef<number>(180); // 3 seconds start delay
  
  // Weapon & Ammo Refs
  const currentWeaponRef = useRef<WeaponType>(WeaponType.PISTOL);
  const ammoRef = useRef<AmmoState>({
    [WeaponType.PISTOL]: { clip: WEAPON_STATS[WeaponType.PISTOL].clipSize, reserve: WEAPON_STATS[WeaponType.PISTOL].maxReserve },
    [WeaponType.SHOTGUN]: { clip: WEAPON_STATS[WeaponType.SHOTGUN].clipSize, reserve: WEAPON_STATS[WeaponType.SHOTGUN].maxReserve },
    [WeaponType.FLAMETHROWER]: { clip: WEAPON_STATS[WeaponType.FLAMETHROWER].clipSize, reserve: WEAPON_STATS[WeaponType.FLAMETHROWER].maxReserve }
  });
  const reloadTimerRef = useRef<number>(0);

  // UI State
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [waveStateUI, setWaveStateUI] = useState<'SPAWNING' | 'CLEARING' | 'INTERMISSION'>('INTERMISSION');
  const [intermissionTimeUI, setIntermissionTimeUI] = useState(3);
  
  const [isPaused, setIsPaused] = useState(false);
  const [hasRapidFire, setHasRapidFire] = useState(false);
  
  // HUD specific
  const [weapon, setWeapon] = useState<WeaponType>(WeaponType.PISTOL);
  const [clip, setClip] = useState(0);
  const [reserve, setReserve] = useState(0);
  const [isReloading, setIsReloading] = useState(false);

  // Calculate enemies for current wave
  const getWaveEnemyCount = (waveIdx: number) => {
    return Math.ceil(level.baseEnemyCount * 0.5) + (waveIdx * 3);
  };
  
  // Initial wave setup
  useEffect(() => {
    enemiesToSpawnRef.current = getWaveEnemyCount(1);
    soundSystem.startMusic();
    return () => soundSystem.stopMusic();
  }, []);

  const spawnBlood = (x: number, y: number, color: string, count = 5) => {
    // Scale particle count by settings
    let multiplier = 1;
    if (settings.particles === 'LOW') multiplier = 0.5;
    if (settings.particles === 'HIGH') multiplier = 2;
    const finalCount = Math.ceil(count * multiplier);

    for (let i = 0; i < finalCount; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
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
          x,
          y,
          type,
          life: 600,
          angle: 0
        });
        break;
      }
    }
  };

  const reloadWeapon = () => {
    const w = currentWeaponRef.current;
    const stats = WEAPON_STATS[w];
    const currentAmmo = ammoRef.current[w];
    
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
        if (e.key === '1' && unlockedWeapons.includes(WeaponType.PISTOL)) {
          currentWeaponRef.current = WeaponType.PISTOL;
          reloadTimerRef.current = 0; 
        }
        if (e.key === '2' && unlockedWeapons.includes(WeaponType.SHOTGUN)) {
          currentWeaponRef.current = WeaponType.SHOTGUN;
          reloadTimerRef.current = 0;
        }
        if (e.key === '3' && unlockedWeapons.includes(WeaponType.FLAMETHROWER)) {
          currentWeaponRef.current = WeaponType.FLAMETHROWER;
          reloadTimerRef.current = 0;
        }
        
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

      // --- UPDATE LOGIC ---

      // Wave Management
      if (waveStateRef.current === 'INTERMISSION') {
         intermissionTimerRef.current--;
         setIntermissionTimeUI(Math.ceil(intermissionTimerRef.current / 60));
         if (intermissionTimerRef.current <= 0) {
            waveStateRef.current = 'SPAWNING';
            enemiesToSpawnRef.current = getWaveEnemyCount(waveRef.current);
         }
      } else if (waveStateRef.current === 'SPAWNING') {
         // Check spawn logic below
         if (enemiesToSpawnRef.current <= 0) {
            waveStateRef.current = 'CLEARING';
         }
      } else if (waveStateRef.current === 'CLEARING') {
         if (enemiesRef.current.length === 0) {
            if (waveRef.current < TOTAL_WAVES) {
               waveRef.current++;
               waveStateRef.current = 'INTERMISSION';
               intermissionTimerRef.current = 180; // 3s break
            } else {
               onGameOver(scoreRef.current, 'victory');
               return;
            }
         }
      }

      // Clear Screen
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

      // Player Movement with Configurable Keys
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

        playerRef.current.x += dx * speed;
        playerRef.current.y += dy * speed;

        playerRef.current.x = Math.max(playerRef.current.radius, Math.min(CANVAS_WIDTH - playerRef.current.radius, playerRef.current.x));
        playerRef.current.y = Math.max(playerRef.current.radius, Math.min(CANVAS_HEIGHT - playerRef.current.radius, playerRef.current.y));
      }

      playerRef.current.angle = Math.atan2(
        mouseRef.current.y - playerRef.current.y,
        mouseRef.current.x - playerRef.current.x
      );

      if (rapidFireTimerRef.current > 0) rapidFireTimerRef.current--;

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
          // Cannot shoot
        } else if (currentAmmo.clip <= 0) {
          if (frameRef.current - lastShotTimeRef.current > 20) {
             soundSystem.playEmpty();
             lastShotTimeRef.current = frameRef.current;
             reloadWeapon();
          }
        } else {
          lastShotTimeRef.current = frameRef.current;
          currentAmmo.clip--;

          if (currentWeaponRef.current === WeaponType.PISTOL) soundSystem.playShoot('pistol');
          else if (currentWeaponRef.current === WeaponType.SHOTGUN) soundSystem.playShoot('shotgun');
          else soundSystem.playShoot('flame');

          if (currentWeaponRef.current === WeaponType.SHOTGUN) addShake(5);
          else if (currentWeaponRef.current === WeaponType.FLAMETHROWER) addShake(1);
          else addShake(2);

          const createBullet = (angleOffset: number) => {
            const angle = playerRef.current.angle + angleOffset;
            bulletsRef.current.push({
              id: Math.random().toString(),
              x: playerRef.current.x + Math.cos(angle) * 20,
              y: playerRef.current.y + Math.sin(angle) * 20,
              vx: Math.cos(angle) * weapon.speed,
              vy: Math.sin(angle) * weapon.speed,
              damage: weapon.damage,
              color: rapidFireTimerRef.current > 0 ? '#60a5fa' : weapon.color,
              radius: currentWeaponRef.current === WeaponType.FLAMETHROWER ? 4 : 3,
              duration: weapon.duration || 1000
            });
          };

          if (currentWeaponRef.current === WeaponType.SHOTGUN) {
            createBullet(0);
            createBullet(0.15);
            createBullet(-0.15);
            createBullet(0.3);
            createBullet(-0.3);
          } else if (currentWeaponRef.current === WeaponType.FLAMETHROWER) {
            createBullet((Math.random() - 0.5) * 0.2);
          } else {
            createBullet(0);
          }
        }
      }

      // Enemy Spawning
      if (waveStateRef.current === 'SPAWNING' && enemiesToSpawnRef.current > 0) {
        spawnTimerRef.current++;
        // Spawn rate speeds up in later waves
        const currentSpawnRate = Math.max(30, level.spawnRate - (waveRef.current * 5));
        
        if (spawnTimerRef.current > currentSpawnRate) {
          spawnTimerRef.current = 0;
          enemiesToSpawnRef.current--;
          
          const edge = Math.floor(Math.random() * 4);
          let ex = 0, ey = 0;
          if (edge === 0) { ex = Math.random() * CANVAS_WIDTH; ey = -20; }
          else if (edge === 1) { ex = CANVAS_WIDTH + 20; ey = Math.random() * CANVAS_HEIGHT; }
          else if (edge === 2) { ex = Math.random() * CANVAS_WIDTH; ey = CANVAS_HEIGHT + 20; }
          else { ex = -20; ey = Math.random() * CANVAS_HEIGHT; }

          const type = level.enemyTypes[Math.floor(Math.random() * level.enemyTypes.length)];
          const stats = ENEMY_STATS[type];

          enemiesRef.current.push({
            id: Math.random().toString(),
            x: ex,
            y: ey,
            type: type,
            radius: stats.radius,
            color: stats.color,
            speed: stats.speed * diffMod.speed, // Apply Difficulty
            angle: 0,
            hp: stats.hp * diffMod.hp, // Apply Difficulty
            maxHp: stats.hp * diffMod.hp
          });
        }
      }

      // Update Enemies
      enemiesRef.current.forEach(enemy => {
        const angle = Math.atan2(playerRef.current.y - enemy.y, playerRef.current.x - enemy.x);
        enemy.x += Math.cos(angle) * enemy.speed;
        enemy.y += Math.sin(angle) * enemy.speed;
        enemy.angle = angle;

        const dist = Math.hypot(playerRef.current.x - enemy.x, playerRef.current.y - enemy.y);
        if (dist < playerRef.current.radius + enemy.radius) {
          if (frameRef.current % 30 === 0) {
             // Flat damage for now, could scale with difficulty if desired (diffMod.damage)
             playerRef.current.hp -= 10 * diffMod.damage; 
             addShake(10);
             soundSystem.playPlayerHit();
             spawnBlood(playerRef.current.x, playerRef.current.y, '#ef4444');
             if (playerRef.current.hp <= 0) {
               onGameOver(scoreRef.current, 'defeat');
             }
          }
        }
      });

      // Update Bullets
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const b = bulletsRef.current[i];
        b.x += b.vx;
        b.y += b.vy;
        b.duration--;

        if (b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT || (currentWeaponRef.current === WeaponType.FLAMETHROWER && b.duration <= 0)) {
          bulletsRef.current.splice(i, 1);
          continue;
        }

        let hit = false;
        for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
          const enemy = enemiesRef.current[j];
          const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          
          if (dist < enemy.radius + b.radius) {
            enemy.hp -= b.damage;
            spawnBlood(enemy.x, enemy.y, '#166534');
            hit = true;
            soundSystem.playEnemyHit();
            
            if (enemy.hp <= 0) {
              scoreRef.current += ENEMY_STATS[enemy.type!].score * diffMod.score;
              spawnItem(enemy.x, enemy.y); 
              enemiesRef.current.splice(j, 1);
            }
            break; 
          }
        }

        if (hit && currentWeaponRef.current !== WeaponType.FLAMETHROWER) {
           bulletsRef.current.splice(i, 1);
        }
      }

      // Update Items
      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
        const item = itemsRef.current[i];
        item.life--;
        item.angle += 0.05;
        
        const dist = Math.hypot(playerRef.current.x - item.x, playerRef.current.y - item.y);
        if (dist < playerRef.current.radius + 15) { 
           const stats = ITEM_STATS[item.type];
           
           if (item.type === ItemType.MEDKIT) {
             playerRef.current.hp = Math.min(playerRef.current.maxHp, playerRef.current.hp + stats.heal!);
             soundSystem.playPickup('health');
           } else if (item.type === ItemType.NUKE) {
             enemiesRef.current.forEach(e => {
               scoreRef.current += ENEMY_STATS[e.type!].score;
               spawnBlood(e.x, e.y, '#166534', 10);
             });
             enemiesRef.current = [];
             addShake(20);
             soundSystem.playPickup('nuke');
           } else if (item.type === ItemType.RAPID_FIRE) {
             rapidFireTimerRef.current = stats.duration!;
             soundSystem.playPickup('ammo');
           } else if (item.type === ItemType.AMMO) {
             Object.keys(ammoRef.current).forEach(key => {
                const w = key as WeaponType;
                ammoRef.current[w].reserve = Math.min(WEAPON_STATS[w].maxReserve, ammoRef.current[w].reserve + WEAPON_STATS[w].clipSize * 2);
             });
             soundSystem.playPickup('ammo');
           }
           
           scoreRef.current += stats.score || 0;
           itemsRef.current.splice(i, 1);
           continue;
        }

        if (item.life <= 0) itemsRef.current.splice(i, 1);
      }

      // Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // --- DRAWING ---

      itemsRef.current.forEach(item => {
        const stats = ITEM_STATS[item.type];
        const floatY = Math.sin(frameRef.current * 0.1) * 3;
        ctx.save();
        ctx.translate(item.x, item.y + floatY);
        ctx.shadowBlur = 10;
        ctx.shadowColor = stats.color;
        ctx.fillStyle = stats.color;
        ctx.fillRect(-10, -10, 20, 20);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(-10, -10, 20, 20);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stats.symbol, 0, 1);
        ctx.restore();
      });

      particlesRef.current.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      enemiesRef.current.forEach(enemy => {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(enemy.angle);
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = enemy.color; 
        ctx.fillRect(0, -enemy.radius, enemy.radius + 5, 8); 
        ctx.fillRect(0, enemy.radius - 8, enemy.radius + 5, 8);
        if (enemy.hp < enemy.maxHp) {
           ctx.fillStyle = 'red';
           ctx.fillRect(-10, -25, 20, 4);
           ctx.fillStyle = 'lime';
           ctx.fillRect(-10, -25, 20 * (enemy.hp/enemy.maxHp), 4);
        }
        ctx.restore();
      });

      // Draw Player
      ctx.save();
      ctx.translate(playerRef.current.x, playerRef.current.y);
      
      if (reloadTimerRef.current > 0) {
        const maxTime = WEAPON_STATS[currentWeaponRef.current].reloadTime;
        const progress = 1 - (reloadTimerRef.current / maxTime);
        ctx.fillStyle = 'black';
        ctx.fillRect(-15, -30, 30, 6);
        ctx.fillStyle = 'yellow';
        ctx.fillRect(-14, -29, 28 * progress, 4);
      }

      ctx.rotate(playerRef.current.angle);
      const walkAnim = Math.sin(frameRef.current * 0.2) * 5;
      ctx.fillStyle = '#1e3a8a';
      if (dx !== 0 || dy !== 0) {
         ctx.fillRect(-5, 8 + walkAnim, 10, 5);
         ctx.fillRect(-5, -12 - walkAnim, 10, 5);
      }
      ctx.fillStyle = rapidFireTimerRef.current > 0 ? '#93c5fd' : playerRef.current.color; 
      ctx.beginPath();
      ctx.arc(0, 0, playerRef.current.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, -4, 25, 8);
      ctx.restore();

      bulletsRef.current.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      // Sync UI state
      setHp(playerRef.current.hp);
      setScore(scoreRef.current);
      setWave(waveRef.current);
      setWaveStateUI(waveStateRef.current);
      setHasRapidFire(rapidFireTimerRef.current > 0);
      setWeapon(currentWeaponRef.current);
      setClip(ammoRef.current[currentWeaponRef.current].clip);
      setReserve(ammoRef.current[currentWeaponRef.current].reserve);
      setIsReloading(reloadTimerRef.current > 0);

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
  }, [level, settings, onGameOver, isPaused]); 

  return (
    <div className="relative">
       <canvas 
         ref={canvasRef} 
         width={CANVAS_WIDTH} 
         height={CANVAS_HEIGHT} 
         className="block border-4 border-zinc-800 bg-black rounded shadow-2xl cursor-crosshair mx-auto"
       />
       
       {/* Wave Notification */}
       {waveStateUI === 'INTERMISSION' && (
         <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
             <div className="bg-black/70 p-6 rounded text-center border-y-4 border-green-600 w-full backdrop-blur-sm">
               <h3 className="text-4xl font-bold text-green-500 mb-2">WAVE {wave} CLEARED</h3>
               <p className="text-white text-xl animate-pulse">NEXT WAVE IN {intermissionTimeUI}...</p>
             </div>
         </div>
       )}

       {/* HUD Overlay */}
       <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[780px] flex justify-between text-white font-bold text-xl pointer-events-none">
          {/* Health */}
          <div className="flex flex-col bg-black/50 p-2 rounded border border-zinc-700 w-48">
             <div className="flex items-center gap-2">
                <Heart className="text-red-500" size={20} />
                <span className={hp < 30 ? 'text-red-500 animate-pulse' : 'text-green-400'}>
                  {Math.ceil(hp)}%
                </span>
             </div>
             <div className="w-full h-3 bg-red-900 mt-1 rounded overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-200" style={{ width: `${Math.max(0, hp)}%` }}></div>
             </div>
          </div>
          
          {/* Weapon Bar */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex gap-1 bg-black/50 p-1 rounded border border-zinc-700">
              {unlockedWeapons.map((w, idx) => (
                <div 
                  key={w} 
                  className={`w-8 h-8 flex items-center justify-center text-sm border ${weapon === w ? 'border-green-500 text-green-500 bg-green-900/30' : 'border-zinc-600 text-zinc-600'}`}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 bg-black/50 px-4 py-2 rounded border border-zinc-700 min-w-[160px] justify-center">
               <div className="text-right">
                 <div className={`text-2xl leading-none ${clip === 0 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                   {isReloading ? 'RLD' : clip}
                 </div>
                 <div className="text-xs text-zinc-400">/ {reserve > 900 ? '∞' : reserve}</div>
               </div>
               <div className="text-sm text-zinc-300 border-l border-zinc-600 pl-3">
                 {weapon.toUpperCase()}
               </div>
            </div>
             {hasRapidFire && (
               <div className="text-blue-400 text-xs flex items-center gap-1 animate-pulse">
                 <Zap size={12} /> RAPID FIRE
               </div>
             )}
          </div>

          {/* Score & Wave */}
          <div className="flex flex-col items-end bg-black/50 p-2 rounded border border-zinc-700 w-48">
             <span className="text-blue-400">SCORE: {score.toString().padStart(6, '0')}</span>
             <span className="text-yellow-400 text-sm flex items-center gap-1">
               <Radiation size={14} /> WAVE {wave}/{TOTAL_WAVES}
             </span>
          </div>
       </div>

       {isPaused && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
           <div className="bg-zinc-900 border-2 border-zinc-700 p-8 w-80 text-center shadow-2xl">
             <h2 className="text-4xl font-bold text-white mb-4 tracking-widest">PAUSED</h2>
             <p className="text-zinc-500 text-sm mb-8">Press ESC to Resume</p>
             <div className="flex flex-col gap-2 text-zinc-400 text-xs">
               <p>Difficulty: {settings.difficulty}</p>
               <p>Particles: {settings.particles}</p>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

export default GameEngine;
