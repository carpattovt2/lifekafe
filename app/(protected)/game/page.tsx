import dynamic from 'next/dynamic'

const GameMenu = dynamic(() => import('@/components/game/GameMenu'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#6b7280', fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
      Loading...
    </div>
  ),
})

export default function GamePage() {
  return <GameMenu />
}
