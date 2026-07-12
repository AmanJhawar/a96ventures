import Link from 'next/link'
import { Activity } from 'lucide-react'

export default function NavBar() {
  return (
    <nav className="border-b border-gray-200/60 bg-white/70 backdrop-blur-2xl sticky top-0 z-50">
      <div className="absolute inset-x-0 top-0 h-px bg-white/40"></div>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between relative">
        <Link href="/admin/screener" className="flex items-center gap-2 btn-press">
          <Activity className="w-5 h-5 text-black" />
          <h1 className="text-sm font-bold tracking-widest text-gray-900 uppercase">
            A96 Screener
          </h1>
        </Link>
        <div className="flex gap-6">
          <Link href="/admin/screener" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-wider">Latest</Link>
          <Link href="/admin/screener/watchlist" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-wider">Watchlist</Link>
          <Link href="/admin/screener/log" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-wider">Logs</Link>
        </div>
      </div>
    </nav>
  )
}
