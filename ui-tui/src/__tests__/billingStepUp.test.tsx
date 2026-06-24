import { PassThrough } from 'stream'

import { renderSync } from '@hermes/ink'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

// Stub useInput so the overlay doesn't enter raw mode under renderSync.
vi.mock('@hermes/ink', async importOriginal => {
  const mod = await importOriginal()

  return { ...mod, useInput: () => {} }
})

import type { BillingOverlayState } from '../app/interfaces.js'
import { BillingOverlay } from '../components/billingOverlay.js'
import type { BillingStateResponse } from '../gatewayTypes.js'
import { stripAnsi } from '../lib/text.js'
import { DEFAULT_THEME } from '../theme.js'

const t = DEFAULT_THEME

function render(overlay: BillingOverlayState): string {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const stderr = new PassThrough()

  let output = ''

  Object.assign(stdout, { columns: 100, isTTY: false, rows: 40 })
  Object.assign(stdin, { isTTY: false })
  Object.assign(stderr, { isTTY: false })
  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const instance = renderSync(
    React.createElement(BillingOverlay, {
      onClose: () => {},
      onPatch: () => {},
      overlay,
      t
    }),
    {
      patchConsole: false,
      stderr: stderr as NodeJS.WriteStream,
      stdin: stdin as NodeJS.ReadStream,
      stdout: stdout as NodeJS.WriteStream
    }
  )

  instance.unmount()
  instance.cleanup()

  return stripAnsi(output)
}

const billState = (): BillingStateResponse =>
  ({
    auto_reload: null,
    balance_display: '$12.00',
    balance_usd: '12',
    can_charge: true,
    card: { brand: 'visa', last4: '4242', masked: 'visa ····4242' },
    charge_presets: ['25', '50'],
    charge_presets_display: ['$25', '$50'],
    cli_billing_enabled: true,
    is_admin: true,
    logged_in: true,
    max_usd: '1000',
    min_usd: '10',
    monthly_cap: null,
    ok: true,
    org_name: 'Acme',
    portal_url: 'https://portal/billing',
    role: 'OWNER'
  }) as BillingStateResponse

const ctx = {
  applyAutoReload: vi.fn(() => Promise.resolve(true)),
  charge: vi.fn(() => Promise.resolve('submitted' as const)),
  openPortal: vi.fn(),
  requestRemoteSpending: vi.fn(() => Promise.resolve(true)),
  sys: vi.fn(),
  validate: vi.fn((raw: string) => ({ amount: raw }))
}

const overlay = (screen: BillingOverlayState['screen']): BillingOverlayState => ({
  ctx,
  pendingCharge: { amount: '100' },
  screen,
  state: billState()
})

describe('BillingOverlay — step-up screen (Allow Remote Spending)', () => {
  it('renders the Allow Remote Spending prompt with the held amount', () => {
    const out = render(overlay('stepup'))
    expect(out).toContain('Allow Remote Spending')
    expect(out).toContain('one-time browser authorization')
    expect(out).toContain('$100')          // resumes the held purchase
    expect(out).toContain('Not now')
  })

  it('NEVER leaks the raw billing:manage scope in copy', () => {
    const out = render(overlay('stepup'))
    expect(out).not.toContain('billing:manage')
  })
})
