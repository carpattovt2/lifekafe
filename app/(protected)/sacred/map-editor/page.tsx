import dynamic from 'next/dynamic'

const MapEditor = dynamic(() => import('@/components/sacred/MapEditor'), { ssr: false })

export default function MapEditorPage() {
  return <MapEditor />
}
