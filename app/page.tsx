import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Mini Store</h1>
      <nav className="flex gap-4">
        <Link href="/dashboard" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Dashboard</Link>
        <Link href="/scan" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Scan</Link>
        <Link href="/inventory" className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700">Inventory</Link>
        <Link href="/reports" className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Reports</Link>
      </nav>
    </main>
  )
}
