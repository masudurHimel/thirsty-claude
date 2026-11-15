import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { ONSITE_SHARE, REF_RATE_UL, WATER_L_PER_KWH, cacheReadWeightFor, microlitresOf, rateFor } from './register'

const PANE = {
  plugin: 'thirsty_claude',
  component: 'Pane',
  requestId: 'thirsty-claude',
  props: {
    title: 'Water',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the greeting and an empty bucket draw on every surface', async $ => {
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /THIRSTY/ }))?.text).toBe('THIRSTY CLAUDE')
    expect((await ui.find({ type: 'Text', text: /mL/ }))?.text).toBe('≈ 0.00 mL')
    await ui.unmount()
  }
})

test('the terminal draws the bucket out of box characters', async $ => {
  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { ...PANE.props, placement: 'inline', scroll: { offset: 0, bodyRows: 10 } },
  })

  const walls = await ui.findAll({ type: 'Text', text: /│/ })
  expect(walls).toHaveLength(6)
  expect((await ui.find({ type: 'Text', text: /┌/ }))?.text).toBe(' ┌──────────────┐ ')
  expect(await ui.find({ type: 'Text', text: /▪/ })).toBe(undefined)
  await ui.unmount()
})

test('while a turn runs the terminal drop is on its way down', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: {
        shape: 'usage-3',
        value: { turnId: 't1', turnUl: 0, sessionUl: 500_000, liveUl: 0, busy: true, frame: 3 },
      },
      version: 2,
    },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // 500,000 µL is 0.5 L: three empty rows. Frame 3 is the drop's second
  // row inside the bucket.
  expect((await ui.find({ type: 'Text', text: /▪/ }))?.text).toBe(' │       ▪      │ ')
  await ui.unmount()
})

test('past one litre the session reads over a litre', async ($, on) => {
  // 1,200,000 µL is 1.2 L: 200 mL over the rim.
  on('state.get', () => ({
    value: {
      value: {
        shape: 'usage-3',
        value: { turnId: 't1', turnUl: 2000, sessionUl: 1_200_000, liveUl: 0, busy: false },
      },
      version: 3,
    },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /1\.20 L/ }))?.text).toBe('≈ 1.20 L')
  await ui.unmount()
})

test('a value an earlier version stored is declined', async ($, on) => {
  on('state.get', () => ({
    value: { value: { shape: 'usage-2', value: { session: 999999 } }, version: 1 },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /mL/ }))?.text).toBe('≈ 0.00 mL')
  await ui.unmount()
})

test('the pane opens on /thirsty_claude and not at session start', async ($, on) => {
  let opened = 0
  on('command.register', () => ({ value: { command: 'thirsty_claude' } }))
  on('ui.open', () => {
    opened += 1

    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opened).toBe(0)

  const ran = await $.command.run({
    command: 'thirsty_claude',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  expect(ran.text).toBe('Thirsty Claude is open.')
  expect(opened).toBe(1)
})

test('the pane states its range and links to the method', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /order of 2/ }))?.text).toBe('accuracy: ±1 order of 2')
  const how = await ui.find({ type: 'Link' })
  expect(how?.text).toBe('Need insight?')
  await ui.unmount()
})

test('the water factor and the reference rate follow from their parts', () => {
  // 0.5 on-site + 1.12 x 3.13 from the grid is about 4.0 L per kWh, of which
  // an eighth is used at the site. 0.5 Wh per thousand weighted tokens at
  // that factor is about 2 µL per token for a $20-per-million-output model.
  expect(Math.round(WATER_L_PER_KWH * 100) / 100).toBe(4.01)
  expect(Math.round(ONSITE_SHARE * 1000) / 1000).toBe(0.125)
  expect(Math.round(REF_RATE_UL * 100) / 100).toBe(2)
})

test('a model is rated by its output price and reads its cache at its own ratio', () => {
  const ul = (model: string) => Math.round(rateFor(model) * 1000) / 1000
  // Sonnet 5.5 at $10 is half the $20 reference; Fable 5.1 at $50 is 2.5x it.
  expect(ul('claude-sonnet-5-5')).toBe(1.001)
  expect(ul('claude-opus-5-5')).toBe(2.003)
  expect(ul('claude-fable-5-1')).toBe(5.007)
  expect(ul('claude-haiku-5-5')).toBe(0.05)
  expect(ul('claude-opus-4-5-20251101')).toBe(2.504)
  expect(ul('something-unknown')).toBe(2.003)
  expect(cacheReadWeightFor('claude-sonnet-5-5')).toBe(0.05)
  expect(cacheReadWeightFor('claude-opus-5-5')).toBe(0.05)
  expect(cacheReadWeightFor('claude-fable-5-1')).toBe(0.025)
  expect(cacheReadWeightFor('claude-sonnet-4-6')).toBe(0.1)
  expect(cacheReadWeightFor('something-unknown')).toBe(0.1)
})

