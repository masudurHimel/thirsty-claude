import { expect, test } from 'claude-code/testing'

import { microlitresOf, rateFor } from './register'

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

test('a response is weighted by token kind and rated by model', async () => {
  // A cache-heavy step: 100k cached, 1k fresh, 2k written, 500 generated.
  const step = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_input_tokens: 2000,
    cache_read_input_tokens: 100_000,
  }
  // Weighted: 1000 + 2500 + 2200 + 10000 = 15,700 tokens.
  expect(microlitresOf(step, 'claude-sonnet-5-5')).toBe(15_700 * 2)
  expect(microlitresOf(step, 'claude-haiku-5-5')).toBe(15_700 * 0.5)
  expect(microlitresOf(step, 'claude-opus-5-5')).toBe(15_700 * 5)
  expect(rateFor('something-unknown')).toBe(2)
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
