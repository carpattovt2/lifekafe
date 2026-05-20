import JokerGame from '@/components/game/JokerGame'

export default function OnlineRoomPage({ params }: { params: { roomId: string } }) {
  return <JokerGame mode="online" roomId={params.roomId} />
}