test('a response is weighted by token kind and rated by model', async () => {
  // A cache-heavy step: 100k cached, 1k fresh, 2k written, 500 generated.
  const step = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_input_tokens: 2000,
    cache_read_input_tokens: 100_000,
  }
  // On Sonnet 5.5, weighted: 1000 + 2500 + 2500 + 5000 = 11,000 tokens, about
  // 11 mL. On a model that reads its cache at a tenth: 16,000.
  expect(microlitresOf(step, 'claude-sonnet-5-5')).toBe(11_000 * rateFor('claude-sonnet-5-5'))
  expect(Math.round(microlitresOf(step, 'claude-sonnet-5-5') / 1000)).toBe(11)
  expect(microlitresOf(step, 'claude-sonnet-4-6')).toBe(16_000 * rateFor('claude-sonnet-4-6'))
  // On Fable, which reads its cache at a fortieth: 1000 + 2500 + 2500 + 2500 = 8,500.
  expect(microlitresOf(step, 'claude-fable-5-1')).toBe(8_500 * rateFor('claude-fable-5-1'))
})

test('the pane shows the share used at the data centre itself', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: {
        shape: 'usage-3',
        value: { turnId: 't1', turnUl: 0, sessionUl: 1_000_000, liveUl: 0, busy: false },
      },
      version: 3,
    },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // An eighth of a litre.
  expect((await ui.find({ type: 'Text', text: /On-site/ }))?.text).toBe('On-site only')
  expect((await ui.find({ type: 'Text', text: /125 mL/ }))?.text).toBe('≈ 125 mL')
  await ui.unmount()
})

test('the tap keeps dripping while a subagent works after the main turn ends', async ($, on) => {
  // The engine's state, stood in for: one value, versioned.
  let stored: { value: unknown; version: number } = { value: undefined, version: 0 }
  on('state.get', () => ({ value: stored }))
  on('state.set', (_, e) => {
    stored = { value: e.value, version: stored.version + 1 }

    return { value: { isSet: true, version: stored.version } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  const done = { reason: 'answer', durationMs: 1, isAborted: false, category: null, explanation: null } as const

  await $.turn.start({ text: 'go', turnId: 'main-1' })
  await $.turn.start({ text: 'look', turnId: 'agent-1', agentId: 'a1' })
  await $.turn.complete({ ...done, answer: 'handed off', turnId: 'main-1' })

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /▪/ })) !== undefined).toBe(true)
  await ui.unmount()

  await $.turn.complete({ ...done, answer: 'found it', turnId: 'agent-1', agentId: 'a1' })

  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /▪/ })).toBe(undefined)
  await ui.unmount()
})

// The engine's state, stood in for: one value, versioned.
const fakeState = (on: On) => {
  let stored: { value: unknown; version: number } = { value: undefined, version: 0 }
  on('state.get', () => ({ value: stored }))
  on('state.set', (_, e) => {
    stored = { value: e.value, version: stored.version + 1 }

    return { value: { isSet: true, version: stored.version } }
  })

  return () => stored.value as { value: { sessionUl: number; liveUl: number; turnUl: number } } | undefined
}

const STEP = {
  turnId: 't1',
  index: 0,
  model: 'claude-sonnet-5-5',
  messageCount: 1,
} as const

test('a streamed response adds its usage once it stops', async ($, on) => {
  const read = fakeState(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    yield { kind: 'text', index: 0, text: 'x'.repeat(4 * 200) }
    yield {
      kind: 'stop',
      stopReason: 'end_turn',
      usage: {
        model: 'claude-sonnet-5-5',
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 100_000,
      },
    }

    return { turnId: e.turnId, index: e.index, answer: 'done', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  const seen: string[] = []
  for await (const chunk of $.turn.step(STEP)) {
    seen.push(chunk.kind)
    // 200 estimated output tokens at 5 x the model's rate show live before the stop.
    if (chunk.kind === 'text') expect(read()?.value.liveUl).toBe(200 * 5 * rateFor(STEP.model))
  }

  expect(seen).toEqual(['text', 'stop'])
  expect(read()?.value.sessionUl).toBe(11_000 * rateFor(STEP.model))
  expect(read()?.value.turnUl).toBe(11_000 * rateFor(STEP.model))
  expect(read()?.value.liveUl).toBe(0)
})

test('a response that reports no usage adds nothing and leaves no live figure', async ($, on) => {
  const read = fakeState(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_, e) {
    yield { kind: 'text', index: 0, text: 'y'.repeat(4 * 100) }
    yield { kind: 'stop', stopReason: null, usage: null }

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  for await (const _ of $.turn.step(STEP)) {
    // drain
  }

  expect(read()?.value.sessionUl).toBe(0)
  expect(read()?.value.liveUl).toBe(0)
})

test('a count that is not a number counts as zero', async () => {
  const odd = {
    input_tokens: Number.NaN,
    output_tokens: 10,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  expect(microlitresOf(odd, 'claude-sonnet-5-5')).toBe(10 * 5 * rateFor('claude-sonnet-5-5'))
})

test('a session start clears a turn whose end was never heard', async ($, on) => {
  fakeState(on)
  on('command.register', () => ({ value: { command: 'thirsty_claude' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'go', turnId: 'orphan' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /▪/ })).toBe(undefined)
  await ui.unmount()
})
