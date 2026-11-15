# Changelog

All notable changes to this mod. Versions follow the `version` in `.claude-plugin/plugin.json`.

## 0.7.0

- The estimate is recalibrated against the one measured Claude Code workload and the best-sourced of the other meters (drip, EcoLogits). The reference step in the README drops from 31 mL to about 11 mL.
- Each model is rated by its output price against a $20-per-million reference, instead of by family. Fable, Opus and Sonnet no longer share rates.
- Cache reads are weighted by each model's cache-read price ratio: a twentieth on Sonnet 5.5 and Opus 5.5, a fortieth on Fable, a tenth elsewhere. Cache writes weigh 1.25.
- The water factor is on-site cooling plus overhead times the grid's water, with Anthropic's hosts' figures: about 4.0 L per kWh.
- A third row, "On-site only", shows the share of the session's water used at the data centre itself, the boundary Google reports against.

## 0.6.1

- The tap can no longer drip forever after a turn whose end was never heard: a session start clears every running turn, and a new main-loop turn drops the previous one.
- A token count that is not a finite number counts as zero instead of turning the totals into NaN.
- Overlapping streams (a subagent's beside the main loop's) each add and remove only their own share of the live figure, instead of overwriting each other's.
- The bucket's "1 L" label and alt text follow `BUCKET_ML`.
- Manifest keywords, a homepage, this changelog, a related-tools section in the README, and tests for the streaming path.

## 0.6.0

- The tap drips while any turn runs, a subagent's included, instead of stopping when the main turn ends while subagents keep working.
- Both footer lines sit in centred rows. The footer reads "accuracy: ±1 order of 2" and "Need insight?".

## 0.5.4

- The footer states the estimate's range instead of a percentage.

## 0.5.3

- The footer stays at the pane's bottom on the desktop surface.

## 0.5.2

- The footer is pinned to the bottom with the body centred above it.

## 0.5.1

- The footer's two lines use the smallest text size the surface offers. The label column is wider so "This prompt" no longer truncates in a terminal.

## 0.5.0

- The pane opens only on `/thirsty_claude`, not at session start.
- A footer under the rows states the estimate's accuracy and links to the README's method section.

## 0.4.0

- First public release: the tap and 1 L bucket, token-kind weights, per-model rates, the terminal fallback with an animated drop, and the marketplace manifest.
