export type Usage = {
  /** The main-loop turn the `turnUl` count belongs to; null before the first. */
  turnId: string | null
  /** Water the current prompt's responses have cost, in microlitres. */
  turnUl: number
  /** Water every response of this session has cost, in microlitres. */
  sessionUl: number
  /** A rough figure for the response still streaming, in microlitres. */
  liveUl: number
  /** True while a main-loop turn is running: the tap drips. */
  busy: boolean
  /** Ticks while a turn runs, driving the terminal's drop; absent before the first. */
  frame?: number
}

declare module 'claude-code' {
  interface PluginState {
    'thirsty_claude': { usage: Shaped<Usage> }
  }
}
