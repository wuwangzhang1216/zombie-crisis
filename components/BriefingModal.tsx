import React, { useEffect, useState } from 'react';
import { generateBriefing } from '../services/geminiService';
import { LevelConfig } from '../types';
import { TypeAnimation } from 'react-type-animation'; // Simulate typing effect manually since we can't install new libs, I'll write a custom one.

interface BriefingModalProps {
  level: LevelConfig;
  onStart: () => void;
}

const Typewriter: React.FC<{text: string, speed?: number, onComplete?: () => void}> = ({ text, speed = 30, onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(prev => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return <p className="whitespace-pre-wrap">{displayedText}</p>;
};

const BriefingModal: React.FC<BriefingModalProps> = ({ level, onStart }) => {
  const [briefingText, setBriefingText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fetchBriefing = async () => {
      setLoading(true);
      const text = await generateBriefing(level);
      setBriefingText(text);
      setLoading(false);
    };
    fetchBriefing();
  }, [level]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="w-full max-w-2xl p-8 border-2 border-green-800 bg-zinc-900 text-green-500 font-mono shadow-[0_0_20px_rgba(0,255,0,0.2)]">
        <h2 className="text-3xl font-bold mb-4 border-b border-green-800 pb-2 animate-pulse">
          // MISSION PROTOCOL: LEVEL {level.id}
        </h2>
        
        <div className="min-h-[150px] text-lg leading-relaxed">
          {loading ? (
             <span className="animate-pulse">ESTABLISHING SECURE UPLINK...</span>
          ) : (
             <Typewriter 
               text={briefingText} 
               onComplete={() => setReady(true)} 
             />
          )}
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={onStart}
            disabled={!ready && !loading} // Allow skip if loaded
            className={`px-6 py-2 text-black font-bold uppercase transition-all duration-200
              ${ready || !loading ? 'bg-green-600 hover:bg-green-500 cursor-pointer' : 'bg-zinc-700 cursor-not-allowed'}
            `}
          >
            {loading ? 'DECODING...' : 'INITIATE MISSION [ENTER]'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BriefingModal;