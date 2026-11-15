import { atom, read, update } from 'claude-code'
import type { Register, ModelUsage } from 'claude-code'

import type { Usage } from '../types'

const PANE = 'thirsty-claude'

// The pane's heading and the line under it. Change the words here.
const TITLE = 'THIRSTY CLAUDE'
const ACCURACY_NOTE = 'Actual use may range from half to twice this figure'
const HOW_LABEL = 'Want to know how this is measured?'
const HOW_URL = 'https://github.com/masudurHimel/thirsty-claude#how-the-water-is-estimated'
const SUBTITLE = 'what this chat costs in water'

// How much a token of each kind costs, relative to one fresh input token.
// Generating a token runs the whole model once; reading a cached prefix
// barely touches it. Change the weights here.
export const WEIGHTS = {
  input_tokens: 1,
  output_tokens: 5,
  cache_creation_input_tokens: 1.1,
  cache_read_input_tokens: 0.1,
} as const

// Microlitres of water per weighted token, all-in (data-centre cooling plus
// power generation), by model family: a bigger model moves more silicon per
// token. Matched on the model id; the first match wins, `default` otherwise.
// Derived from Google's 0.26 mL per median Gemini prompt plus US-average
// power-plant water; see the chat for sources. Change the rates here.
export const RATES_UL: ReadonlyArray<readonly [family: string, ul: number]> = [
  ['haiku', 0.5],
  ['sonnet', 2],
  ['opus', 5],
  ['fable', 5],
  ['mythos', 5],
]
export const DEFAULT_RATE_UL = 2

export const rateFor = (model: string) => {
  const id = model.toLowerCase()
  const hit = RATES_UL.find(([family]) => id.includes(family))

  return hit ? hit[1] : DEFAULT_RATE_UL
}

// What one response cost, in microlitres: each count by its weight, then by
// the answering model's rate.
export const microlitresOf = (usage: ModelUsage, model: string) => {
  const weighted =
    usage.input_tokens * WEIGHTS.input_tokens +
    usage.output_tokens * WEIGHTS.output_tokens +
    usage.cache_creation_input_tokens * WEIGHTS.cache_creation_input_tokens +
    usage.cache_read_input_tokens * WEIGHTS.cache_read_input_tokens

  return weighted * rateFor(model)
}

// The bucket holds this much before it overflows.
const BUCKET_ML = 1000

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
    <text x="${right + 8}" y="${top + 4}" font-size="9" fill="#8a8f98">1 L</text>
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

export const register: Register = on => {
  // The pane opens only when asked: /thirsty_claude. Counting runs from the
  // session's start regardless, so the bucket is right whenever it opens.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'thirsty_claude',
      description: 'Open the Thirsty Claude water pane',
    })

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

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      await update($, usage, u => ({
        ...u,
        turnId: e.turnId,
        turnUl: 0,
        liveUl: 0,
        busy: true,
      }))
      ticker?.cancel()
      ticker = $.clock.every(FRAME_MS, () => {
        if (Date.now() - terminalDrewAt > WATCHING_MS) return
        void update($, usage, u => ({ ...u, frame: (u.frame ?? 0) + 1 }))
      })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      ticker?.cancel()
      ticker = null
      await update($, usage, u => ({ ...u, liveUl: 0, busy: false }))
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // While the response streams, its text so far is guessed at four
    // characters a token, every one an output token of the step's model.
    const liveRate = WEIGHTS.output_tokens * rateFor(e.model)
    let chars = 0
    let shown = 0

    for await (const chunk of next(e)) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking') {
        chars += chunk.text.length
        const live = Math.round(chars / 4)
        if (live - shown >= LIVE_STEP) {
          shown = live
          await update($, usage, u => ({ ...u, liveUl: live * liveRate }))
        }
      } else if (chunk.kind === 'stop') {
        const spent = chunk.usage ? microlitresOf(chunk.usage, chunk.usage.model) : 0
        await update($, usage, u => ({
          ...u,
          turnUl: u.turnUl + spent,
          sessionUl: u.sessionUl + spent,
          liveUl: 0,
        }))
      }

      yield chunk
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

    // The bucket for the session, a speech bubble for this prompt. The
    // terminal gets one-cell glyphs: emoji take two cells there and misalign.
    const ICONS = isTerminal
      ? { session: 'Σ', turn: '✎' }
      : { session: '🪣', turn: '💬' }

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
          alt={`A tap dripping into a 1 litre bucket that is ${Math.round(fill * 100)}% full`}
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
    const bodyRows = 2 + 4 + 8 + (spill > 0 ? 1 : 0) + 2
    const footerRows = 3
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
        </Box>
        <Box flexDirection="column" alignItems="center" paddingTop={fits ? 0 : 2}>
          <Text dimColor size="caption">
            {ACCURACY_NOTE}
          </Text>
          <Text size="caption">
            <Link href={HOW_URL} label={HOW_LABEL} />
          </Text>
        </Box>
      </Box>
    )
  })
}
