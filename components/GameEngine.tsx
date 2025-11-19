import React, { useRef, useEffect, useState } from 'react';
import { LevelConfig, Entity, Bullet, Particle, WeaponType, Item, ItemType } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP, WEAPON_STATS, ENEMY_STATS, ITEM_STATS } from '../constants';
import { soundSystem } from '../services/SoundSystem';
import { Pause, Zap, Heart, Radiation } from 'lucide-react';

interface GameEngineProps {
  level: LevelConfig;
  onGameOver: (score: number, reason: 'victory' | 'defeat') => void;
}

const GameEngine: React.FC<GameEngineProps> = ({ level, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Game State Refs (Mutable for performance loop)
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
  
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const lastShotTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const enemiesSpawnedRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const isMouseDownRef = useRef<boolean>(false);
  const shakeRef = useRef<number>(0);
  const rapidFireTimerRef = useRef<number>(0); // > 0 means active

  // UI State
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [score, setScore] = useState(0);
  const [enemyCount, setEnemyCount] = useState(level.enemyCount);
  const [isPaused, setIsPaused] = useState(false);
  const [hasRapidFire, setHasRapidFire] = useState(false);

  // Helper: Spawn Particle
  const spawnBlood = (x: number, y: number, color: string, count = 5) => {
    for (let i = 0; i < count; i++) {
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
          life: 600, // 10 seconds @ 60fps
          angle: 0
        });
        break;
      }
    }
  };

  useEffect(() => {
    // Init Audio on first interaction
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
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (!canvas || !ctx) return;

      // Logic Pause
      if (isPaused) {
        // Draw Pause Overlay once and skip logic
        ctx.fillStyle = 'rgba(0, 0, 0, 0.02)'; // Slight fade
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.fillStyle = 'white';
        ctx.font = '40px VT323';
        ctx.textAlign = 'center';
        ctx.fillText("PAUSED", CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
        ctx.font = '20px VT323';
        ctx.fillText("Press ESC to Resume", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 30);
        
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
      }

      // Clear Screen
      ctx.save();
      ctx.fillStyle = level.background;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Apply Screen Shake
      if (shakeRef.current > 0) {
        const dx = (Math.random() - 0.5) * shakeRef.current;
        const dy = (Math.random() - 0.5) * shakeRef.current;
        ctx.translate(dx, dy);
        shakeRef.current *= 0.9; // Decay
        if (shakeRef.current < 0.5) shakeRef.current = 0;
      }

      // --- UPDATE LOGIC ---

      // 1. Player Movement
      let dx = 0;
      let dy = 0;
      if (keysRef.current.has('KeyW') || keysRef.current.has('ArrowUp')) dy -= 1;
      if (keysRef.current.has('KeyS') || keysRef.current.has('ArrowDown')) dy += 1;
      if (keysRef.current.has('KeyA') || keysRef.current.has('ArrowLeft')) dx -= 1;
      if (keysRef.current.has('KeyD') || keysRef.current.has('ArrowRight')) dx += 1;

      if (dx !== 0 || dy !== 0) {
        // Normalize vector
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
        
        let speed = playerRef.current.speed;
        if (rapidFireTimerRef.current > 0) speed *= 1.2; // Speed boost with rapid fire

        playerRef.current.x += dx * speed;
        playerRef.current.y += dy * speed;

        // Boundaries
        playerRef.current.x = Math.max(playerRef.current.radius, Math.min(CANVAS_WIDTH - playerRef.current.radius, playerRef.current.x));
        playerRef.current.y = Math.max(playerRef.current.radius, Math.min(CANVAS_HEIGHT - playerRef.current.radius, playerRef.current.y));
      }

      // Update Player Angle
      playerRef.current.angle = Math.atan2(
        mouseRef.current.y - playerRef.current.y,
        mouseRef.current.x - playerRef.current.x
      );

      // Update Rapid Fire
      if (rapidFireTimerRef.current > 0) {
        rapidFireTimerRef.current--;
      }

      // 2. Shooting
      let cooldown = WEAPON_STATS[level.unlockedWeapon].cooldown;
      if (rapidFireTimerRef.current > 0) cooldown = Math.ceil(cooldown / 2);

      if (isMouseDownRef.current && frameRef.current - lastShotTimeRef.current > cooldown) {
        const weapon = WEAPON_STATS[level.unlockedWeapon];
        lastShotTimeRef.current = frameRef.current;

        // SFX
        if (level.unlockedWeapon === WeaponType.PISTOL) soundSystem.playShoot('pistol');
        else if (level.unlockedWeapon === WeaponType.SHOTGUN) soundSystem.playShoot('shotgun');
        else soundSystem.playShoot('flame');

        // Screen shake on shoot
        if (level.unlockedWeapon === WeaponType.SHOTGUN) addShake(5);
        else if (level.unlockedWeapon === WeaponType.FLAMETHROWER) addShake(1);
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
            color: rapidFireTimerRef.current > 0 ? '#60a5fa' : weapon.color, // Blue bullets if rapid fire
            radius: level.unlockedWeapon === WeaponType.FLAMETHROWER ? 4 : 3,
            duration: weapon.duration || 1000
          });
        };

        if (level.unlockedWeapon === WeaponType.SHOTGUN) {
           createBullet(0);
           createBullet(0.15);
           createBullet(-0.15);
           createBullet(0.3);
           createBullet(-0.3);
        } else if (level.unlockedWeapon === WeaponType.FLAMETHROWER) {
           createBullet((Math.random() - 0.5) * 0.2);
        } else {
           createBullet(0);
        }
      }

      // 3. Spawning Enemies
      if (enemiesSpawnedRef.current < level.enemyCount) {
        spawnTimerRef.current++;
        if (spawnTimerRef.current > level.spawnRate) {
          spawnTimerRef.current = 0;
          enemiesSpawnedRef.current++;
          
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
            speed: stats.speed,
            angle: 0,
            hp: stats.hp,
            maxHp: stats.hp
          });
        }
      } else if (enemiesRef.current.length === 0) {
        onGameOver(scoreRef.current, 'victory');
        return;
      }

      // 4. Update Enemies
      enemiesRef.current.forEach(enemy => {
        const angle = Math.atan2(playerRef.current.y - enemy.y, playerRef.current.x - enemy.x);
        enemy.x += Math.cos(angle) * enemy.speed;
        enemy.y += Math.sin(angle) * enemy.speed;
        enemy.angle = angle;

        const dist = Math.hypot(playerRef.current.x - enemy.x, playerRef.current.y - enemy.y);
        if (dist < playerRef.current.radius + enemy.radius) {
          if (frameRef.current % 30 === 0) {
             playerRef.current.hp -= 10;
             addShake(10);
             soundSystem.playPlayerHit();
             spawnBlood(playerRef.current.x, playerRef.current.y, '#ef4444');
             if (playerRef.current.hp <= 0) {
               onGameOver(scoreRef.current, 'defeat');
             }
          }
        }
      });

      // 5. Update Bullets
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const b = bulletsRef.current[i];
        b.x += b.vx;
        b.y += b.vy;
        b.duration--;

        if (b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT || (level.unlockedWeapon === WeaponType.FLAMETHROWER && b.duration <= 0)) {
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
              scoreRef.current += ENEMY_STATS[enemy.type!].score;
              spawnItem(enemy.x, enemy.y); // Attempt drop
              enemiesRef.current.splice(j, 1);
            }
            break; 
          }
        }

        if (hit && level.unlockedWeapon !== WeaponType.FLAMETHROWER) {
           bulletsRef.current.splice(i, 1);
        }
      }

      // 6. Update Items
      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
        const item = itemsRef.current[i];
        item.life--;
        item.angle += 0.05; // Float rotation
        
        // Collision with player
        const dist = Math.hypot(playerRef.current.x - item.x, playerRef.current.y - item.y);
        if (dist < playerRef.current.radius + 15) { // Slightly larger pickup radius
           // Apply Effect
           const stats = ITEM_STATS[item.type];
           if (item.type === ItemType.MEDKIT) {
             playerRef.current.hp = Math.min(playerRef.current.maxHp, playerRef.current.hp + stats.heal!);
             soundSystem.playPickup('health');
           } else if (item.type === ItemType.NUKE) {
             // Kill all enemies
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
           }
           
           scoreRef.current += stats.score || 0;
           itemsRef.current.splice(i, 1);
           continue;
        }

        if (item.life <= 0) itemsRef.current.splice(i, 1);
      }

      // 7. Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // --- DRAWING ---

      // Draw Items (Under entities)
      itemsRef.current.forEach(item => {
        const stats = ITEM_STATS[item.type];
        const floatY = Math.sin(frameRef.current * 0.1) * 3;
        
        ctx.save();
        ctx.translate(item.x, item.y + floatY);
        
        // Glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = stats.color;
        
        // Box
        ctx.fillStyle = stats.color;
        ctx.fillRect(-10, -10, 20, 20);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(-10, -10, 20, 20);

        // Symbol
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stats.symbol, 0, 1);
        
        ctx.restore();
      });

      // Draw Particles
      particlesRef.current.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Enemies
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
      ctx.rotate(playerRef.current.angle);
      
      const walkAnim = Math.sin(frameRef.current * 0.2) * 5;
      ctx.fillStyle = '#1e3a8a';
      if (dx !== 0 || dy !== 0) {
         ctx.fillRect(-5, 8 + walkAnim, 10, 5);
         ctx.fillRect(-5, -12 - walkAnim, 10, 5);
      }

      ctx.fillStyle = rapidFireTimerRef.current > 0 ? '#93c5fd' : playerRef.current.color; // Flash blue
      ctx.beginPath();
      ctx.arc(0, 0, playerRef.current.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, -4, 25, 8);

      ctx.restore();

      // Draw Bullets
      bulletsRef.current.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore(); // Restore from Shake

      // Sync State
      setHp(playerRef.current.hp);
      setScore(scoreRef.current);
      setEnemyCount(level.enemyCount - enemiesSpawnedRef.current + enemiesRef.current.length);
      setHasRapidFire(rapidFireTimerRef.current > 0);

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
  }, [level, onGameOver]);

  return (
    <div className="relative">
       <canvas 
         ref={canvasRef} 
         width={CANVAS_WIDTH} 
         height={CANVAS_HEIGHT} 
         className="block border-4 border-zinc-800 bg-black rounded shadow-2xl cursor-crosshair mx-auto"
       />
       {/* HUD Overlay */}
       <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[780px] flex justify-between text-white font-bold text-xl pointer-events-none">
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
          
          <div className="flex flex-col items-center justify-center bg-black/50 p-2 rounded border border-zinc-700 min-w-[120px]">
             <span className="text-yellow-400 text-2xl leading-none">{level.unlockedWeapon.toUpperCase()}</span>
             {hasRapidFire && (
               <div className="text-blue-400 text-xs flex items-center gap-1 animate-pulse mt-1">
                 <Zap size={12} /> RAPID FIRE
               </div>
             )}
          </div>

          <div className="flex flex-col items-end bg-black/50 p-2 rounded border border-zinc-700 w-48">
             <span className="text-blue-400">SCORE: {score.toString().padStart(6, '0')}</span>
             <span className="text-red-400 text-sm flex items-center gap-1">
               <Radiation size={14} /> HOSTILES: {enemyCount}
             </span>
          </div>
       </div>

       {/* Pause Hint (if not paused) */}
       {!isPaused && (
         <div className="absolute bottom-2 right-4 text-zinc-600 text-sm font-mono pointer-events-none">
           [ESC] PAUSE
         </div>
       )}
    </div>
  );
};

export default GameEngine;