import { useRegisterSW } from 'virtual:pwa-register/react'
import { useI18n } from '../lib/i18n/index.tsx'
import { Button } from './ui.tsx'

/** Servis çalışanı bildirimi: çevrimdışı kullanıma hazır / yeni sürüm var (yenile) */
export function PwaToast() {
  const { t } = useI18n()
  const { offlineReady: [offlineReady, setOfflineReady], needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(e) { console.warn('SW register failed', e) },
  })
  if (!offlineReady && !needRefresh) return null
  const close = () => { setOfflineReady(false); setNeedRefresh(false) }
  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-3 text-sm text-zinc-100 shadow-2xl backdrop-blur">
      <span>{needRefresh ? t('pwa.needRefresh') : t('pwa.offlineReady')}</span>
      {needRefresh && <Button variant="primary" onClick={() => updateServiceWorker(true)}>{t('pwa.reload')}</Button>}
      <Button variant="ghost" onClick={close} ariaLabel={t('share.close')}>✕</Button>
    </div>
  )
}
