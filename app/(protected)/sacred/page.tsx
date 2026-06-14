import dynamic from 'next/dynamic'

const SacredGame = dynamic(() => import('@/components/sacred/SacredGame'), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: '100vh', background: '#0e0d0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
      Loading...
    </div>
  ),
})

export default function SacredPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0e0d0b' }}>
      <SacredGame />
    </div>
  )
}
