
import React, { useState, useEffect } from 'react';
import GameEngine from './components/GameEngine';
import BriefingModal from './components/BriefingModal';
import { GameState, LevelConfig, GameSettings, Difficulty, GameStats, PlayerUpgrades, GameMode, Achievement, WeaponType } from './types';
import { LEVELS, CANVAS_WIDTH, DEFAULT_SETTINGS, UPGRADE_CONFIG, ACHIEVEMENTS } from './constants';
import { soundSystem } from './services/SoundSystem';
import { Gamepad2, Skull, Trophy, Crown, Settings as SettingsIcon, X, Volume2, Gauge, Monitor, ShoppingCart, Crosshair, Shield, Zap, Timer, Activity, Lock } from 'lucide-react';

const DEFAULT_UPGRADES: PlayerUpgrades = { health: 0, speed: 0, damage: 0 };

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(LEVELS[0]);
  const [currentGameMode, setCurrentGameMode] = useState<GameMode>(GameMode.CAMPAIGN);
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  
  const [highScore, setHighScore] = useState(0);
  const [credits, setCredits] = useState(0);
  const [upgrades, setUpgrades] = useState<PlayerUpgrades>(DEFAULT_UPGRADES);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showArmory, setShowArmory] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showModeSelect, setShowModeSelect] = useState(false);
  
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const savedScore = localStorage.getItem('zombie_crisis_highscore');
    if (savedScore) setHighScore(parseInt(savedScore, 10));

    const savedCredits = localStorage.getItem('zombie_crisis_credits');
    if (savedCredits) setCredits(parseInt(savedCredits, 10));

    const savedUpgrades = localStorage.getItem('zombie_crisis_upgrades');
    if (savedUpgrades) setUpgrades(JSON.parse(savedUpgrades));
    
    const savedAchievements = localStorage.getItem('zombie_crisis_achievements');
    if (savedAchievements) setUnlockedAchievements(JSON.parse(savedAchievements));

    const savedSettings = localStorage.getItem('zombie_crisis_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        soundSystem.setVolumes(parsed.masterVolume, parsed.musicVolume, parsed.sfxVolume);
      } catch (e) { console.error(e); }
    } else {
       soundSystem.setVolumes(DEFAULT_SETTINGS.masterVolume, DEFAULT_SETTINGS.musicVolume, DEFAULT_SETTINGS.sfxVolume);
    }
  }, []);

  const saveSettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
    soundSystem.setVolumes(newSettings.masterVolume, newSettings.musicVolume, newSettings.sfxVolume);
    localStorage.setItem('zombie_crisis_settings', JSON.stringify(newSettings));
  };

  const buyUpgrade = (type: keyof PlayerUpgrades) => {
    const level = upgrades[type];
    const config = UPGRADE_CONFIG[type];
    if (level >= config.maxLevel) return;

    const cost = Math.floor(config.baseCost * Math.pow(config.costMult, level));
    if (credits >= cost) {
      const newUpgrades = { ...upgrades, [type]: level + 1 };
      setCredits(prev => prev - cost);
      setUpgrades(newUpgrades);
      localStorage.setItem('zombie_crisis_credits', (credits - cost).toString());
      localStorage.setItem('zombie_crisis_upgrades', JSON.stringify(newUpgrades));
      soundSystem.playCash();
    }
  };

  const startGame = (levelId: number, mode: GameMode) => {
    const level = LEVELS.find(l => l.id === levelId) || LEVELS[0];
    setCurrentLevel(level);
    setCurrentGameMode(mode);
    setGameState(GameState.BRIEFING);
    setShowModeSelect(false);
  };

  const handleBriefingComplete = () => {
    setGameState(GameState.PLAYING);
  };

  const checkAchievements = (stats: GameStats) => {
    const newUnlocks: string[] = [];
    
    ACHIEVEMENTS.forEach(ach => {
      if (unlockedAchievements.includes(ach.id)) return;

      let unlocked = false;
      if (ach.id === 'FIRST_BLOOD' && stats.kills > 0) unlocked = true;
      if (ach.id === 'SLAUGHTER') {
         // Needs persistent tracking, for now checking single run for simplicity or assume stats.kills is cumulative if we loaded total kills
         // Simple implementation: Check single run for now
         if (stats.kills >= 500) unlocked = true;
      }
      if (ach.id === 'PISTOL_PRO' && stats.weaponsUsed.length === 1 && stats.weaponsUsed.includes(WeaponType.PISTOL) && stats.score > 0) unlocked = true;
      if (ach.id === 'SURVIVOR' && stats.damageTaken === 0 && stats.score > 0) unlocked = true;
      if (ach.id === 'IRON_WILL' && currentGameMode === GameMode.ENDLESS && stats.waveReached >= 10) unlocked = true;

      if (unlocked) newUnlocks.push(ach.id);
    });

    if (newUnlocks.length > 0) {
       const updated = [...unlockedAchievements, ...newUnlocks];
       setUnlockedAchievements(updated);
       localStorage.setItem('zombie_crisis_achievements', JSON.stringify(updated));
       soundSystem.playUnlock();
    }
  };

  const handleGameOver = (stats: GameStats, reason: 'victory' | 'defeat') => {
    setLastStats(stats);
    checkAchievements(stats);
    
    // 10% of score converted to credits
    const earnedCredits = Math.floor(stats.score * 0.1);
    const newCredits = credits + earnedCredits;
    setCredits(newCredits);
    localStorage.setItem('zombie_crisis_credits', newCredits.toString());

    if (stats.score > highScore) {
      setHighScore(stats.score);
      localStorage.setItem('zombie_crisis_highscore', stats.score.toString());
    }
    
    if (reason === 'victory' && currentGameMode === GameMode.CAMPAIGN) {
      // If level 3 is beat, go to victory screen, else next level
      if (currentLevel.id === 3) {
         setGameState(GameState.VICTORY);
      } else {
         const nextLevel = LEVELS.find(l => l.id === currentLevel.id + 1);
         if (nextLevel) {
           setCurrentLevel(nextLevel);
         }
         setGameState(GameState.GAME_OVER); 
      }
    } else {
      setGameState(GameState.GAME_OVER);
    }
  };

  const getUpgradeCost = (type: keyof PlayerUpgrades) => {
    const level = upgrades[type];
    const config = UPGRADE_CONFIG[type];
    if (level >= config.maxLevel) return 'MAX';
    return Math.floor(config.baseCost * Math.pow(config.costMult, level));
  };
  
  const getAchievementIcon = (iconName: string) => {
     switch(iconName) {
        case 'Skull': return <Skull />;
        case 'Crosshair': return <Crosshair />;
        case 'Shield': return <Shield />;
        case 'Zap': return <Zap />;
        case 'Crown': return <Crown />;
        case 'Activity': return <Activity />;
        default: return <Trophy />;
     }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 scanlines select-none text-white font-vt323">
      <div className="mb-4 text-center">
        <h1 className="text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{ fontFamily: 'VT323' }}>
          ZOMBIE CRISIS
        </h1>
        <p className="text-zinc-500 text-2xl tracking-[0.5em]">PROTOCOL 2012</p>
        <div className="mt-2 flex justify-center gap-6 text-yellow-500 font-mono">
          <div className="flex items-center gap-2"><Crown size={16} /> HIGHSCORE: {highScore}</div>
          <div className="flex items-center gap-2 text-green-400"><ShoppingCart size={16} /> CREDITS: {credits}</div>
        </div>
      </div>

      <div className="relative" style={{ width: Math.min(window.innerWidth - 32, CANVAS_WIDTH) }}>
        
        {gameState === GameState.MENU && !showArmory && !showAchievements && !showModeSelect && (
          <div className="w-full max-w-3xl mx-auto bg-zinc-900 border-4 border-zinc-800 p-8 shadow-2xl relative">
            <div className="absolute top-4 right-4 flex gap-2">
              <button onClick={() => setShowAchievements(true)} className="text-yellow-500 hover:text-white bg-zinc-800 p-2 rounded border border-zinc-700">
                <Trophy size={24} />
              </button>
              <button onClick={() => setShowArmory(true)} className="text-green-500 hover:text-white bg-zinc-800 p-2 rounded border border-zinc-700">
                <ShoppingCart size={24} />
              </button>
              <button onClick={() => setShowSettings(true)} className="text-zinc-500 hover:text-white bg-zinc-800 p-2 rounded border border-zinc-700">
                <SettingsIcon size={24} />
              </button>
            </div>

            <h2 className="text-3xl text-green-500 mb-6 border-b border-zinc-700 pb-4">MAIN MENU</h2>
            <div className="grid gap-4">
                <button
                  onClick={() => setShowModeSelect(true)}
                  className="group flex items-center justify-between p-4 bg-black border border-zinc-700 hover:border-green-500 hover:bg-zinc-900 transition-all text-left"
                >
                  <div>
                    <div className="text-2xl text-zinc-200 group-hover:text-green-400 font-bold">CAMPAIGN</div>
                    <div className="text-lg text-zinc-500">Story Mode. Clear sectors.</div>
                  </div>
                  <div className="text-zinc-600 group-hover:text-green-500">
                    <Gamepad2 size={32} />
                  </div>
                </button>
                
                <div className="grid grid-cols-2 gap-4">
                   <button
                     onClick={() => startGame(3, GameMode.ENDLESS)}
                     className="group p-4 bg-black border border-zinc-700 hover:border-purple-500 hover:bg-zinc-900 transition-all text-left"
                   >
                     <div className="text-xl text-purple-400 font-bold flex items-center gap-2"><Activity /> ENDLESS</div>
                     <div className="text-sm text-zinc-500">Survive infinite waves.</div>
                   </button>

                   <button
                     onClick={() => startGame(2, GameMode.TIME_ATTACK)}
                     className="group p-4 bg-black border border-zinc-700 hover:border-blue-500 hover:bg-zinc-900 transition-all text-left"
                   >
                     <div className="text-xl text-blue-400 font-bold flex items-center gap-2"><Timer /> TIME ATTACK</div>
                     <div className="text-sm text-zinc-500">3 Minutes. Max Kills.</div>
                   </button>
                </div>
            </div>
          </div>
        )}

        {showModeSelect && (
           <div className="w-full max-w-3xl mx-auto bg-zinc-900 border-4 border-zinc-800 p-8 shadow-2xl relative">
              <button onClick={() => setShowModeSelect(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white"><X size={24}/></button>
              <h2 className="text-3xl text-green-500 mb-6 border-b border-zinc-700 pb-4">SELECT CAMPAIGN MISSION</h2>
              <div className="grid gap-4">
                {LEVELS.map((level) => (
                  <button
                    key={level.id}
                    onClick={() => startGame(level.id, GameMode.CAMPAIGN)}
                    className="group flex items-center justify-between p-4 bg-black border border-zinc-700 hover:border-green-500 hover:bg-zinc-900 transition-all text-left"
                  >
                    <div>
                      <div className="text-2xl text-zinc-200 group-hover:text-green-400 font-bold">{level.id}. {level.name}</div>
                      <div className="text-lg text-zinc-500">{level.description}</div>
                    </div>
                  </button>
                ))}
              </div>
           </div>
        )}

        {showArmory && (
          <div className="w-full max-w-3xl mx-auto bg-zinc-900 border-4 border-green-900 p-8 shadow-2xl relative">
             <button onClick={() => setShowArmory(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white"><X size={24}/></button>
             <h2 className="text-3xl text-yellow-500 mb-6 flex items-center gap-3"><ShoppingCart /> ARMORY REQUISITIONS</h2>
             <div className="grid gap-6">
               {(Object.keys(UPGRADE_CONFIG) as (keyof PlayerUpgrades)[]).map(key => (
                 <div key={key} className="bg-black p-4 border border-zinc-700 flex justify-between items-center">
                    <div>
                       <h3 className="text-xl text-green-400 font-bold flex items-center gap-2">
                         {key === 'health' && <Shield size={18}/>}
                         {key === 'damage' && <Crosshair size={18}/>}
                         {key === 'speed' && <Zap size={18}/>}
                         {UPGRADE_CONFIG[key].name}
                       </h3>
                       <div className="flex gap-1 mt-2">
                         {[...Array(UPGRADE_CONFIG[key].maxLevel)].map((_, i) => (
                           <div key={i} className={`w-8 h-2 rounded ${i < upgrades[key] ? 'bg-green-500' : 'bg-zinc-800'}`} />
                         ))}
                       </div>
                    </div>
                    <button 
                      onClick={() => buyUpgrade(key)}
                      disabled={upgrades[key] >= UPGRADE_CONFIG[key].maxLevel || credits < (getUpgradeCost(key) as number)}
                      className={`px-6 py-2 font-bold border-2 ${
                        upgrades[key] >= UPGRADE_CONFIG[key].maxLevel 
                        ? 'border-zinc-700 text-zinc-500' 
                        : credits >= (getUpgradeCost(key) as number) 
                          ? 'border-yellow-600 text-yellow-500 hover:bg-yellow-900' 
                          : 'border-red-900 text-red-900'
                      }`}
                    >
                      {upgrades[key] >= UPGRADE_CONFIG[key].maxLevel ? 'MAXED' : `${getUpgradeCost(key)} CR`}
                    </button>
                 </div>
               ))}
             </div>
          </div>
        )}

        {showAchievements && (
           <div className="w-full max-w-3xl mx-auto bg-zinc-900 border-4 border-yellow-600 p-8 shadow-2xl relative">
             <button onClick={() => setShowAchievements(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white"><X size={24}/></button>
             <h2 className="text-3xl text-yellow-500 mb-6 flex items-center gap-3"><Trophy /> SERVICE RECORDS</h2>
             <div className="grid grid-cols-1 gap-4">
                {ACHIEVEMENTS.map(ach => {
                   const isUnlocked = unlockedAchievements.includes(ach.id);
                   return (
                     <div key={ach.id} className={`p-4 border ${isUnlocked ? 'border-yellow-500 bg-yellow-900/20' : 'border-zinc-800 bg-black'} flex items-center gap-4`}>
                        <div className={`p-3 rounded-full ${isUnlocked ? 'bg-yellow-500 text-black' : 'bg-zinc-800 text-zinc-600'}`}>
                           {isUnlocked ? getAchievementIcon(ach.icon) : <Lock size={20} />}
                        </div>
                        <div>
                           <h3 className={`text-xl font-bold ${isUnlocked ? 'text-yellow-400' : 'text-zinc-600'}`}>{ach.name}</h3>
                           <p className="text-zinc-500">{ach.description}</p>
                        </div>
                     </div>
                   )
                })}
             </div>
           </div>
        )}

        {showSettings && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
            <div className="bg-zinc-900 border-2 border-zinc-600 p-8 w-96 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl text-white font-bold">SETTINGS</h3>
                <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-red-500"><X size={24} /></button>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="text-zinc-400 text-lg mb-3 border-b border-zinc-700 pb-1 flex items-center gap-2"><Volume2 size={18}/> AUDIO</h4>
                  <div className="space-y-3">
                    <input type="range" min="0" max="1" step="0.1" value={settings.masterVolume} onChange={(e) => saveSettings({...settings, masterVolume: parseFloat(e.target.value)})} className="w-full accent-green-500" />
                    <input type="range" min="0" max="1" step="0.1" value={settings.musicVolume} onChange={(e) => saveSettings({...settings, musicVolume: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
                    <input type="range" min="0" max="1" step="0.1" value={settings.sfxVolume} onChange={(e) => saveSettings({...settings, sfxVolume: parseFloat(e.target.value)})} className="w-full accent-orange-500" />
                  </div>
                </div>
                <div>
                   <h4 className="text-zinc-400 text-lg mb-3 border-b border-zinc-700 pb-1 flex items-center gap-2"><Gauge size={18}/> DIFFICULTY</h4>
                   <div className="flex gap-2">
                     {(Object.keys(Difficulty) as Difficulty[]).map(diff => (
                       <button key={diff} onClick={() => saveSettings({...settings, difficulty: diff})} className={`flex-1 py-1 text-sm font-bold rounded border ${settings.difficulty === diff ? 'bg-green-900 border-green-500 text-green-400' : 'bg-black border-zinc-700 text-zinc-500'}`}>{diff}</button>
                     ))}
                   </div>
                </div>
                <div>
                   <h4 className="text-zinc-400 text-lg mb-3 border-b border-zinc-700 pb-1 flex items-center gap-2"><Monitor size={18}/> GRAPHICS</h4>
                  <div className="flex gap-2">
                     {['LOW', 'MEDIUM', 'HIGH'].map(opt => (
                       <button key={opt} onClick={() => saveSettings({...settings, particles: opt as any})} className={`flex-1 py-1 text-sm font-bold rounded border ${settings.particles === opt ? 'bg-blue-900 border-blue-500 text-blue-400' : 'bg-black border-zinc-700 text-zinc-500'}`}>{opt}</button>
                     ))}
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {gameState === GameState.BRIEFING && (
          <BriefingModal level={currentLevel} onStart={handleBriefingComplete} />
        )}

        {gameState === GameState.PLAYING && (
          <GameEngine level={currentLevel} settings={settings} upgrades={upgrades} gameMode={currentGameMode} onGameOver={handleGameOver} />
        )}

        {gameState === GameState.GAME_OVER && lastStats && (
          <div className="w-full max-w-2xl mx-auto bg-zinc-900 border-4 border-red-900 p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-300">
            <h2 className="text-6xl text-red-600 font-bold mb-2">MISSION REPORT</h2>
            <p className="text-zinc-400 text-xl mb-8 uppercase tracking-widest">{currentLevel.name} // {currentGameMode}</p>
            
            <div className="grid grid-cols-2 gap-4 text-left mb-8 bg-black/50 p-6 border border-red-900/50">
               <div>
                 <p className="text-zinc-500 text-sm">TOTAL SCORE</p>
                 <p className="text-3xl text-white">{lastStats.score}</p>
               </div>
               <div>
                 <p className="text-zinc-500 text-sm">CREDITS EARNED</p>
                 <p className="text-3xl text-green-500">+{Math.floor(lastStats.score * 0.1)}</p>
               </div>
               <div>
                 <p className="text-zinc-500 text-sm">HOSTILES ELIMINATED</p>
                 <p className="text-2xl text-red-400">{lastStats.kills}</p>
               </div>
               <div>
                 <p className="text-zinc-500 text-sm">MAX COMBO</p>
                 <p className="text-2xl text-yellow-400">{lastStats.maxCombo}x</p>
               </div>
               <div>
                 <p className="text-zinc-500 text-sm">ACCURACY</p>
                 <p className="text-xl text-blue-400">{lastStats.shotsFired > 0 ? Math.round((lastStats.shotsHit / lastStats.shotsFired) * 100) : 0}%</p>
               </div>
               <div>
                 <p className="text-zinc-500 text-sm">DAMAGE TAKEN</p>
                 <p className="text-xl text-orange-400">{Math.round(lastStats.damageTaken)}</p>
               </div>
            </div>

            <div className="flex justify-center gap-4">
              <button onClick={() => setGameState(GameState.MENU)} className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold border border-zinc-600">RETURN TO BASE</button>
              {currentGameMode === GameMode.CAMPAIGN && currentLevel.id < 3 && lastStats.score > 0 && ( 
                <button onClick={() => startGame(currentLevel.id + 1, GameMode.CAMPAIGN)} className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white font-bold border border-red-500">NEXT MISSION</button>
              )}
              {currentGameMode !== GameMode.CAMPAIGN && (
                <button onClick={() => startGame(currentLevel.id, currentGameMode)} className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white font-bold border border-red-500">RETRY</button>
              )}
            </div>
          </div>
        )}

        {gameState === GameState.VICTORY && lastStats && (
          <div className="w-full max-w-2xl mx-auto bg-black border-4 border-yellow-600 p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-500">
            <Trophy size={80} className="text-yellow-500 mx-auto mb-4 animate-bounce" />
            <h2 className="text-6xl text-yellow-500 font-bold mb-2">VICTORY</h2>
            <p className="text-green-400 text-2xl mb-8">{currentGameMode === GameMode.TIME_ATTACK ? 'TIME UP!' : 'CAMPAIGN COMPLETE'}</p>
            
            <div className="bg-zinc-900 p-6 border border-yellow-900/50 mb-8">
              <p className="text-zinc-400 text-sm">FINAL SCORE</p>
              <p className="text-5xl text-white">{lastStats.score}</p>
              <p className="text-green-500 mt-2">CREDITS SECURED: +{Math.floor(lastStats.score * 0.1)}</p>
            </div>

            <button onClick={() => setGameState(GameState.MENU)} className="px-8 py-3 bg-yellow-700 hover:bg-yellow-600 text-white font-bold border border-yellow-500 uppercase tracking-wider">
              Return to Main Menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
