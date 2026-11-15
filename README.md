# Thirsty Claude

A Claude Code mod that shows, beside the chat, how much water your session has cost: a tap dripping into a one-litre bucket. The bucket fills as tokens are spent, the tap drips while a reply is running, and past one litre the water spills over the rim.

```
      THIRSTY CLAUDE
  what this chat costs in water

           (tap and bucket)

🪣  Session       ≈ 0.37 L
💬  This prompt   ≈ 25 mL
```

The desktop app draws an animated SVG. A terminal session gets a box-character bucket with a falling drop.

## Install

At the prompt of a terminal session:

```
/plugin install thirsty_claude --marketplace masudurHimel/thirsty-claude
```

Answer `y` to add the marketplace, then pick a scope (user is the usual one). From a shell:

```bash
claude plugin install thirsty_claude --marketplace masudurHimel/thirsty-claude
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `masudurHimel/thirsty-claude`, then Add plugin.

## Using it

- The pane opens on its own when a session starts.
- `/thirsty_claude` reopens it after you close it, at the same level.
- Closing the pane never resets the count. The count is per session and starts at zero when a session starts.

## How the water is estimated

Nothing here is measured. Anthropic publishes no energy or water figures for Claude, so the mod estimates from public disclosures by other providers and from how inference works.

Every model response reports four token counts. Each is weighted relative to one fresh input token, then multiplied by a rate for the model family that answered:

| Token kind | Weight |
|---|---|
| Fresh input | 1 |
| Cache write | 1.1 |
| Cache read | 0.1 |
| Output, thinking included | 5 |

| Model family, matched on the id | Microlitres per weighted token |
|---|---|
| haiku | 0.5 |
| sonnet | 2 |
| opus, fable, mythos | 5 |
| anything else | 2 |

The rates are "all-in": water evaporated at the data centre for cooling plus water used to generate the electricity, on a US-average grid. They derive from Google's published 0.26 mL per median Gemini text prompt and Epoch AI's 0.3 Wh per GPT-4o query, scaled by model family. The cache-read and output weights are informed guesses from how a transformer serves a request, not measurements.

Honest accuracy: expect the figure to be within about ±50% of the truth most of the time, and within 2x nearly always. It cannot do better until Anthropic publishes per-query figures or the data centre's water intensity is known.

All of these are constants at the top of `hooks/register.tsx`: `WEIGHTS`, `RATES_UL`, `DEFAULT_RATE_UL`, and `BUCKET_ML` for the bucket's size.

Sources:

- Google, "Measuring the environmental impact of delivering AI at Google scale", August 2025: https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference
- Epoch AI, "How much energy does ChatGPT use?", February 2025: https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
- Li, Yang, Islam, Ren, "Making AI Less Thirsty", 2023, revised 2025: https://arxiv.org/abs/2304.03271
- Projet Celsius, Claude energy and water estimates, November 2026: https://projetcelsius.com/en/blog/fable-5-2-opus-5-5-energy-water/

## Development

Run from a checkout without installing:

```bash
claude --plugin-dir /path/to/thirsty-claude
```

Check it:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

Type-check it once the engine has laid `.claude-plugin/types/` (it does so on first load):

```bash
npx -y -p typescript@5.6.3 tsc -p .
```

Layout:

- `.claude-plugin/plugin.json`: the manifest.
- `.claude-plugin/marketplace.json`: makes this repository installable as a marketplace.
- `hooks/register.tsx`: the hooks module. Counting on `turn.step`, the pane on `ui.render`, the command on `command.run`.
- `hooks/pane.test.tsx`: tests, run by `claude plugin test`.
- `types/index.d.ts`: the shape of the value the mod stores in session state.

## License

MIT. See `LICENSE`.
