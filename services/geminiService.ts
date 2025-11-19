
import { LevelConfig, EnemyType } from '../types';

// Pre-defined scripts to replace dynamic AI generation
const MISSION_LOGS: Record<number, string> = {
  1: "Listen up, rookie. Containment breach confirmed in Sector 1. Targets are slow, but they swarm. Conserve your ammo and keep moving. Clear the zone.",
  2: "Sector 2 shows increased activity. We're detecting structural damage in the corridors. Use the environment to your advantage. Don't get cornered.",
  3: "ALERT. New mutation detected. 'Runners' - they are fast and aggressive. Keep your distance and fire in short bursts. Do not let them close the gap.",
  4: "Intel suggests a supply cache nearby. Clear the hostiles to secure the area. Stay sharp, things are getting messy down there.",
  5: "Enemy density is increasing. You need to thin the herd before we can open the next bulkhead. Watch your fire lanes and check your six.",
  6: "CAUTION. Massive bio-signature detected. It's a Class-A Boss entity. Small arms fire will be ineffective. Pour everything you've got into it.",
  7: "New threat identified: 'Exploders'. Do not let them get close. Shoot them from a distance or take the blast damage. Precision is key.",
  8: "The infection has reached the lower bunkers. Visibility is good, but there's nowhere to hide. Keep moving and strafe constantly.",
  9: "Bio-hazard warning. 'Spitters' detected. They project corrosive acid. Dodge their projectiles and close the gap to eliminate them.",
  10: "We are halfway to the core. Resistance is stiffening. Upgrade your arsenal at the first opportunity. You're going to need better hardware.",
  11: "Swarm density critical. They are crawling out of the walls. Watch your radar and keep that trigger finger loose. Don't stop shooting.",
  12: "Boss signature detected. Another heavy hitter guarding the elevator. Use your dash to evade its charges. Put it in the ground, soldier.",
  13: "Armored targets confirmed. 'Mummies' have high physical resistance. Sustained fire or explosives required. Don't waste pistol rounds on them.",
  14: "Multiple hostile types converging. Prioritize the Runners and Exploders. Manage your crowd control or you will be overrun.",
  15: "We're detecting high-grade weaponry schematics in this sector. Survive long enough and you might find a Railgun prototype. Make it count.",
  16: "Almost at the source. The horde is relentless here. No mercy. Kill anything that moves. We are not leaving anyone behind.",
  17: "The hive mind is agitated. They know you're here. Expect heavy resistance from all mutation types. Check your ammo reserves.",
  18: "This is it. The epicenter. Final containment protocol is in effect. Eliminate the Alpha Boss and seal the breach. It's do or die, soldier."
};

export const generateBriefing = async (level: LevelConfig): Promise<string> => {
  // Artificial delay to simulate "DECODING" effect on the retro terminal UI
  await new Promise(resolve => setTimeout(resolve, 600));

  if (MISSION_LOGS[level.id]) {
    return MISSION_LOGS[level.id];
  }

  // Fallback logic for levels outside the main 18 (e.g. Endless mode or future levels)
  const enemyDesc = level.enemyTypes.map(t => {
    if (t === EnemyType.RED) return "Fast Runners";
    if (t === EnemyType.MUMMY) return "Armored Tanks";
    if (t === EnemyType.EXPLODER) return "Explosives";
    if (t === EnemyType.SPITTER) return "Spitters";
    return "Shamblers";
  }).join(", ");

  return `Entering ${level.name}. Sensors detect ${enemyDesc}. Estimated hostiles: ${level.baseEnemyCount}. Neutralize all targets to proceed.`;
};
