
import React, { useState, useEffect } from 'react';
import GameEngine from './components/GameEngine';
import BriefingModal from './components/BriefingModal';
import { GameState, LevelConfig, GameSettings, Difficulty } from './types';
import { LEVELS, CANVAS_WIDTH, DEFAULT_SETTINGS } from './constants';
import { soundSystem } from './services/SoundSystem';
import { Gamepad2, Skull, Trophy, Crown, Settings as SettingsIcon, X, Volume2, Volume1, Music, Monitor, Gauge } from 'lucide-react';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(LEVELS[0]);
  const [finalScore, setFinalScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Load Data on Mount
  useEffect(() => {
    const savedScore = localStorage.getItem('zombie_crisis_highscore');
    if (savedScore) setHighScore(parseInt(savedScore, 10));

    const savedSettings = localStorage.getItem('zombie_crisis_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        soundSystem.setVolumes(parsed.masterVolume, parsed.musicVolume, parsed.sfxVolume);
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    } else {
       // Init sound system with defaults if no save
       soundSystem.setVolumes(DEFAULT_SETTINGS.masterVolume, DEFAULT_SETTINGS.musicVolume, DEFAULT_SETTINGS.sfxVolume);
    }
  }, []);

  const saveSettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
    soundSystem.setVolumes(newSettings.masterVolume, newSettings.musicVolume, newSettings.sfxVolume);
    localStorage.setItem('zombie_crisis_settings', JSON.stringify(newSettings));
  };

  const updateHighScore = (score: number) => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('zombie_crisis_highscore', score.toString());
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

  const handleGameOver = (score: number, reason: 'victory' | 'defeat') => {
    setFinalScore(score);
    updateHighScore(score); 
    
    if (reason === 'victory') {
      const nextLevel = LEVELS.find(l => l.id === currentLevel.id + 1);
      if (nextLevel) {
        setCurrentLevel(nextLevel);
        setGameState(GameState.BRIEFING);
      } else {
        setGameState(GameState.VICTORY);
      }
    } else {
      setGameState(GameState.GAME_OVER);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 scanlines select-none">
      {/* Header */}
      <div className="mb-4 text-center">
        <h1 className="text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" style={{ fontFamily: 'VT323' }}>
          ZOMBIE CRISIS
        </h1>
        <div className="flex items-center justify-center gap-4">
          <p className="text-zinc-500 text-xl tracking-[0.5em]">PROTOCOL 2012</p>
        </div>
        <div className="mt-2 text-yellow-600 font-mono flex items-center justify-center gap-2">
          <Crown size={16} /> BEST RECORD: {highScore.toString().padStart(6, '0')}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative" style={{ width: Math.min(window.innerWidth - 32, CANVAS_WIDTH) }}>
        
        {gameState === GameState.MENU && (
          <div className="w-full max-w-3xl mx-auto bg-zinc-900 border-4 border-zinc-800 p-8 shadow-2xl relative">
             {/* Settings Toggle */}
            <button 
              onClick={() => setShowSettings(true)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
            >
              <SettingsIcon size={24} />
            </button>

            <h2 className="text-2xl text-green-500 mb-6 border-b border-zinc-700 pb-4">SELECT OPERATION</h2>
            <div className="grid gap-4">
              {LEVELS.map((level) => (
                <button
                  key={level.id}
                  onClick={() => startGame(level.id)}
                  className="group flex items-center justify-between p-4 bg-black border border-zinc-700 hover:border-green-500 hover:bg-zinc-900 transition-all text-left"
                >
                  <div>
                    <div className="text-xl text-zinc-200 group-hover:text-green-400 font-bold">{level.id}. {level.name}</div>
                    <div className="text-sm text-zinc-500">{level.description}</div>
                  </div>
                  <div className="text-zinc-600 group-hover:text-green-500">
                    <Gamepad2 size={24} />
                  </div>
                </button>
              ))}
            </div>
            
            <div className="mt-8 text-zinc-600 text-sm text-center">
              CONTROLS: WASD to Move | MOUSE to Aim & Shoot | [1-3] Change Weapon | [R] Reload
            </div>
          </div>
        )}

        {/* Settings Overlay */}
        {showSettings && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
            <div className="bg-zinc-900 border-2 border-zinc-600 p-8 w-96 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl text-white font-bold">SETTINGS</h3>
                <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-red-500">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Audio Section */}
                <div>
                  <h4 className="text-zinc-400 text-sm mb-3 border-b border-zinc-700 pb-1 flex items-center gap-2">
                    <Volume2 size={14}/> AUDIO
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-500 flex justify-between">
                        <span>MASTER</span> <span>{Math.round(settings.masterVolume * 100)}%</span>
                      </label>
                      <input 
                        type="range" min="0" max="1" step="0.1"
                        value={settings.masterVolume}
                        onChange={(e) => saveSettings({...settings, masterVolume: parseFloat(e.target.value)})}
                        className="w-full accent-green-500"
                      />
                    </div>
                    <div>
                       <label className="text-xs text-zinc-500 flex justify-between">
                        <span>MUSIC</span> <span>{Math.round(settings.musicVolume * 100)}%</span>
                      </label>
                      <input 
                        type="range" min="0" max="1" step="0.1"
                        value={settings.musicVolume}
                        onChange={(e) => saveSettings({...settings, musicVolume: parseFloat(e.target.value)})}
                        className="w-full accent-blue-500"
                      />
                    </div>
                    <div>
                       <label className="text-xs text-zinc-500 flex justify-between">
                        <span>SFX</span> <span>{Math.round(settings.sfxVolume * 100)}%</span>
                      </label>
                      <input 
                        type="range" min="0" max="1" step="0.1"
                        value={settings.sfxVolume}
                        onChange={(e) => saveSettings({...settings, sfxVolume: parseFloat(e.target.value)})}
                        className="w-full accent-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Difficulty Section */}
                <div>
                   <h4 className="text-zinc-400 text-sm mb-3 border-b border-zinc-700 pb-1 flex items-center gap-2">
                    <Gauge size={14}/> DIFFICULTY
                  </h4>
                   <div className="flex gap-2">
                     {(Object.keys(Difficulty) as Difficulty[]).map(diff => (
                       <button
                         key={diff}
                         onClick={() => saveSettings({...settings, difficulty: diff})}
                         className={`flex-1 py-1 text-xs font-bold rounded border ${
                           settings.difficulty === diff 
                           ? 'bg-green-900 border-green-500 text-green-400' 
                           : 'bg-black border-zinc-700 text-zinc-500 hover:border-zinc-500'
                         }`}
                       >
                         {diff}
                       </button>
                     ))}
                   </div>
                </div>

                {/* Graphics Section */}
                <div>
                   <h4 className="text-zinc-400 text-sm mb-3 border-b border-zinc-700 pb-1 flex items-center gap-2">
                    <Monitor size={14}/> GRAPHICS
                  </h4>
                  <div className="flex gap-2">
                     {['LOW', 'MEDIUM', 'HIGH'].map(opt => (
                       <button
                         key={opt}
                         onClick={() => saveSettings({...settings, particles: opt as any})}
                         className={`flex-1 py-1 text-xs font-bold rounded border ${
                           settings.particles === opt 
                           ? 'bg-blue-900 border-blue-500 text-blue-400' 
                           : 'bg-black border-zinc-700 text-zinc-500 hover:border-zinc-500'
                         }`}
                       >
                         {opt}
                       </button>
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
          <GameEngine level={currentLevel} settings={settings} onGameOver={handleGameOver} />
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md border-4 border-red-900 animate-in fade-in zoom-in duration-300">
            <Skull size={64} className="text-red-600 mb-4 animate-bounce" />
            <h2 className="text-6xl text-red-600 font-bold mb-2">KIA</h2>
            <p className="text-zinc-400 text-xl mb-8">FINAL SCORE: {finalScore}</p>
            <button 
              onClick={() => setGameState(GameState.MENU)}
              className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded uppercase tracking-wider"
            >
              Return to Base
            </button>
          </div>
        )}

        {gameState === GameState.VICTORY && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md border-4 border-yellow-600 animate-in fade-in zoom-in duration-300">
            <Trophy size={64} className="text-yellow-500 mb-4" />
            <h2 className="text-6xl text-yellow-500 font-bold mb-2">MISSION ACCOMPLISHED</h2>
            <p className="text-green-400 text-xl mb-8">All Sectors Cleared</p>
            <p className="text-zinc-400 text-lg mb-8">FINAL SCORE: {finalScore}</p>
            <button 
              onClick={() => setGameState(GameState.MENU)}
              className="px-8 py-3 bg-yellow-700 hover:bg-yellow-600 text-white font-bold rounded uppercase tracking-wider"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
