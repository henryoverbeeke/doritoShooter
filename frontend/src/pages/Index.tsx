import Game from '@/components/Game';
import Lobby from '@/components/Lobby';
import { useMultiplayer } from '@/hooks/useMultiplayer';

const Index = () => {
  const mp = useMultiplayer();

  if (mp.phase === 'playing' || mp.phase === 'ended') {
    if (mp.gameState) {
      return (
        <Game
          gameState={mp.gameState}
          mySlot={mp.mySlot ?? 0}
          winner={mp.winner}
          phase={mp.phase}
          onInput={mp.sendInput}
          onAirstrike={mp.sendAirstrike}
          onGodMode={mp.sendGodMode}
          onRestart={mp.restart}
        />
      );
    }
  }

  return (
    <Lobby
      phase={mp.phase}
      connected={mp.connected}
      lobby={mp.lobby}
      rooms={mp.rooms}
      roomId={mp.roomId}
      mySlot={mp.mySlot}
      error={mp.error}
      onCreateRoom={mp.createRoom}
      onJoinRoom={mp.joinRoom}
      onSelectCorner={mp.selectCorner}
      onStartGame={mp.startGame}
      onRefreshRooms={mp.refreshRooms}
      onConnect={mp.connect}
    />
  );
};

export default Index;
