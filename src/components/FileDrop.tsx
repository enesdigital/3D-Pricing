import { useCallback, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n/index.tsx'

interface Props {
  onFile: (file: File) => void
  onSample?: () => void
  compact?: boolean
}

export function FileDrop({ onFile, onSample, compact }: Props) {
  const { t } = useI18n()
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
      <input ref={inputRef} type="file" accept=".stl,.obj" className="hidden" onChange={(e) => { handle(e.target.files); e.target.value = '' }} />
      {compact ? (
        <p className="text-sm text-zinc-300">{t('fileDrop.compact')}</p>
      ) : (
        <>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-2xl">📦</div>
          <p className="text-lg font-medium text-zinc-100">{t('fileDrop.title')}</p>
          <p className="mt-1 text-sm text-zinc-400">{t('fileDrop.sub')}</p>
          <p className="mt-3 text-xs text-zinc-500">{t('fileDrop.privacy')}</p>
          {onSample && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onSample() }} className="mt-4 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
              {t('fileDrop.sample')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
