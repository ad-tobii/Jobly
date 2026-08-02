import { describe, expect, it } from 'vitest'
import {
  APPLICATION_STATUSES,
  STATUS_META,
  activeCount,
  countByStatus,
  formatAppliedDate,
  isApplicationStatus,
} from './applications.ts'
import type { Application, ApplicationStatus } from './applications.ts'

const app = (status: ApplicationStatus, id: string = status): Application => ({
  id,
  job_id: `job-${id}`,
  status,
})

describe('APPLICATION_STATUSES', () => {
  it('matches the statuses the backend accepts', () => {
    // Mirrors VALID_STATUSES in backend/src/routes/applications.js
    expect([...APPLICATION_STATUSES]).toEqual([
      'applied',
      'interviewing',
      'offer',
      'rejected',
      'dismissed',
    ])
  })

  it('has display metadata for every status', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(STATUS_META[status]?.label).toBeTruthy()
      expect(STATUS_META[status]?.pillClass).toBeTruthy()
      expect(STATUS_META[status]?.dotClass).toBeTruthy()
    }
  })
})

describe('isApplicationStatus', () => {
  it('accepts known statuses and rejects anything else', () => {
    expect(isApplicationStatus('offer')).toBe(true)
    expect(isApplicationStatus('ghosted')).toBe(false)
    expect(isApplicationStatus('')).toBe(false)
  })
})

describe('countByStatus', () => {
  it('counts each status and the total', () => {
    const counts = countByStatus([
      app('applied', 'a'),
      app('applied', 'b'),
      app('interviewing'),
      app('offer'),
    ])

    expect(counts.applied).toBe(2)
    expect(counts.interviewing).toBe(1)
    expect(counts.offer).toBe(1)
    expect(counts.rejected).toBe(0)
    expect(counts.dismissed).toBe(0)
    expect(counts.total).toBe(4)
  })

  it('returns a zeroed record for an empty list', () => {
    const counts = countByStatus([])
    expect(counts.total).toBe(0)
    for (const status of APPLICATION_STATUSES) {
      expect(counts[status]).toBe(0)
    }
  })

  it('ignores an unexpected status but still counts it in the total', () => {
    const counts = countByStatus([{ id: 'x', job_id: 'j', status: 'ghosted' as ApplicationStatus }])
    expect(counts.total).toBe(1)
    expect(counts.applied).toBe(0)
  })
})

describe('activeCount', () => {
  it('counts only applications still in play', () => {
    const applications = [
      app('applied'),
      app('interviewing'),
      app('offer'),
      app('rejected'),
      app('dismissed'),
    ]
    // offer/rejected/dismissed are closed out; applied + interviewing are live.
    expect(activeCount(applications)).toBe(2)
  })

  it('is zero for an empty list', () => {
    expect(activeCount([])).toBe(0)
  })
})

describe('formatAppliedDate', () => {
  it('formats an ISO date', () => {
    expect(formatAppliedDate('2026-08-02T10:00:00Z')).toMatch(/2026/)
  })

  it('handles a missing date', () => {
    expect(formatAppliedDate(null)).toBe('Unknown date')
    expect(formatAppliedDate(undefined)).toBe('Unknown date')
  })
})
