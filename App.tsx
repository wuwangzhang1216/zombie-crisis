
import React, { useState, useEffect } from 'react';
import GameEngine from './components/GameEngine';
import BriefingModal from './components/BriefingModal';
import { GameState, LevelConfig, GameSettings, Difficulty, GameStats, PlayerUpgrades } from './types';
import { LEVELS, CANVAS_WIDTH, DEFAULT_SETTINGS, UPGRADE_CONFIG } from './constants';
import { soundSystem } from './services/SoundSystem';
import { Gamepad2, Skull, Trophy, Crown, Settings as SettingsIcon, X, Volume2, Gauge, Monitor, ShoppingCart, Crosshair, Shield, Zap } from 'lucide-react';

const DEFAULT_UPGRADES: PlayerUpgrades = { health: 0, speed: 0, damage: 0 };

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(LEVELS[0]);
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  
  const [highScore, setHighScore] = useState(0);
  const [credits, setCredits] = useState(0);
  const [upgrades, setUpgrades] = useState<PlayerUpgrades>(DEFAULT_UPGRADES);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showArmory, setShowArmory] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const savedScore = localStorage.getItem('zombie_crisis_highscore');
    if (savedScore) setHighScore(parseInt(savedScore, 10));

    const savedCredits = localStorage.getItem('zombie_crisis_credits');
    if (savedCredits) setCredits(parseInt(savedCredits, 10));

    const savedUpgrades = localStorage.getItem('zombie_crisis_upgrades');
    if (savedUpgrades) setUpgrades(JSON.parse(savedUpgrades));

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

  const startGame = (levelId: number) => {
    const level = LEVELS.find(l => l.id === levelId) || LEVELS[0];
    setCurrentLevel(level);
    setGameState(GameState.BRIEFING);
  };

  const handleBriefingComplete = () => {
    setGameState(GameState.PLAYING);
  };

  const handleGameOver = (stats: GameStats, reason: 'victory' | 'defeat') => {
    setLastStats(stats);
    
    // 10% of score converted to credits
    const earnedCredits = Math.floor(stats.score * 0.1);
    const newCredits = credits + earnedCredits;
    setCredits(newCredits);
    localStorage.setItem('zombie_crisis_credits', newCredits.toString());

    if (stats.score > highScore) {
      setHighScore(stats.score);
      localStorage.setItem('zombie_crisis_highscore', stats.score.toString());
    }
    
    if (reason === 'victory') {
      // If level 3 is beat, go to victory screen, else next level
      if (currentLevel.id === 3) {
         setGameState(GameState.VICTORY);
      } else {
         // Automatically advance logic or return to menu? 
         // Let's show victory report first, then button to next level if exists
         const nextLevel = LEVELS.find(l => l.id === currentLevel.id + 1);
         if (nextLevel) {
           setCurrentLevel(nextLevel);
           // We use a special state or just handle it in the UI
         }
         setGameState(GameState.GAME_OVER); // Reusing Game Over screen for Mission Report
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
        
        {gameState === GameState.MENU && !showArmory && (
          <div className="w-full max-w-3xl mx-auto bg-zinc-900 border-4 border-zinc-800 p-8 shadow-2xl relative">
            <div className="absolute top-4 right-4 flex gap-2">
              <button onClick={() => setShowArmory(true)} className="text-green-500 hover:text-white bg-zinc-800 p-2 rounded border border-zinc-700">
                <ShoppingCart size={24} />
              </button>
              <button onClick={() => setShowSettings(true)} className="text-zinc-500 hover:text-white bg-zinc-800 p-2 rounded border border-zinc-700">
                <SettingsIcon size={24} />
              </button>
            </div>

            <h2 className="text-3xl text-green-500 mb-6 border-b border-zinc-700 pb-4">SELECT OPERATION</h2>
            <div className="grid gap-4">
              {LEVELS.map((level) => (
                <button
                  key={level.id}
                  onClick={() => startGame(level.id)}
                  className="group flex items-center justify-between p-4 bg-black border border-zinc-700 hover:border-green-500 hover:bg-zinc-900 transition-all text-left"
                >
                  <div>
                    <div className="text-2xl text-zinc-200 group-hover:text-green-400 font-bold">{level.id}. {level.name}</div>
                    <div className="text-lg text-zinc-500">{level.description}</div>
                  </div>
                  <div className="text-zinc-600 group-hover:text-green-500">
                    <Gamepad2 size={32} />
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
          <GameEngine level={currentLevel} settings={settings} upgrades={upgrades} onGameOver={handleGameOver} />
        )}

        {gameState === GameState.GAME_OVER && lastStats && (
          <div className="w-full max-w-2xl mx-auto bg-zinc-900 border-4 border-red-900 p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-300">
            <h2 className="text-6xl text-red-600 font-bold mb-2">MISSION REPORT</h2>
            <p className="text-zinc-400 text-xl mb-8 uppercase tracking-widest">{currentLevel.name}</p>
            
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
              {currentLevel.id < 3 && lastStats.score > 0 && ( // Simple check if we won roughly
                <button onClick={() => startGame(currentLevel.id + 1)} className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white font-bold border border-red-500">NEXT MISSION</button>
              )}
            </div>
          </div>
        )}

        {gameState === GameState.VICTORY && lastStats && (
          <div className="w-full max-w-2xl mx-auto bg-black border-4 border-yellow-600 p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-500">
            <Trophy size={80} className="text-yellow-500 mx-auto mb-4 animate-bounce" />
            <h2 className="text-6xl text-yellow-500 font-bold mb-2">VICTORY</h2>
            <p className="text-green-400 text-2xl mb-8">CAMPAIGN COMPLETE</p>
            
            <div className="bg-zinc-900 p-6 border border-yellow-900/50 mb-8">
              <p className="text-zinc-400 text-sm">FINAL CAMPAIGN SCORE</p>
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
