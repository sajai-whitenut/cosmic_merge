export interface CosmicBody {
  id: string;
  typeIndex: number; // 0 to N
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  isMerging?: boolean;
}

export interface GameState {
  score: number;
  highScore: number;
  status: 'START' | 'PLAYING' | 'GAMEOVER';
  nextTypeIndex: number;
}

export const BODY_TYPES = [
  { name: 'Asteroid', radius: 15, color: '#94a3b8', score: 2 },
  { name: 'Moon', radius: 25, color: '#cbd5e1', score: 4 },
  { name: 'Mars', radius: 35, color: '#f87171', score: 8 },
  { name: 'Earth', radius: 45, color: '#3b82f6', score: 16 },
  { name: 'Neptune', radius: 55, color: '#6366f1', score: 32 },
  { name: 'Saturn', radius: 70, color: '#fbbf24', score: 64 },
  { name: 'Jupiter', radius: 85, color: '#f97316', score: 128 },
  { name: 'Dwarf Star', radius: 100, color: '#ef4444', score: 256 },
  { name: 'Giant Star', radius: 120, color: '#facc15', score: 512 },
  { name: 'Supernova', radius: 140, color: '#ffffff', score: 1024 },
];
