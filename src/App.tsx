import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Zap, Sparkles, Binary, CircleDot, Info, Settings, Pause, Volume2, VolumeX, X, ChevronRight } from 'lucide-react';
import { CosmicBody, GameState, BODY_TYPES } from './types';
import { 
  CONTAINER_WIDTH, 
  CONTAINER_HEIGHT, 
  GRAVITY, 
  FRICTION, 
  BOUNCE, 
  DROP_Y,
  SPAWN_DELAY,
  GAME_OVER_Y
} from './constants';

const CosmicMerge: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    highScore: parseInt(localStorage.getItem('cosmic-high-score') || '0'),
    status: 'START',
    nextTypeIndex: Math.floor(Math.random() * 4),
  });

  const [bodies, setBodies] = useState<CosmicBody[]>([]);
  const [droppingBody, setDroppingBody] = useState<{ x: number, typeIndex: number } | null>(null);
  const [canDrop, setCanDrop] = useState(true);
  const [mousePos, setMousePos] = useState(CONTAINER_WIDTH / 2);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [shake, setShake] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const bodiesRef = useRef<CosmicBody[]>([]);
  const particlesRef = useRef<{ id: number, x: number, y: number, color: string, vx: number, vy: number, life: number }[]>([]);

  // Sound Engine
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playMergeSound = useCallback((typeIndex: number) => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
      const freq = notes[typeIndex % notes.length];
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {}
  }, []);

  const gameOver = useCallback(() => {
    if (gameState.status !== 'PLAYING') return;
    setGameState(prev => {
      const newHighScore = Math.max(prev.score, prev.highScore);
      localStorage.setItem('cosmic-high-score', newHighScore.toString());
      return { ...prev, status: 'GAMEOVER', highScore: newHighScore };
    });
    playMergeSound(0);
  }, [gameState.status, playMergeSound]);

  const spawnParticle = (x: number, y: number, color: string) => {
    for (let i = 0; i < 8; i++) {
      particlesRef.current.push({
        id: Math.random(),
        x,
        y,
        color,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1.0
      });
    }
  };

  const startGame = () => {
    setGameState(prev => ({ 
      ...prev, 
      status: 'PLAYING', 
      score: 0, 
      nextTypeIndex: Math.floor(Math.random() * 4) 
    }));
    setBodies([]);
    bodiesRef.current = [];
    particlesRef.current = [];
    setCanDrop(true);
    setDroppingBody({ x: CONTAINER_WIDTH / 2, typeIndex: Math.floor(Math.random() * 4) });
  };

  const handleDrop = () => {
    if (gameState.status !== 'PLAYING' || !canDrop || !droppingBody) return;

    const typeIdx = droppingBody.typeIndex;
    const newBody: CosmicBody = {
      id: Math.random().toString(36).substr(2, 9),
      typeIndex: typeIdx,
      x: droppingBody.x,
      y: DROP_Y,
      vx: 0,
      vy: 1,
      radius: BODY_TYPES[typeIdx].radius,
      rotation: 0,
    };

    bodiesRef.current.push(newBody);
    setBodies([...bodiesRef.current]);
    setCanDrop(false);
    setDroppingBody(null);

    setTimeout(() => {
      setGameState(s => {
        if (s.status === 'PLAYING') {
          const nextIdx = s.nextTypeIndex;
          setDroppingBody({ x: mousePos, typeIndex: nextIdx });
          setCanDrop(true);
          return { ...s, nextTypeIndex: Math.floor(Math.random() * 4) };
        }
        return s;
      });
    }, SPAWN_DELAY);
  };

  const physicsUpdate = useCallback(() => {
    if (gameState.status !== 'PLAYING' || isPaused) return;

    // Decay shake
    if (shake > 0) setShake(s => Math.max(0, s - 1));

    const currentBodies = [...bodiesRef.current];
    const mergesToAdd: CosmicBody[] = [];
    const idsToRemove = new Set<string>();

    // 1. Gravity and Walls
    for (const b of currentBodies) {
      if (b.isMerging) continue;
      b.vy += GRAVITY;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      b.x += b.vx;
      b.y += b.vy;

      if (b.x < b.radius) {
        b.x = b.radius;
        b.vx *= -BOUNCE;
      } else if (b.x > CONTAINER_WIDTH - b.radius) {
        b.x = CONTAINER_WIDTH - b.radius;
        b.vx *= -BOUNCE;
      }

      if (b.y > CONTAINER_HEIGHT - b.radius) {
        b.y = CONTAINER_HEIGHT - b.radius;
        b.vy *= -BOUNCE;
        b.vx *= 0.95; // Extra ground friction
      }
    }

    // 2. Collision & Merging
    for (let i = 0; i < currentBodies.length; i++) {
      for (let j = i + 1; j < currentBodies.length; j++) {
        const b1 = currentBodies[i];
        const b2 = currentBodies[j];
        if (b1.isMerging || b2.isMerging) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = b1.radius + b2.radius;

        if (dist < minDist) {
          if (b1.typeIndex === b2.typeIndex && b1.typeIndex < BODY_TYPES.length - 1) {
            idsToRemove.add(b1.id);
            idsToRemove.add(b2.id);
            b1.isMerging = true;
            b2.isMerging = true;

            const nextIndex = b1.typeIndex + 1;
            mergesToAdd.push({
              id: `merge-${Date.now()}-${Math.random()}`,
              typeIndex: nextIndex,
              x: (b1.x + b2.x) / 2,
              y: (b1.y + b2.y) / 2,
              vx: (b1.vx + b2.vx) / 2,
              vy: (b1.vy + b2.vy) / 2,
              radius: BODY_TYPES[nextIndex].radius,
              rotation: 0
            });

            setGameState(s => ({ ...s, score: s.score + BODY_TYPES[nextIndex].score }));
            playMergeSound(nextIndex);
            spawnParticle((b1.x + b2.x) / 2, (b1.y + b2.y) / 2, BODY_TYPES[nextIndex].color);
            
            // Screen shake
            setShake(prev => prev + (nextIndex + 1) * 2);

            // Haptic feedback
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate(20);
            }
            continue;
          }

          // Elastic collision resolution
          const angle = Math.atan2(dy, dx);
          const overlap = minDist - dist;
          const moveX = Math.cos(angle) * (overlap / 2);
          const moveY = Math.sin(angle) * (overlap / 2);
          b1.x -= moveX;
          b1.y -= moveY;
          b2.x += moveX;
          b2.y += moveY;

          const nx = dx / dist;
          const ny = dy / dist;
          const p = (b1.vx * nx + b1.vy * ny - (b2.vx * nx + b2.vy * ny));
          b1.vx -= p * nx * 0.5;
          b1.vy -= p * ny * 0.5;
          b2.vx += p * nx * 0.5;
          b2.vy += p * ny * 0.5;
        }
      }
    }

    const filtered = currentBodies.filter(b => !idsToRemove.has(b.id));
    bodiesRef.current = [...filtered, ...mergesToAdd];
    setBodies([...bodiesRef.current]);

    particlesRef.current = particlesRef.current.map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      life: p.life - 0.02
    })).filter(p => p.life > 0);

    // Game Over check
    const isOverflowing = bodiesRef.current.some(b => b.y < GAME_OVER_Y && b.vy < 0.2 && b.id.indexOf('merge') === -1);
    if (isOverflowing && bodiesRef.current.length > 5) {
      gameOver();
    }

    requestRef.current = requestAnimationFrame(physicsUpdate);
  }, [gameState.status, playMergeSound, gameOver]);

  useEffect(() => {
    if (gameState.status === 'PLAYING') {
      requestRef.current = requestAnimationFrame(physicsUpdate);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState.status, physicsUpdate]);

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current || gameState.status !== 'PLAYING') return;
    const rect = containerRef.current.getBoundingClientRect();
    let x = 0;
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
    } else {
      x = e.clientX - rect.left;
    }
    const radius = droppingBody ? BODY_TYPES[droppingBody.typeIndex].radius : 20;
    x = Math.max(radius, Math.min(CONTAINER_WIDTH - radius, x));
    setMousePos(x);
    if (droppingBody) setDroppingBody({ ...droppingBody, x });
  };

  return (
    <div 
      className="relative w-full h-screen overflow-hidden bg-[#020617] flex items-center justify-center font-sans select-none touch-none"
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
      onClick={handleDrop}
    >
      <motion.div 
        className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-950/20 to-transparent"
        animate={shake > 0 ? {
          x: [0, (Math.random() - 0.5) * shake, 0],
          y: [0, (Math.random() - 0.5) * shake, 0],
        } : { x: 0, y: 0 }}
        transition={{ duration: 0.1 }}
      />
      
      <div 
        ref={containerRef}
        className="relative shadow-2xl border-x-4 border-b-4 border-white/5 bg-slate-900/40 backdrop-blur-md"
        style={{ width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT }}
      >
        <div className="absolute top-[150px] w-full h-[2px] bg-red-500/20 border-t border-dashed border-red-500/40 pointer-events-none flex items-center justify-center">
           <span className="text-[10px] font-black tracking-widest text-red-500/50 uppercase">ATMOSPHERE LIMIT</span>
        </div>

        {droppingBody && canDrop && (
          <div 
            className="absolute top-0 bottom-0 w-[1px] bg-gradient-to-b from-white/20 to-transparent pointer-events-none"
            style={{ left: droppingBody.x }}
          />
        )}

        <div className="absolute -top-16 right-0 p-4 flex flex-col items-end gap-2">
           <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em]">UPCOMING</span>
           <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5">
              <div 
                className="rounded-full shadow-lg"
                style={{ 
                  width: BODY_TYPES[gameState.nextTypeIndex].radius * 0.4, 
                  height: BODY_TYPES[gameState.nextTypeIndex].radius * 0.4,
                  backgroundColor: BODY_TYPES[gameState.nextTypeIndex].color,
                }}
              />
           </div>
        </div>

        {droppingBody && (
          <div
            className="absolute pointer-events-none"
            style={{ 
              left: droppingBody.x - BODY_TYPES[droppingBody.typeIndex].radius,
              top: DROP_Y - BODY_TYPES[droppingBody.typeIndex].radius,
              width: BODY_TYPES[droppingBody.typeIndex].radius * 2,
              height: BODY_TYPES[droppingBody.typeIndex].radius * 2,
              backgroundColor: BODY_TYPES[droppingBody.typeIndex].color,
              borderRadius: '50%',
              boxShadow: `0 0 30px ${BODY_TYPES[droppingBody.typeIndex].color}44`
            }}
          />
        )}

        {bodies.map(body => (
          <motion.div
            key={body.id}
            layoutId={body.id}
            className="absolute rounded-full flex items-center justify-center"
            style={{
              left: body.x - body.radius,
              top: body.y - body.radius,
              width: body.radius * 2,
              height: body.radius * 2,
              backgroundColor: BODY_TYPES[body.typeIndex].color,
              boxShadow: `inset 0 4px 10px rgba(255,255,255,0.4), 0 0 ${body.radius*0.5}px ${BODY_TYPES[body.typeIndex].color}33`,
            }}
          >
             <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 via-transparent to-black/20 pointer-events-none" />
          </motion.div>
        ))}

        <svg className="absolute inset-0 pointer-events-none w-full h-full">
           {particlesRef.current.map(p => (
             <circle 
                key={p.id} cx={p.x} cy={p.y} r={2 * p.life} fill={p.color} style={{ opacity: p.life }}
            />
           ))}
        </svg>
      </div>

      <div className="absolute left-4 right-4 top-4 lg:top-auto lg:left-10 lg:right-auto lg:bottom-auto flex flex-row lg:flex-col items-center lg:items-start justify-between lg:justify-start gap-4 lg:gap-6 pointer-events-none z-30">
         <div className="flex flex-col">
            <span className="text-[8px] lg:text-[10px] font-black text-indigo-400/50 tracking-[0.4em] uppercase leading-none mb-1">COLLECTED MASS</span>
            <div className="text-3xl lg:text-8xl font-black italic tracking-tighter text-white leading-none">
               {gameState.score}
            </div>
         </div>
         <div className="flex flex-row items-center gap-3">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl w-fit backdrop-blur-md">
               <Trophy className="w-3 h-3 lg:w-4 lg:h-4 text-amber-400" />
               <span className="text-[8px] lg:text-xs font-bold text-white/50 tracking-widest uppercase">RECORD: {gameState.highScore}</span>
            </div>
            
            {gameState.status === 'PLAYING' && (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsPaused(true); }}
                className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md hover:bg-white/10 transition-colors"
              >
                <Settings className="w-4 h-4 text-white" />
              </button>
            )}
         </div>
      </div>

      <AnimatePresence>
         {isPaused && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[110] bg-slate-950/90 backdrop-blur-lg flex items-center justify-center p-6">
              <div className="bg-white/5 border border-white/10 p-10 rounded-[3rem] w-full max-w-md flex flex-col items-center">
                 <div className="flex items-center justify-between w-full mb-10">
                    <h2 className="text-4xl font-black italic tracking-tighter text-white">ORBITAL MENU</h2>
                    <button onClick={() => setIsPaused(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                       <X className="w-6 h-6 text-white" />
                    </button>
                 </div>

                 <div className="flex flex-col w-full gap-4 mb-10">
                    <button 
                      onClick={() => setIsMuted(!isMuted)}
                      className="flex items-center justify-between w-full p-6 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 transition-all"
                    >
                       <div className="flex items-center gap-4">
                          {isMuted ? <VolumeX className="w-6 h-6 text-rose-500" /> : <Volume2 className="w-6 h-6 text-cyan-400" />}
                          <span className="font-bold tracking-widest uppercase text-sm">AUDIO ENGINE</span>
                       </div>
                       <span className="text-xs font-black text-white/40">{isMuted ? 'DISABLED' : 'ACTIVE'}</span>
                    </button>

                    <button 
                      onClick={() => { setIsPaused(false); startGame(); }}
                      className="flex items-center justify-between w-full p-6 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 transition-all text-amber-400"
                    >
                       <div className="flex items-center gap-4">
                          <RotateCcw className="w-6 h-6" />
                          <span className="font-bold tracking-widest uppercase text-sm">REBOOT MISSION</span>
                       </div>
                       <ChevronRight className="w-4 h-4 opacity-40" />
                    </button>
                 </div>

                 <motion.button
                   whileHover={{ scale: 1.05 }}
                   whileTap={{ scale: 0.95 }}
                   onClick={() => setIsPaused(false)}
                   className="w-full py-5 bg-white text-slate-950 rounded-[2rem] font-black italic tracking-tighter uppercase text-xl shadow-2xl flex items-center justify-center gap-3"
                 >
                    <Play className="w-6 h-6 fill-current" /> RESUME MISSION
                 </motion.button>
              </div>
           </motion.div>
         )}

         {gameState.status === 'START' && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center">
              <h1 className="text-7xl font-black italic tracking-tighter text-white mb-12 text-center uppercase">COSMIC<br/><span className="text-indigo-400">MERGE</span></h1>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={startGame} className="px-12 py-5 bg-white text-slate-950 rounded-[2rem] font-black italic tracking-tighter uppercase text-xl shadow-2xl flex items-center gap-4">
                 <Play className="w-6 h-6 fill-current" /> START MISSION
              </motion.button>
           </motion.div>
         )}

         {gameState.status === 'GAMEOVER' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[100] bg-red-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
               <h2 className="text-6xl font-black italic tracking-tighter text-white mb-8">MAXIMUM MASS REACHED</h2>
               <div className="bg-white/5 p-12 rounded-[3.5rem] mb-12"><span className="text-xs font-black text-white/30 uppercase tracking-widest">FINAL SCORE</span><div className="text-9xl font-black text-white">{gameState.score}</div></div>
               <button onClick={startGame} className="px-12 py-5 bg-white text-red-950 rounded-[2rem] font-black italic tracking-tighter text-xl shadow-2xl flex items-center gap-4"><RotateCcw className="w-6 h-6" /> RETRY MISSION</button>
            </motion.div>
         )}
      </AnimatePresence>
    </div>
  );
};

export default CosmicMerge;
