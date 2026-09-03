import { useCallback, useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  onSample?: () => void
  compact?: boolean
}

export function FileDrop({ onFile, onSample, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    onFile(files[0])
  }, [onFile])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed transition-colors ${
        over ? 'border-sky-400 bg-sky-400/10' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/40'
      } ${compact ? 'p-3' : 'p-10'} text-center`}
    >
      <input ref={inputRef} type="file" accept=".stl,.obj" className="hidden" onChange={(e) => handle(e.target.files)} />
      {compact ? (
        <p className="text-sm text-zinc-300">Başka bir dosya yüklemek için tıklayın veya sürükleyin</p>
      ) : (
        <>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-2xl">📦</div>
          <p className="text-lg font-medium text-zinc-100">STL dosyanızı buraya sürükleyin</p>
          <p className="mt-1 text-sm text-zinc-400">veya tıklayarak seçin · .stl (binary/ASCII), .obj · en fazla 200 MB</p>
          <p className="mt-3 text-xs text-zinc-500">Dosyanız tarayıcınızdan dışarı çıkmaz; tüm hesaplama cihazınızda yapılır.</p>
          {onSample && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onSample() }} className="mt-4 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
              Örnek modelle dene (piyon, 71 mm)
            </button>
          )}
        </>
      )}
    </div>
  )
}
