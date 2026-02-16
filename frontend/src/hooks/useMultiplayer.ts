import { useRef, useState, useCallback, useEffect } from 'react';
import type { GameState } from '@/game/types';

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev mode, Vite serves on a different port than the game server.
  // Connect directly to the EC2 backend. In production the frontend
  // is served by the same server, so window.location.host works.
  if (import.meta.env.DEV) {
    return 'ws://52.15.179.179:8080';
  }
  return `${protocol}//${window.location.host}`;
}

export interface SlotInfo {
  slot: number;
  corner: string;
  taken: boolean;
  playerName: string | null;
}

export interface LobbyState {
  roomId: string;
  slots: SlotInfo[];
  phase: 'lobby' | 'playing' | 'ended';
}

export interface RoomListItem {
  roomId: string;
  players: number;
  maxPlayers: number;
}

type Phase = 'disconnected' | 'connected' | 'lobby' | 'playing' | 'ended';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];

export function useMultiplayer() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const intentionalClose = useRef(false);

  const [phase, setPhase] = useState<Phase>('disconnected');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    intentionalClose.current = false;
    setError(null);

    const url = getWsUrl();
    console.log(`Connecting to ${url}...`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setPhase('connected');
      setConnected(true);
      setError(null);
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'welcome':
          setPlayerId(msg.playerId);
          break;
        case 'room_list':
          setRooms(msg.rooms);
          break;
        case 'room_joined':
          setRoomId(msg.roomId);
          setPhase('lobby');
          break;
        case 'lobby_state':
          setLobby(msg as LobbyState);
          if (msg.phase === 'lobby') setPhase('lobby');
          break;
        case 'game_start':
          setGameState(msg.state);
          setPhase('playing');
          setWinner(null);
          break;
        case 'state_update':
          setGameState(msg.state);
          break;
        case 'game_over':
          setWinner(msg.winner);
          setPhase('ended');
          break;
        case 'error':
          setError(msg.message);
          setTimeout(() => setError(null), 4000);
          break;
      }
    };

    ws.onclose = () => {
      setPhase('disconnected');
      setConnected(false);
      wsRef.current = null;

      if (!intentionalClose.current) {
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];
        console.log(`Connection lost. Reconnecting in ${delay}ms...`);
        setError(`Connection lost. Reconnecting...`);
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempt.current++;
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      setError('Could not connect to game server');
      setConnected(false);
    };
  }, []);

  const disconnect = useCallback(() => {
    intentionalClose.current = true;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setPhase('disconnected');
    setConnected(false);
    setRoomId(null);
    setLobby(null);
    setGameState(null);
    setWinner(null);
    setMySlot(null);
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const createRoom = useCallback((name: string) => {
    send({ type: 'create_room', name });
  }, [send]);

  const joinRoom = useCallback((targetRoomId: string, name: string) => {
    send({ type: 'join_room', roomId: targetRoomId, name });
  }, [send]);

  const selectCorner = useCallback((slot: number) => {
    setMySlot(slot);
    send({ type: 'select_corner', slot });
  }, [send]);

  const startGame = useCallback(() => {
    send({ type: 'start_game' });
  }, [send]);

  const sendInput = useCallback((forward: number, rotate: number, shooting: boolean) => {
    send({ type: 'input', forward, rotate, shoot: shooting });
  }, [send]);

  const refreshRooms = useCallback(() => {
    send({ type: 'list_rooms' });
  }, [send]);

  const sendAirstrike = useCallback(() => {
    send({ type: 'airstrike' });
  }, [send]);

  const sendGodMode = useCallback(() => {
    send({ type: 'god_mode' });
  }, [send]);

  const restart = useCallback(() => {
    send({ type: 'restart' });
    setWinner(null);
    setGameState(null);
    setPhase('lobby');
  }, [send]);

  useEffect(() => {
    return () => {
      intentionalClose.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return {
    phase, playerId, roomId, lobby, gameState, winner, rooms, error, mySlot, connected,
    connect, disconnect, createRoom, joinRoom, selectCorner, startGame,
    sendInput, sendAirstrike, sendGodMode, refreshRooms, restart,
  };
}
