import { atom, read, update } from 'claude-code'
import type { Register, ModelUsage, EngineInterface } from 'claude-code'

import type { Usage } from '../types'

const PANE = 'thirsty-claude'

// The pane's heading and the line under it. Change the words here.
const TITLE = 'THIRSTY CLAUDE'
const ACCURACY_NOTE = 'accuracy: ±1 order of 2'
const HOW_LABEL = 'Need insight?'
const HOW_URL = 'https://github.com/masudurHimel/thirsty-claude#how-the-water-is-estimated'
const SUBTITLE = 'what this chat costs in water'

// Water per kilowatt-hour of IT energy, in litres: cooling at the site plus
// the water behind the electricity, the way EcoLogits and drip compute it.
// The on-site and overhead figures are the middle of the range EcoLogits
// gives for Anthropic's AWS and Google hosts; the grid figure is the US
// average. The README's Sources section has the references. Change them here.
export const WUE_L_PER_KWH = 0.5 // on-site cooling, 0.13 to 0.99 across hosts
export const PUE = 1.12 // power-usage effectiveness, 1.09 to 1.14
export const EWIF_L_PER_KWH = 3.13 // US-average electricity water intensity
export const WATER_L_PER_KWH = WUE_L_PER_KWH + PUE * EWIF_L_PER_KWH // about 4.0
// The share of each figure that is water used at the data centre itself.
export const ONSITE_SHARE = WUE_L_PER_KWH / WATER_L_PER_KWH // about 0.12

// Energy per thousand weighted tokens for a reference model priced at $20 per
// million output tokens. Other models scale by their output price, a proxy
// for how much silicon a token moves; price is set by the provider, so the
// proxy is rough and understates models priced for volume.
export const REF_OUTPUT_USD = 20
export const REF_WH_PER_K_WEIGHTED = 0.5
// Microlitres per weighted token for the reference model: Wh per thousand
// tokens times litres per kWh is millilitres per thousand, so microlitres each.
export const REF_RATE_UL = REF_WH_PER_K_WEIGHTED * WATER_L_PER_KWH // about 2

// How much a token of each kind costs, relative to one fresh input token.
// Generating a token runs the whole model once; a cache write is a fresh
// input plus storing it, at the 5-minute cache's price ratio. Cache reads are
// priced per model below. Change the weights here.
export const WEIGHTS = {
  input_tokens: 1,
  output_tokens: 5,
  cache_creation_input_tokens: 1.25,
} as const

// Each model's output price in dollars per million tokens and its cache-read
// price as a fraction of its input price, from Anthropic's price list.
// Matched on the model id; the first match wins, `DEFAULT_MODEL` otherwise.
export const MODELS: ReadonlyArray<readonly [match: string, outputUsd: number, cacheRead: number]> = [
  ['fable-5-2', 40, 0.025],
  ['mythos-5-2', 40, 0.025],
  ['fable', 50, 0.025],
  ['mythos', 50, 0.025],
  ['opus-5-5', 20, 0.05],
  ['opus', 25, 0.1],
  ['sonnet-5-5', 10, 0.05],
  ['sonnet-5', 10, 0.1],
  ['sonnet', 15, 0.1],
  ['haiku-5-5', 0.5, 0.1],
  ['haiku', 5, 0.1],
]
export const DEFAULT_MODEL = [REF_OUTPUT_USD, 0.1] as const

const modelOf = (model: string) => {
  const id = model.toLowerCase()
  const hit = MODELS.find(([match]) => id.includes(match))

  return hit ? { outputUsd: hit[1], cacheRead: hit[2] } : { outputUsd: DEFAULT_MODEL[0], cacheRead: DEFAULT_MODEL[1] }
}

// Microlitres of water per weighted token, all-in, for the model that answered.
export const rateFor = (model: string) => (REF_RATE_UL * modelOf(model).outputUsd) / REF_OUTPUT_USD

// The cache-read weight for the model that answered.
export const cacheReadWeightFor = (model: string) => modelOf(model).cacheRead

// What one response cost, in microlitres: each count by its weight, then by
// the answering model's rate.
export const microlitresOf = (usage: ModelUsage, model: string) => {
  // A count that is not a finite number counts as zero, so one odd response
  // cannot turn the totals into NaN for the rest of the session.
  const n = (count: unknown) => (typeof count === 'number' && Number.isFinite(count) ? count : 0)
  const weighted =
    n(usage.input_tokens) * WEIGHTS.input_tokens +
    n(usage.output_tokens) * WEIGHTS.output_tokens +
    n(usage.cache_creation_input_tokens) * WEIGHTS.cache_creation_input_tokens +
    n(usage.cache_read_input_tokens) * cacheReadWeightFor(model)

  return weighted * rateFor(model)
}

