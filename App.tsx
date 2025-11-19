import React, { useState } from 'react';
import GameEngine from './components/GameEngine';
import BriefingModal from './components/BriefingModal';
import { GameState, LevelConfig } from './types';
import { LEVELS, CANVAS_WIDTH } from './constants';
import { Gamepad2, Skull, Trophy } from 'lucide-react';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(LEVELS[0]);
  const [finalScore, setFinalScore] = useState(0);

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
    if (reason === 'victory') {
      // Check if there is a next level
      const nextLevel = LEVELS.find(l => l.id === currentLevel.id + 1);
      if (nextLevel) {
        setCurrentLevel(nextLevel);
        setGameState(GameState.BRIEFING); // Loop immediately to next level briefing
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
        <p className="text-zinc-500 text-xl tracking-[0.5em]">PROTOCOL 2012</p>
      </div>

      {/* Main Content Area */}
      <div className="relative" style={{ width: Math.min(window.innerWidth - 32, CANVAS_WIDTH) }}>
        
        {gameState === GameState.MENU && (
          <div className="w-full max-w-3xl mx-auto bg-zinc-900 border-4 border-zinc-800 p-8 shadow-2xl">
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
              CONTROLS: WASD to Move | MOUSE to Aim & Shoot
            </div>
          </div>
        )}

        {gameState === GameState.BRIEFING && (
          <BriefingModal level={currentLevel} onStart={handleBriefingComplete} />
        )}

        {gameState === GameState.PLAYING && (
          <GameEngine level={currentLevel} onGameOver={handleGameOver} />
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