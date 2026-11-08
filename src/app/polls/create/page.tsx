'use client'

import { useState } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'

interface CreatedPoll {
  slug: string
  title: string
}

const emptyForm = {
  title: '',
  description: '',
  ends_at: '',
  options: ['', ''],
}

export default function CreatePublicPollPage() {
  const [form, setForm] = useState(emptyForm)
  const [website, setWebsite] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedPoll | null>(null)
  const [copied, setCopied] = useState(false)

  const shareUrl =
    created && typeof window !== 'undefined'
      ? `${window.location.origin}/polls/${created.slug}`
      : ''

  const updateOption = (index: number, value: string) => {
    setForm((current) => {
      const options = [...current.options]
      options[index] = value
      return { ...current, options }
    })
  }

  const addOption = () => {
    setForm((current) =>
      current.options.length >= 12
        ? current
        : { ...current, options: [...current.options, ''] }
    )
  }

  const removeOption = (index: number) => {
    setForm((current) =>
      current.options.length <= 2
        ? current
        : { ...current, options: current.options.filter((_, i) => i !== index) }
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    const options = form.options.map((option) => option.trim()).filter(Boolean)
    if (options.length < 2) {
      setError('Add at least two options')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/polls/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          ends_at: form.ends_at || null,
          options,
          website,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create the poll')

      setCreated({ slug: data.poll.slug, title: data.poll.title })
      setForm(emptyForm)
      setCopied(false)
    } catch (err: any) {
      setError(err.message || 'Failed to create the poll')
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PublicNav active="polls" />

      <div className="glow-orb left-1/2 top-[-10rem] h-72 w-[34rem] -translate-x-1/2 bg-brand-600/20 animate-pulse-slow" />

      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-14">
        {created ? (
          <div className="glass-effect rounded-3xl p-6 sm:p-8">
            <span className="badge border border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
              Poll live
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Your poll is ready
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-dark-400">
              Share this link on WhatsApp, X or anywhere else. Anyone who opens it
              can vote once per browser and see the results straight after voting.
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={shareUrl}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Poll share link"
                className="w-full px-4 py-3 text-sm"
              />
              <button onClick={copyLink} className="btn-primary shrink-0 px-5 py-3 text-sm">
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/polls/${created.slug}`} className="btn-secondary px-4 py-2.5 text-sm">
                Open poll
              </Link>
              <button
                onClick={() => {
                  setCreated(null)
                  setCopied(false)
                }}
                className="btn-secondary px-4 py-2.5 text-sm"
              >
                Create another
              </button>
            </div>

            <p className="mt-6 border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-dark-500">
              No account is attached to this poll, so keep the link. An administrator
              can close or archive public polls later.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <span className="badge-brand">No account needed</span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Create an opinion poll
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-dark-400">
                Ask a question, add the options and share one public link. Voters
                do not need an account either — one vote per browser.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="glass-effect mt-8 space-y-4 rounded-3xl p-6 sm:p-8">
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="poll-title" className="field-label">
                  Question
                </label>
                <input
                  id="poll-title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                  minLength={3}
                  maxLength={200}
                  className="w-full px-4 py-3 text-sm"
                  placeholder="Who do you think will win the presidential race?"
                />
              </div>

              <div>
                <label htmlFor="poll-description" className="field-label">
                  Description (optional)
                </label>
                <textarea
                  id="poll-description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  rows={2}
                  maxLength={1000}
                  className="w-full px-4 py-3 text-sm"
                  placeholder="Add context for the people you share the poll with"
                />
              </div>

              <div>
                <span className="field-label">Options</span>
                <div className="space-y-2">
                  {form.options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={option}
                        onChange={(event) => updateOption(index, event.target.value)}
                        required={index < 2}
                        maxLength={120}
                        aria-label={`Option ${index + 1}`}
                        className="w-full px-4 py-2.5 text-sm"
                        placeholder={`Option ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        disabled={form.options.length <= 2}
                        className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-dark-300 transition-colors hover:text-white disabled:opacity-30"
                        aria-label={`Remove option ${index + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addOption}
                  disabled={form.options.length >= 12}
                  className="mt-2 text-sm font-medium text-brand-300 transition-colors hover:text-brand-200 disabled:opacity-40"
                >
                  + Add option
                </button>
              </div>

              <div>
                <label htmlFor="poll-ends-at" className="field-label">
                  Closes (optional)
                </label>
                <input
                  id="poll-ends-at"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(event) => setForm({ ...form, ends_at: event.target.value })}
                  className="w-full px-4 py-3 text-sm sm:max-w-xs"
                />
              </div>

              {/* Honeypot: hidden from people, tempting to bots. */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="poll-website">Website</label>
                <input
                  id="poll-website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="btn-primary w-full px-5 py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? 'Creating poll…' : 'Create poll'}
              </button>
              <p className="text-center text-[11px] text-dark-500">
                Public polls are moderated by administrators. No account required.
              </p>
            </form>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { title: 'Ask', text: 'Write a clear question and two or more options.' },
                { title: 'Share', text: 'Send the public link to your audience.' },
                { title: 'Watch', text: 'Voters see live results after voting once.' },
              ].map((step) => (
                <div key={step.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-sm font-semibold text-white">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-dark-400">{step.text}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
