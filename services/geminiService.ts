
import { GoogleGenAI } from "@google/genai";
import { LevelConfig, EnemyType } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateBriefing = async (level: LevelConfig): Promise<string> => {
  if (!process.env.API_KEY) {
    return `CONNECTION TO HQ FAILED. PROCEED WITH CAUTION. \n\nTarget: ${level.name}\nHostiles: ${level.baseEnemyCount}`;
  }

  const enemyDesc = level.enemyTypes.map(t => {
    if (t === EnemyType.RED) return "Fast Runners";
    if (t === EnemyType.MUMMY) return "Armored Tanks";
    return "Shamblers";
  }).join(", ");

  const prompt = `
    You are a gritty military commander in a zombie apocalypse. 
    Write a very short, intense mission briefing (max 50 words) for a soldier about to enter ${level.name}.
    
    Intel:
    - Enemy types present: ${enemyDesc}
    - Total estimated hostiles: ${level.baseEnemyCount}
    - New weapon authorized: ${level.unlockedWeapon}

    Style:
    - Use military jargon.
    - Be urgent and serious.
    - End with a motivational command.
    - Return ONLY the text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Briefing data corrupted. Eliminate all targets.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "UPLINK OFFLINE. TACTICAL DATA UNAVAILABLE. SURVIVE AT ALL COSTS.";
  }
};
