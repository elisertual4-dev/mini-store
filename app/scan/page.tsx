'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BrowserMultiFormatReader } from '@zxing/browser'

type Mode = 'sale' | 'restock'
type ScanState = 'idle' | 'scanning' | 'found'

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('sale')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => { controlsRef.current?.stop() }
  }, [])

  function handleBarcode(barcode: string) {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanState('found')
    setTimeout(() => {
      router.push(`/${mode}?barcode=${encodeURIComponent(barcode)}`)
    }, 700)
  }

  async function startScan() {
    setError(null)
    setScanState('scanning')
    try {
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, err) => {
          if (result) handleBarcode(result.getText())
          if (err && !(err.message?.includes('No MultiFormat'))) {
            // suppress continuous not-found errors
          }
        }
      )
      controlsRef.current = controls
    } catch (e: unknown) {
      setError((e as Error).message)
      setScanState('idle')
    }
  }

  const scanning = scanState === 'scanning'
  const found = scanState === 'found'
  const idle = scanState === 'idle'

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 gap-4">
      <h1 className="text-xl font-bold mt-2">Barcode Scanner</h1>

      <div className="flex rounded-full overflow-hidden border border-gray-700 w-full max-w-xs">
        <Link
          href="/dashboard"
          onClick={() => controlsRef.current?.stop()}
          className="flex-1 py-2 text-sm font-semibold text-center text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors border-r border-gray-700"
        >
          Dashboard
        </Link>
        <button
          onClick={() => { setMode('sale'); setError(null) }}
          disabled={!idle}
          className={`flex-1 py-2 text-sm font-semibold transition-colors border-r border-gray-700 ${mode === 'sale' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'} disabled:opacity-60`}
        >
          Sale
        </button>
        <button
          onClick={() => { setMode('restock'); setError(null) }}
          disabled={!idle}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'restock' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'} disabled:opacity-60`}
        >
          Restock
        </button>
      </div>

      {/* Camera viewport */}
      <div className="w-full max-w-xs aspect-square bg-black rounded-xl overflow-hidden relative">
        <video ref={videoRef} className="w-full h-full object-cover" />

        {/* Idle: tap to scan */}
        {idle && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <button
              onClick={startScan}
              className="bg-white text-black font-bold px-6 py-3 rounded-full text-sm shadow-lg"
            >
              Tap to Scan
            </button>
          </div>
        )}

        {/* Scanning: animated border + corner guides */}
        {scanning && (
          <>
            <div className="absolute inset-0 border-4 border-blue-400 rounded-xl pointer-events-none animate-pulse" />
            {/* corner guides */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-md" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-md" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-md" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-md" />
          </>
        )}

        {/* Found: green flash */}
        {found && (
          <>
            <div className="absolute inset-0 border-4 border-green-400 rounded-xl pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-green-400 font-bold text-sm">Barcode Found!</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Status bar below camera */}
      <div className="w-full max-w-xs h-8 flex items-center justify-center">
        {scanning && (
          <p className="text-blue-400 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block" />
            Scanning for barcode…
          </p>
        )}
        {found && (
          <p className="text-green-400 text-sm font-semibold">
            Redirecting…
          </p>
        )}
      </div>

      <form
        className="w-full max-w-xs flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = (e.currentTarget.elements.namedItem('barcode') as HTMLInputElement).value
          if (v) handleBarcode(v)
        }}
      >
        <input
          name="barcode"
          type="text"
          placeholder="Enter barcode manually"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-gray-700 px-4 py-2 rounded text-sm">Go</button>
      </form>

      {mode === 'restock' && idle && (
        <div className="w-full max-w-xs">
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-600">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>
          <button
            onClick={() => router.push('/new-product')}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            Add New Product (Take Photo)
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </main>
  )
}