// The bucket holds this much before it overflows.
const BUCKET_ML = 1000
const BUCKET_LABEL = BUCKET_ML % 1000 === 0 ? `${BUCKET_ML / 1000} L` : `${BUCKET_ML} mL`

// The terminal's drop steps one row this often while a turn runs.
const FRAME_MS = 125

// A terminal that drew the pane this recently is still watching: the frame
// timer writes only then, so a desktop-only session is not redrawn 8x a second.
const WATCHING_MS = 5000
let terminalDrewAt = 0
let ticker: { cancel: () => void } | null = null

// Below this many estimated tokens, a streaming response does not redraw.
const LIVE_STEP = 64

const EMPTY: Usage = { turnId: null, turnUl: 0, sessionUl: 0, liveUl: 0, busy: false }

const usage = atom({ plugin: 'thirsty_claude', key: 'usage' } as const, EMPTY, {
  shape: 'usage-3',
})

const water = (ml: number) => {
  if (ml < 1) return `${ml.toFixed(2)} mL`
  if (ml < 1000) return `${Math.round(ml)} mL`

  return `${(ml / 1000).toFixed(2)} L`
}

// The tap, the bucket and the water, as an SVG document. `fill` is the
// bucket's fullness, 0 to 1; `spill` is how far past full, 0 to 1 and over.
const bucketSvg = (fill: number, spill: number, busy: boolean) => {
  const W = 200
  const H = 250
  // Bucket walls.
  const left = 50
  const right = 150
  const top = 110
  const bottom = 220
  const inner = bottom - top - 4
  const level = Math.round(inner * fill)
  const surface = bottom - 2 - level
  // The tap's spout.
  const spoutX = 100
  const spoutY = 62
  const dur = 0.55
  const drop = (begin: number) => `
    <ellipse cx="${spoutX}" cy="${spoutY}" rx="3.5" ry="5" fill="#4fa3e0">
      <animate attributeName="cy" from="${spoutY}" to="${surface}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 1 1" keyTimes="0;1"/>
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </ellipse>`
  const drops = busy ? drop(0) + drop(dur / 2) : ''
  const wave = level > 0
    ? `<path d="M${left + 2} ${surface} q10 -3 20 0 t20 0 t20 0 t20 0 t16 0" fill="none" stroke="#9ed0f5" stroke-width="2">
         <animate attributeName="d" dur="1.6s" repeatCount="indefinite"
           values="M${left + 2} ${surface} q10 -3 20 0 t20 0 t20 0 t20 0 t16 0;M${left + 2} ${surface} q10 3 20 0 t20 0 t20 0 t20 0 t16 0;M${left + 2} ${surface} q10 -3 20 0 t20 0 t20 0 t20 0 t16 0"/>
       </path>`
    : ''
  // The spill grows with the excess: full size at two litres over the rim.
  const over = Math.min(1, spill / 2)
  const stream = 3 + 7 * over
  const rx = 56 + 42 * over
  const ry = 5 + 10 * over
  const overflow = spill > 0
    ? `
    <rect x="${left - stream}" y="${top}" width="${stream}" height="${bottom - top + 8}" fill="#4fa3e0" opacity="0.8"/>
    <rect x="${right}" y="${top}" width="${stream}" height="${bottom - top + 8}" fill="#4fa3e0" opacity="0.8"/>
    <ellipse cx="${W / 2}" cy="${bottom + 12}" rx="${rx}" ry="${ry}" fill="#4fa3e0" opacity="0.7"/>
    <path d="M${left - 4} ${top - 6} q${-6 - 6 * over} -2 ${-12 - 10 * over} 4" fill="none" stroke="#4fa3e0" stroke-width="${2 + 3 * over}" stroke-linecap="round"/>
    <path d="M${right + 4} ${top - 6} q${6 + 6 * over} -2 ${12 + 10 * over} 4" fill="none" stroke="#4fa3e0" stroke-width="${2 + 3 * over}" stroke-linecap="round"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <!-- tap -->
    <rect x="40" y="18" width="70" height="12" rx="6" fill="#8a8f98"/>
    <rect x="${spoutX - 7}" y="24" width="14" height="30" rx="4" fill="#8a8f98"/>
    <rect x="${spoutX - 10}" y="52" width="20" height="8" rx="3" fill="#6f747d"/>
    <rect x="58" y="4" width="10" height="16" rx="3" fill="#6f747d"/>
    <circle cx="63" cy="6" r="7" fill="#b0b5bd"/>
    ${drops}
    <!-- water -->
    ${level > 0 ? `<rect x="${left + 2}" y="${surface}" width="${right - left - 4}" height="${level}" fill="#4fa3e0" opacity="0.85"/>` : ''}
    ${wave}
    <!-- bucket -->
    <path d="M${left} ${top} L${left} ${bottom} Q${left} ${bottom + 6} ${left + 6} ${bottom + 6} L${right - 6} ${bottom + 6} Q${right} ${bottom + 6} ${right} ${bottom} L${right} ${top}" fill="none" stroke="#8a8f98" stroke-width="4" stroke-linejoin="round"/>
    <rect x="${left - 6}" y="${top - 4}" width="${right - left + 12}" height="6" rx="3" fill="#8a8f98"/>
    <text x="${right + 8}" y="${top + 4}" font-size="9" fill="#8a8f98">${BUCKET_LABEL}</text>
    ${overflow}
  </svg>`
}

