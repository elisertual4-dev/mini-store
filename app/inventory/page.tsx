export default function InventoryPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Inventory</h1>
      <table className="w-full border-collapse border border-gray-200 text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-200 px-4 py-2 text-left">Product</th>
            <th className="border border-gray-200 px-4 py-2 text-left">Barcode</th>
            <th className="border border-gray-200 px-4 py-2 text-right">Stock</th>
            <th className="border border-gray-200 px-4 py-2 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4} className="text-center py-8 text-gray-400">No products yet</td>
          </tr>
        </tbody>
      </table>
    </main>
  )
}
