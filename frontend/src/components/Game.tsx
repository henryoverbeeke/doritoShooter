import { useEffect, useRef, useState } from 'react';
import { render } from '@/game/renderer';
import { GameState, CANVAS_W, CANVAS_H } from '@/game/types';

const KEYS = new Set<string>();

interface GameProps {
  gameState: GameState;
  mySlot: number;
  winner: number | null;
  phase: string;
  onInput: (forward: number, rotate: number, shoot: boolean) => void;
  onAirstrike: () => void;
  onGodMode: () => void;
  onRestart: () => void;
}

export default function Game({ gameState, mySlot, winner, phase, onInput, onAirstrike, onGodMode, onRestart }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef<GameState>(gameState);
  const phaseRef = useRef(phase);
  const onInputRef = useRef(onInput);
  const onAirstrikeRef = useRef(onAirstrike);
  const onGodModeRef = useRef(onGodMode);
  const onRestartRef = useRef(onRestart);
  const keySequence = useRef<string[]>([]);
  const laserSequence = useRef<string[]>([]);
  const missileSequence = useRef<string[]>([]);
  const [airstrikeReady, setAirstrikeReady] = useState(true);

  stateRef.current = gameState;
  phaseRef.current = phase;
  onInputRef.current = onInput;
  onAirstrikeRef.current = onAirstrike;
  onGodModeRef.current = onGodMode;
  onRestartRef.current = onRestart;

  // Track if our player has used their airstrike
  useEffect(() => {
    const me = gameState.players.find((p) => p.id === mySlot);
    if (me && 'airstrikeUsed' in me) {
      setAirstrikeReady(!me.airstrikeUsed);
    }
  }, [gameState, mySlot]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      KEYS.add(e.key.toLowerCase());

      if (e.key.toLowerCase() === 'r' && phaseRef.current === 'ended') {
        onRestartRef.current();
      }

      // Detect "1234" for airstrike
      const AIRSTRIKE_CODE = ['1', '2', '3', '4'];
      if (AIRSTRIKE_CODE.includes(e.key)) {
        keySequence.current.push(e.key);
        if (keySequence.current.length > 4) {
          keySequence.current = keySequence.current.slice(-4);
        }
        if (keySequence.current.length === 4 &&
            keySequence.current.every((k, i) => k === AIRSTRIKE_CODE[i]) &&
            phaseRef.current === 'playing') {
          onAirstrikeRef.current();
          keySequence.current = [];
        }
      } else {
        keySequence.current = [];
      }

      // Detect "67" for laser
      const LASER_CODE = ['6', '7'];
      if (LASER_CODE.includes(e.key)) {
        laserSequence.current.push(e.key);
        if (laserSequence.current.length > 2) {
          laserSequence.current = laserSequence.current.slice(-2);
        }
        if (laserSequence.current.length === 2 &&
            laserSequence.current.every((k, i) => k === LASER_CODE[i]) &&
            phaseRef.current === 'playing') {
          onGodModeRef.current();
          laserSequence.current = [];
        }
      } else {
        laserSequence.current = [];
      }

      // Detect "333" for missile strike (alias of airstrike)
      if (e.key === '3') {
        missileSequence.current.push('3');
        if (missileSequence.current.length > 3) {
          missileSequence.current = missileSequence.current.slice(-3);
        }
        // Check if we have three 3's in a row
        if (
          missileSequence.current.length === 3 &&
          missileSequence.current[0] === '3' &&
          missileSequence.current[1] === '3' &&
          missileSequence.current[2] === '3' &&
          phaseRef.current === 'playing'
        ) {
          console.log('🚀 Missile attack triggered (333)!');
          onAirstrikeRef.current();
          missileSequence.current = [];
        }
      } else if (e.key !== '3') {
        // Only reset if it's not a 3
        missileSequence.current = [];
      }
    };
    const onUp = (e: KeyboardEvent) => KEYS.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      if (phaseRef.current === 'playing') {
        let fwd = 0, rot = 0;
        if (KEYS.has('w')) fwd = 1;
        if (KEYS.has('s')) fwd = -1;
        if (KEYS.has('a')) rot = -1;
        if (KEYS.has('d')) rot = 1;
        const shooting = KEYS.has(' ');
        onInputRef.current(fwd, rot, shooting);
      }

      render(ctx, stateRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const CORNER_COLORS = [
    'hsl(160, 100%, 50%)',
    'hsl(280, 100%, 65%)',
    'hsl(30, 100%, 55%)',
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background select-none">
      <h1 className="text-2xl font-bold font-mono tracking-widest text-primary uppercase">
        Dorito Shooter
      </h1>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="rounded-lg border border-border shadow-[0_0_40px_rgba(0,255,180,0.15)]"
      />
      <div className="flex gap-6 text-sm font-mono text-muted-foreground">
        <span><kbd className="px-1 border border-border rounded text-primary">W</kbd><kbd className="px-1 border border-border rounded text-primary">A</kbd><kbd className="px-1 border border-border rounded text-primary">S</kbd><kbd className="px-1 border border-border rounded text-primary">D</kbd> Move</span>
        <span><kbd className="px-1 border border-border rounded text-primary">Space</kbd> Shoot</span>
        {phase === 'ended' && (
          <span><kbd className="px-1 border border-border rounded text-primary">R</kbd> Back to Lobby</span>
        )}
      </div>
      <div className="flex gap-4 text-xs font-mono">
        {gameState.players.map((p) => (
          <span key={p.id} style={{ color: CORNER_COLORS[p.id] }}>
            {p.id === mySlot ? '● You' : `● Player ${p.id + 1}`}
          </span>
        ))}
      </div>
      {phase === 'ended' && winner !== null && (
        <p className="text-lg font-mono font-bold mt-2" style={{ color: CORNER_COLORS[winner] || '#fff' }}>
          {winner === mySlot ? 'You win!' : winner >= 0 ? `Player ${winner + 1} wins!` : 'Draw!'}
        </p>
      )}
    </div>
  );
}
