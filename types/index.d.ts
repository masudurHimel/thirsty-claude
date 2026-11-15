export type Usage = {
  /** The main-loop turn the `turnUl` count belongs to; null before the first. */
  turnId: string | null
  /** Water the current prompt's responses have cost, in microlitres. */
  turnUl: number
  /** Water every response of this session has cost, in microlitres. */
  sessionUl: number
  /** A rough figure for the response still streaming, in microlitres. */
  liveUl: number
  /** True while any turn is running, the main loop's or a subagent's: the tap drips. */
  busy: boolean
  /** The ids of the turns running now; `busy` is whether there are any. */
  active?: string[]
  /** Ticks while a turn runs, driving the terminal's drop; absent before the first. */
  frame?: number
}

declare module 'claude-code' {
  interface PluginState {
    'thirsty_claude': { usage: Shaped<Usage> }
  }
}
