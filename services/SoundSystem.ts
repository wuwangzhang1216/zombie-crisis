class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  public init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // Master volume
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playOscillator(
    type: OscillatorType, 
    freqStart: number, 
    freqEnd: number, 
    duration: number, 
    vol: number = 1
  ) {
    if (!this.ctx || !this.masterGain) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
    
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number) {
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    noise.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start();
  }

  public playShoot(type: 'pistol' | 'shotgun' | 'flame') {
    if (!this.ctx) return;

    if (type === 'pistol') {
      this.playOscillator('square', 400, 100, 0.1, 0.5);
    } else if (type === 'shotgun') {
      this.playOscillator('sawtooth', 150, 50, 0.2, 0.6);
      this.playNoise(0.15);
    } else if (type === 'flame') {
      this.playNoise(0.05); // Continuous short bursts loop
    }
  }

  public playEnemyHit() {
    this.playOscillator('sawtooth', 100, 50, 0.05, 0.3);
  }

  public playPlayerHit() {
    this.playOscillator('sawtooth', 50, 20, 0.3, 0.8);
  }

  public playPickup(type: 'health' | 'ammo' | 'nuke') {
    if (type === 'health') {
      this.playOscillator('sine', 400, 600, 0.1, 0.5);
      setTimeout(() => this.playOscillator('sine', 600, 800, 0.1, 0.5), 100);
    } else if (type === 'nuke') {
      this.playNoise(1.5);
      this.playOscillator('sawtooth', 50, 10, 1.5, 0.5);
    } else {
      this.playOscillator('square', 800, 1200, 0.15, 0.4);
    }
  }
}

export const soundSystem = new SoundSystem();