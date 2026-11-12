'use client'

import { useState } from 'react'

interface TrainingGuideButtonProps {
  role: string
  /** "menu" renders a row for the account menu, "button" a standalone button. */
  variant?: 'menu' | 'button'
}

/**
 * Downloads the role training guide. The PDF builder is imported on demand so
 * jsPDF is not part of the dashboard bundle for users who never open a guide.
 */
export default function TrainingGuideButton({
  role,
  variant = 'button',
}: TrainingGuideButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleDownload = async () => {
    setBusy(true)
    try {
      const { downloadTrainingGuide } = await import('@/lib/trainingPdf')
      await downloadTrainingGuide(role)
    } catch (error) {
      console.error('Could not build the training guide:', error)
      window.alert('The training guide could not be generated. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'menu') {
    return (
      <button
        onClick={handleDownload}
        disabled={busy}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-dark-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        {busy ? 'Preparing guide…' : 'Training guide (PDF)'}
      </button>
    )
  }

  return (
    <button
      onClick={handleDownload}
      disabled={busy}
      className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-50"
    >
      {busy ? 'Preparing guide…' : 'Download training guide'}
    </button>
  )
}