// The terminal has no Svg: a bucket of box-drawing characters instead. The
// drop falls two rows under the spout, then through the empty part of the
// bucket, and starts over; `frame` says where it is.
const DROP_COL = 7

const terminalRows = (fill: number, spill: number, busy: boolean, frame: number) => {
  const rows = 6
  const width = 14
  const filled = Math.round(rows * fill)
  const empty = rows - filled
  const path = 2 + empty
  const step = busy ? frame % path : -1
  const side = spill > 0 ? '~' : ' '
  const at = (col: number, glyph: string, base: string) =>
    base.slice(0, col) + glyph + base.slice(col + 1)

  const lines = ['     ╥', '   ══╩═══╗']
  for (let i = 0; i < 2; i++) {
    lines.push(step === i ? at(DROP_COL + 2, '▪', ' '.repeat(12)) : '')
  }
  lines.push(`${side}┌${'─'.repeat(width)}┐${side}`)
  for (let i = 0; i < rows; i++) {
    const wet = i >= empty
    let inner = (wet ? '█' : ' ').repeat(width)
    if (!wet && step === 2 + i) inner = at(DROP_COL, '▪', inner)
    lines.push(`${side}│${inner}│${side}`)
  }
  lines.push(`${side}└${'─'.repeat(width)}┘${side}`)
  if (spill > 0) lines.push('~'.repeat(width + 4 + Math.round(8 * Math.min(1, spill / 2))))

  return lines
}

// The frame ticker: runs while any turn does, writing a frame only when a
// terminal is watching, so a desktop-only session is not redrawn 8x a second.
const startTicker = ($: EngineInterface) => {
  if (ticker) return
  ticker = $.clock.every(FRAME_MS, () => {
    if (Date.now() - terminalDrewAt > WATCHING_MS) return
    void update($, usage, u => ({ ...u, frame: (u.frame ?? 0) + 1 }))
  })
}

const stopTicker = () => {
  ticker?.cancel()
  ticker = null
}

