import { useState, useEffect } from 'react';
import type { LobbyState, RoomListItem } from '@/hooks/useMultiplayer';

const CORNER_COLORS = [
  'hsl(160, 100%, 50%)',
  'hsl(280, 100%, 65%)',
  'hsl(30, 100%, 55%)',
];

const CORNER_LABELS = ['Top-Left', 'Top-Right', 'Bottom-Center'];

interface LobbyProps {
  phase: string;
  connected: boolean;
  lobby: LobbyState | null;
  rooms: RoomListItem[];
  roomId: string | null;
  mySlot: number | null;
  error: string | null;
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomId: string, name: string) => void;
  onSelectCorner: (slot: number) => void;
  onStartGame: () => void;
  onRefreshRooms: () => void;
  onConnect: () => void;
}

export default function Lobby({
  phase, connected, lobby, rooms, roomId, mySlot, error,
  onCreateRoom, onJoinRoom, onSelectCorner, onStartGame, onRefreshRooms, onConnect,
}: LobbyProps) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    onConnect();
  }, [onConnect]);

  useEffect(() => {
    if (connected && !roomId) {
      onRefreshRooms();
    }
  }, [connected, roomId, onRefreshRooms]);

  // Not connected yet
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-background">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-primary uppercase">
          Dorito Shooter
        </h1>
        <p className="text-muted-foreground font-mono">Connecting to server...</p>
        {error && <p className="text-red-400 font-mono text-sm">{error}</p>}
      </div>
    );
  }

  // Connected but not in a room
  if (!roomId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-background">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-primary uppercase">
          Dorito Shooter
        </h1>
        <p className="text-lg font-mono text-muted-foreground">Multiplayer Arena</p>

        {error && <p className="text-red-400 font-mono text-sm">{error}</p>}

        <div className="flex flex-col gap-4 w-80">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            className="px-4 py-2 rounded-lg bg-muted border border-border font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />

          <button
            onClick={() => onCreateRoom(name || 'Player')}
            disabled={!name.trim()}
            className="px-6 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create Room
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="flex-1 px-4 py-2 rounded-lg bg-muted border border-border font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary uppercase"
            />
            <button
              onClick={() => onJoinRoom(joinCode, name || 'Player')}
              disabled={!joinCode.trim() || !name.trim()}
              className="px-4 py-2 rounded-lg font-mono font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Join
            </button>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="w-80 mt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-mono text-muted-foreground">Open Rooms</p>
              <button
                onClick={onRefreshRooms}
                className="text-xs font-mono text-primary hover:text-primary/80"
              >
                Refresh
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {rooms.map((r) => (
                <button
                  key={r.roomId}
                  onClick={() => {
                    setJoinCode(r.roomId);
                    if (name.trim()) onJoinRoom(r.roomId, name || 'Player');
                  }}
                  className="flex items-center justify-between px-4 py-2 rounded-lg bg-muted border border-border font-mono hover:border-primary transition-colors"
                >
                  <span className="text-foreground">{r.roomId}</span>
                  <span className="text-muted-foreground text-sm">{r.players}/{r.maxPlayers}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // In lobby, selecting corners
  if (phase === 'lobby' && lobby) {
    const humanCount = lobby.slots.filter((s) => s.taken && s.playerName !== 'AI Player').length;
    const totalCount = lobby.slots.filter((s) => s.taken).length;
    const canStart = mySlot !== null && totalCount >= 2;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-background">
        <h1 className="text-3xl font-bold font-mono tracking-widest text-primary uppercase">
          Dorito Shooter
        </h1>

        <div className="flex items-center gap-3">
          <p className="text-muted-foreground font-mono">Room:</p>
          <span className="px-3 py-1 rounded bg-muted border border-border font-mono font-bold text-xl text-primary tracking-widest">
            {roomId}
          </span>
          <p className="text-muted-foreground font-mono text-sm">
            (share this code with friends)
          </p>
        </div>

        {error && <p className="text-red-400 font-mono text-sm">{error}</p>}

        <p className="text-muted-foreground font-mono text-sm">Pick your corner:</p>

        <div className="flex gap-4">
          {lobby.slots.map((slot, i) => {
            const isMe = mySlot === i;
            const taken = slot.taken && !isMe;
            return (
              <button
                key={i}
                onClick={() => !taken && onSelectCorner(i)}
                disabled={taken}
                className={`
                  flex flex-col items-center gap-2 px-6 py-4 rounded-xl border-2 font-mono transition-all
                  ${isMe
                    ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(0,255,180,0.2)]'
                    : taken
                      ? 'border-border bg-muted opacity-50 cursor-not-allowed'
                      : 'border-border bg-muted hover:border-primary/50 cursor-pointer'
                  }
                `}
              >
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: CORNER_COLORS[i], opacity: taken ? 0.3 : 1 }}
                />
                <span className="text-sm font-bold text-foreground">{CORNER_LABELS[i]}</span>
                <span className="text-xs text-muted-foreground">
                  {isMe ? 'You' : slot.taken ? slot.playerName : 'Open'}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-muted-foreground font-mono text-sm">
          {canStart
            ? `${totalCount} player${totalCount > 1 ? 's' : ''} ready!${humanCount < totalCount ? ' (with AI)' : ''}`
            : `Waiting for players... (${totalCount}/2 minimum)`
          }
        </p>

        <button
          onClick={onStartGame}
          disabled={!canStart}
          className="mt-2 px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Start Game
        </button>
      </div>
    );
  }

  return null;
}
