import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { GameCard } from '../game/gameflow'
import { useI18n } from '../i18n/context.ts'

export default function CardInspection({ card, locked, close, readBack, children }: {
  card: GameCard
  locked: boolean
  close: () => void
  readBack: () => void
  file: () => void
  returnToBin: () => void
  inBin: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const [back, setBack] = useState(false)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="card-inspection"
      aria-labelledby="inspection-title"
      closedby="any"
      onClose={(event) => {
        if (!event.currentTarget.open) close()
      }}
    >
      <button type="button" className="card-inspection__close" aria-label={t('inspection.close')} onClick={close}>X</button>
      <h2 id="inspection-title">{card.personDisplayName}</h2>
      <div className="card-inspection__scene">
        <div className={`card-inspection__card${back ? ' card-inspection__card--back' : ''}`}>
          <div className="business-card business-card--full card-inspection__face" aria-hidden={back} inert={back}>
            {children}
          </div>
          <div className="business-card business-card--full card-inspection__face card-inspection__face--back" aria-hidden={!back} inert={!back}>
            <p>{card.backText || t('inspection.blankBack')}</p>
          </div>
        </div>
      </div>
      <div className="game-actions">
        <button type="button" onClick={() => {
          if (!back) readBack()
          setBack(!back)
        }}>{t(back ? 'inspection.showFront' : 'inspection.showBack')}</button>
      </div>
      {locked && <p>{t('inspection.locked')}</p> }
    </dialog>
  )
}