export const register: Register = on => {
  // The pane opens only when asked: /thirsty_claude. Counting runs from the
  // session's start regardless, so the bucket is right whenever it opens.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'thirsty_claude',
      description: 'Open the Thirsty Claude water pane',
    })
    // Nothing is running at a start (a reload runs this again), so a turn
    // whose end was never heard cannot keep the tap dripping.
    stopTicker()
    await update($, usage, u => ({ ...u, active: [], busy: false, liveUl: 0 }))

    return next(e)
  })

  on('command.run', { command: 'thirsty_claude' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Water' })

    return {
      text: isPlaced
        ? 'Thirsty Claude is open.'
        : 'Thirsty Claude opened, but this surface has nowhere to show it.',
    }
  })

  // The tap drips while any turn runs: the main loop's, or a subagent's that
  // keeps working after the main turn has ended. `active` holds the ids of
  // the turns under way; a turn whose start was not heard is ignored at its
  // end, so the list never goes wrong.
  on('turn.start', async ($, e, next) => {
    await update($, usage, u => {
      // A new main-loop turn means the previous one is over, heard or not.
      const stale = e.agentId ? [e.turnId] : [e.turnId, u.turnId]
      const active = [...(u.active ?? []).filter(id => !stale.includes(id)), e.turnId]
      const main = e.agentId ? {} : { turnId: e.turnId, turnUl: 0, liveUl: 0 }

      return { ...u, ...main, active, busy: true }
    })
    startTicker($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    let busy = true
    await update($, usage, u => {
      const active = (u.active ?? []).filter(id => id !== e.turnId)
      busy = active.length > 0

      return { ...u, active, busy, liveUl: busy ? u.liveUl : 0 }
    })
    if (!busy) stopTicker()

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // While the response streams, its text so far is guessed at four
    // characters a token, every one an output token of the step's model.
    // Streams can overlap (a subagent's beside the main loop's), so each one
    // adds and later removes only its own share of the live figure.
    const liveRate = WEIGHTS.output_tokens * rateFor(e.model)
    let chars = 0
    let shown = 0
    let mine = 0

    const shift = (to: number) => {
      const delta = to - mine
      mine = to

      return (u: Usage) => ({ ...u, liveUl: Math.max(0, u.liveUl + delta) })
    }

    try {
      for await (const chunk of next(e)) {
        if (chunk.kind === 'text' || chunk.kind === 'thinking') {
          chars += chunk.text.length
          const live = Math.round(chars / 4)
          if (live - shown >= LIVE_STEP) {
            shown = live
            await update($, usage, shift(live * liveRate))
          }
        } else if (chunk.kind === 'stop') {
          const spent = chunk.usage ? microlitresOf(chunk.usage, chunk.usage.model) : 0
          const settle = shift(0)
          await update($, usage, u => ({
            ...settle(u),
            turnUl: u.turnUl + spent,
            sessionUl: u.sessionUl + spent,
          }))
        }

        yield chunk
      }
    } finally {
      // A stream cut short still gives its share back.
      if (mine !== 0) await update($, usage, shift(0))
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'
    if (isTerminal) terminalDrewAt = Date.now()
    const u = await read($, usage)
    const rows = Math.max(1, e.props.scroll.bodyRows)
    const tilde = u.liveUl > 0 ? '~' : ''
    const sessionMl = (u.sessionUl + u.liveUl) / 1000
    const turnMl = (u.turnUl + u.liveUl) / 1000
    const fill = Math.min(1, sessionMl / BUCKET_ML)
    const spill = Math.max(0, sessionMl - BUCKET_ML) / BUCKET_ML

    // The bucket for the session, a speech bubble for this prompt, a snowflake
    // for the cooling water used at the data centre itself. The terminal gets
    // one-cell glyphs: emoji take two cells there and misalign.
    const ICONS = isTerminal
      ? { session: 'Σ', turn: '✎', onsite: '◦' }
      : { session: '🪣', turn: '💬', onsite: '❄️' }

    const Row = (icon: string, label: string, text: string) => (
      <Box flexDirection="row">
        <Box width={isTerminal ? 3 : 4}>
          <Text>{icon}</Text>
        </Box>
        <Box width={14}>
          <Text dimColor wrap="truncate-end">
            {label}
          </Text>
        </Box>
        <Box width={12} justifyContent="flex-end">
          <Text color="cyan">{text}</Text>
        </Box>
      </Box>
    )

    const drawSvg = (surface: Exclude<typeof e, { surface: 'terminal' }>) => {
      const { Svg } = $.ui.resolve(surface)

      return (
        <Svg
          source={bucketSvg(fill, spill, u.busy)}
          alt={`A tap dripping into a ${BUCKET_LABEL} bucket that is ${Math.round(fill * 100)}% full`}
          width={200}
          height={250}
          isInteractive
        />
      )
    }

    const bucket =
      e.surface !== 'terminal' ? (
        drawSvg(e)
      ) : (
        <Box flexDirection="column">
          {terminalRows(fill, spill, u.busy, u.frame ?? 0).map((line, i) => (
            <Text color={i < 2 ? undefined : 'cyan'} dimColor={i < 2}>
              {line || ' '}
            </Text>
          ))}
        </Box>
      )

    // `bodyRows` is the height the surface gave the pane's body. The terminal
    // seats the pane in that many rows: with room for the whole drawing, the
    // body is centred in what the footer leaves and the footer sits at the
    // bottom; without, everything stacks from the top with a gap before the
    // footer. Other surfaces honour a row height too but not a percentage, and
    // their rows do not compare with a count of text lines, so the outer box
    // always takes the full height there.
    const bodyRows = 2 + 4 + 8 + (spill > 0 ? 1 : 0) + 3
    const footerRows = 2 + 1 // its two lines and the gap above them
    const fits = !isTerminal || rows >= bodyRows + footerRows

    return (
      <Box flexDirection="column" width="100%" height={fits ? rows : undefined}>
        <Box
          flexDirection="column"
          alignItems="center"
          justifyContent={fits ? 'center' : 'flex-start'}
          flexGrow={fits ? 1 : 0}
        >
          <Text bold>{TITLE}</Text>
          <Text dimColor>{SUBTITLE}</Text>
          {!isTerminal && <Text> </Text>}
          {bucket}
          {!isTerminal && <Text> </Text>}
          {Row(ICONS.session, 'Session', `${tilde}≈ ${water(sessionMl)}`)}
          {Row(ICONS.turn, 'This prompt', `${tilde}≈ ${water(turnMl)}`)}
          {Row(ICONS.onsite, 'On-site only', `${tilde}≈ ${water(sessionMl * ONSITE_SHARE)}`)}
        </Box>
        <Box flexDirection="column" width="100%" paddingTop={fits ? 0 : 2}>
          <Box width="100%" justifyContent="center">
            <Text dimColor size="caption">
              {ACCURACY_NOTE}
            </Text>
          </Box>
          <Box width="100%" justifyContent="center">
            <Text size="caption">
              <Link href={HOW_URL} label={HOW_LABEL} />
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
