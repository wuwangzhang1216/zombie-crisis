import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, LevelConfig, Entity, Bullet, Particle, WeaponType, EnemyType } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP, WEAPON_STATS, ENEMY_STATS } from '../constants';

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
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const lastShotTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const enemiesSpawnedRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const isMouseDownRef = useRef<boolean>(false);

  // UI State
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [score, setScore] = useState(0);
  const [enemyCount, setEnemyCount] = useState(level.enemyCount);

  // Helper: Spawn Particle
  const spawnBlood = (x: number, y: number, color: string) => {
    for (let i = 0; i < 5; i++) {
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

  const handleResize = () => {
     // Logic to handle window resize if we want full responsiveness could go here
     // Currently fixed canvas size
  };

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
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

      // Clear Screen
      ctx.fillStyle = level.background;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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
        
        playerRef.current.x += dx * playerRef.current.speed;
        playerRef.current.y += dy * playerRef.current.speed;

        // Boundaries
        playerRef.current.x = Math.max(playerRef.current.radius, Math.min(CANVAS_WIDTH - playerRef.current.radius, playerRef.current.x));
        playerRef.current.y = Math.max(playerRef.current.radius, Math.min(CANVAS_HEIGHT - playerRef.current.radius, playerRef.current.y));
      }

      // Update Player Angle
      playerRef.current.angle = Math.atan2(
        mouseRef.current.y - playerRef.current.y,
        mouseRef.current.x - playerRef.current.x
      );

      // 2. Shooting
      if (isMouseDownRef.current && frameRef.current - lastShotTimeRef.current > WEAPON_STATS[level.unlockedWeapon].cooldown) {
        const weapon = WEAPON_STATS[level.unlockedWeapon];
        lastShotTimeRef.current = frameRef.current;

        const createBullet = (angleOffset: number) => {
          const angle = playerRef.current.angle + angleOffset;
          bulletsRef.current.push({
            id: Math.random().toString(),
            x: playerRef.current.x + Math.cos(angle) * 20,
            y: playerRef.current.y + Math.sin(angle) * 20,
            vx: Math.cos(angle) * weapon.speed,
            vy: Math.sin(angle) * weapon.speed,
            damage: weapon.damage,
            color: weapon.color,
            radius: level.unlockedWeapon === WeaponType.FLAMETHROWER ? 4 : 3,
            duration: weapon.duration || 1000
          });
        };

        if (level.unlockedWeapon === WeaponType.SHOTGUN) {
           // Shotgun spread
           createBullet(0);
           createBullet(0.15);
           createBullet(-0.15);
           createBullet(0.3);
           createBullet(-0.3);
        } else if (level.unlockedWeapon === WeaponType.FLAMETHROWER) {
           // Flamethrower spray
           createBullet((Math.random() - 0.5) * 0.2);
        } else {
           // Pistol
           createBullet(0);
        }
      }

      // 3. Spawning Enemies
      if (enemiesSpawnedRef.current < level.enemyCount) {
        spawnTimerRef.current++;
        if (spawnTimerRef.current > level.spawnRate) {
          spawnTimerRef.current = 0;
          enemiesSpawnedRef.current++;
          
          // Determine spawn edge
          const edge = Math.floor(Math.random() * 4);
          let ex = 0, ey = 0;
          if (edge === 0) { ex = Math.random() * CANVAS_WIDTH; ey = -20; } // Top
          else if (edge === 1) { ex = CANVAS_WIDTH + 20; ey = Math.random() * CANVAS_HEIGHT; } // Right
          else if (edge === 2) { ex = Math.random() * CANVAS_WIDTH; ey = CANVAS_HEIGHT + 20; } // Bottom
          else { ex = -20; ey = Math.random() * CANVAS_HEIGHT; } // Left

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
        // Victory Condition
        onGameOver(scoreRef.current, 'victory');
        return; // Stop loop
      }

      // 4. Update Enemies
      enemiesRef.current.forEach(enemy => {
        const angle = Math.atan2(playerRef.current.y - enemy.y, playerRef.current.x - enemy.x);
        enemy.x += Math.cos(angle) * enemy.speed;
        enemy.y += Math.sin(angle) * enemy.speed;
        enemy.angle = angle;

        // Collision with Player
        const dist = Math.hypot(playerRef.current.x - enemy.x, playerRef.current.y - enemy.y);
        if (dist < playerRef.current.radius + enemy.radius) {
          // Damage Player (invulnerability frames could go here, keeping it simple for now)
          if (frameRef.current % 30 === 0) {
             playerRef.current.hp -= 10;
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

        // Remove if out of bounds or duration ends
        if (b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT || (level.unlockedWeapon === WeaponType.FLAMETHROWER && b.duration <= 0)) {
          bulletsRef.current.splice(i, 1);
          continue;
        }

        // Collision with Enemies
        let hit = false;
        for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
          const enemy = enemiesRef.current[j];
          const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          
          if (dist < enemy.radius + b.radius) {
            enemy.hp -= b.damage;
            spawnBlood(enemy.x, enemy.y, '#166534'); // Green blood
            hit = true;
            
            if (enemy.hp <= 0) {
              scoreRef.current += ENEMY_STATS[enemy.type!].score;
              enemiesRef.current.splice(j, 1);
            }
            break; 
          }
        }

        if (hit && level.unlockedWeapon !== WeaponType.FLAMETHROWER) {
           bulletsRef.current.splice(i, 1);
        }
      }

      // 6. Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // --- DRAWING ---

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
        
        // Body
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Arms
        ctx.fillStyle = enemy.color; // darker
        ctx.fillRect(0, -enemy.radius, enemy.radius + 5, 8); // Right arm
        ctx.fillRect(0, enemy.radius - 8, enemy.radius + 5, 8);  // Left arm

        // HP Bar (if damaged)
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
      
      // Feet (animation)
      const walkAnim = Math.sin(frameRef.current * 0.2) * 5;
      ctx.fillStyle = '#1e3a8a';
      if (dx !== 0 || dy !== 0) {
         ctx.fillRect(-5, 8 + walkAnim, 10, 5);
         ctx.fillRect(-5, -12 - walkAnim, 10, 5);
      }

      // Body
      ctx.fillStyle = playerRef.current.color;
      ctx.beginPath();
      ctx.arc(0, 0, playerRef.current.radius, 0, Math.PI * 2);
      ctx.fill();

      // Weapon
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, -4, 25, 8); // Gun barrel

      ctx.restore();

      // Draw Bullets
      bulletsRef.current.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Sync State for UI (Throttle this for performance if needed, doing every frame for smoothness now)
      setHp(playerRef.current.hp);
      setScore(scoreRef.current);
      setEnemyCount(level.enemyCount - enemiesSpawnedRef.current + enemiesRef.current.length);

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
      window.removeEventListener('resize', handleResize);
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
          <div className="flex flex-col bg-black/50 p-2 rounded border border-zinc-700">
             <span className="text-green-400">HP: {Math.ceil(hp)}%</span>
             <div className="w-32 h-4 bg-red-900 mt-1 rounded overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${Math.max(0, hp)}%` }}></div>
             </div>
          </div>
          
          <div className="flex flex-col items-center bg-black/50 p-2 rounded border border-zinc-700">
             <span className="text-yellow-400 text-2xl">{level.unlockedWeapon.toUpperCase()}</span>
          </div>

          <div className="flex flex-col items-end bg-black/50 p-2 rounded border border-zinc-700">
             <span className="text-blue-400">SCORE: {score.toString().padStart(6, '0')}</span>
             <span className="text-red-400 text-sm">HOSTILES: {enemyCount}</span>
          </div>
       </div>
    </div>
  );
};

export default GameEngine;