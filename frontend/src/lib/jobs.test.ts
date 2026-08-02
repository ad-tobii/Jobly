import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bestScore,
  formatCompanyLine,
  formatJobTitle,
  isScoring,
  relativeAge,
  scoreTone,
  statusLabel,
} from './jobs.ts'
import type { JobLike } from './jobs.ts'

const job = (overrides: Partial<JobLike> = {}): JobLike => ({
  id: 'j1',
  status: 'recommended',
  created_at: '2026-08-02T00:00:00Z',
  ...overrides,
})

describe('bestScore', () => {
  it('prefers the job match_score when present', () => {
    expect(bestScore(job({ match_score: 72, job_cv_matches: [{ cv_id: 'c', score: 90 }] }))).toBe(72)
  })

  it('falls back to the highest CV match', () => {
    expect(
      bestScore(job({ match_score: null, job_cv_matches: [{ cv_id: 'a', score: 40 }, { cv_id: 'b', score: 65 }] })),
    ).toBe(65)
  })

  it('returns null when there is nothing to score', () => {
    expect(bestScore(job({ match_score: null, job_cv_matches: [] }))).toBeNull()
    expect(bestScore(job({ match_score: null }))).toBeNull()
  })

  it('treats a genuine zero score as a score, not as missing', () => {
    expect(bestScore(job({ match_score: 0 }))).toBe(0)
  })
})

describe('scoreTone', () => {
  it('maps the DESIGN.md score bands', () => {
    expect(scoreTone(70)).toBe('success')
    expect(scoreTone(85)).toBe('success')
    expect(scoreTone(69)).toBe('warning')
    expect(scoreTone(50)).toBe('warning')
    expect(scoreTone(49)).toBe('error')
    expect(scoreTone(0)).toBe('error')
  })

  it('is neutral when there is no score', () => {
    expect(scoreTone(null)).toBe('neutral')
    expect(scoreTone(undefined)).toBe('neutral')
  })
})

describe('isScoring', () => {
  it('covers every in-flight pipeline status', () => {
    for (const status of ['scraping', 'scraped', 'scoring', 'generating']) {
      expect(isScoring({ status })).toBe(true)
    }
  })

  it('is false for settled statuses', () => {
    for (const status of ['recommended', 'ready', 'applied', 'low_match', 'failed']) {
      expect(isScoring({ status })).toBe(false)
    }
  })
})

describe('formatJobTitle', () => {
  it('uses the title when there is one', () => {
    expect(formatJobTitle(job({ title: 'Staff Engineer' }))).toBe('Staff Engineer')
  })

  it('explains itself while still scraping', () => {
    expect(formatJobTitle(job({ title: null, status: 'scraping' }))).toMatch(/Reading LinkedIn/)
  })

  it('falls back for a blank title', () => {
    expect(formatJobTitle(job({ title: '   ', status: 'ready' }))).toBe('Untitled role')
  })
})

describe('formatCompanyLine', () => {
  it('joins company and location', () => {
    expect(formatCompanyLine(job({ company: 'Linear', location: 'Remote' }))).toBe('Linear • Remote')
  })

  it('omits the separator when there is no location', () => {
    expect(formatCompanyLine(job({ company: 'Linear' }))).toBe('Linear')
  })

  it('handles a missing company', () => {
    expect(formatCompanyLine(job({ location: 'Lagos' }))).toBe('Unknown company • Lagos')
  })
})

describe('statusLabel', () => {
  it('uses friendly labels', () => {
    expect(statusLabel('low_match')).toBe('Low match')
    expect(statusLabel('recommended')).toBe('Recommended')
  })

  it('degrades gracefully for an unknown status', () => {
    expect(statusLabel('some_new_state')).toBe('some new state')
  })
})

describe('relativeAge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats each bucket', () => {
    expect(relativeAge('2026-08-02T11:59:40Z')).toBe('Just now')
    expect(relativeAge('2026-08-02T11:30:00Z')).toBe('30m ago')
    expect(relativeAge('2026-08-02T07:00:00Z')).toBe('5h ago')
    expect(relativeAge('2026-07-30T12:00:00Z')).toBe('3d ago')
    expect(relativeAge('2026-06-02T12:00:00Z')).toBe('2mo ago')
    expect(relativeAge('2024-08-02T12:00:00Z')).toBe('2y ago')
  })

  it('returns an empty string for no date', () => {
    expect(relativeAge(null)).toBe('')
    expect(relativeAge(undefined)).toBe('')
  })

  it('never shows a negative age for a clock-skewed future date', () => {
    expect(relativeAge('2026-08-02T12:05:00Z')).toBe('Just now')
  })
})
