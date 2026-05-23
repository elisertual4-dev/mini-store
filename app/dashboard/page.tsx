export default function DashboardPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white shadow rounded p-4">
          <h2 className="text-gray-500 text-sm">Total Sales Today</h2>
          <p className="text-2xl font-bold">—</p>
        </div>
        <div className="bg-white shadow rounded p-4">
          <h2 className="text-gray-500 text-sm">Transactions</h2>
          <p className="text-2xl font-bold">—</p>
        </div>
        <div className="bg-white shadow rounded p-4">
          <h2 className="text-gray-500 text-sm">Low Stock Items</h2>
          <p className="text-2xl font-bold">—</p>
        </div>
      </div>
    </main>
  )
}
