# Thirsty Claude

A Claude Code mod that shows, beside the chat, how much water your session has cost: a tap dripping into a one-litre bucket. The bucket fills as tokens are spent, the tap drips while a reply is running, and past one litre the water spills over the rim.

```
      THIRSTY CLAUDE
  what this chat costs in water

           (tap and bucket)

🪣  Session       ≈ 0.37 L
💬  This prompt   ≈ 25 mL

   estimate: about 60% accurate
   Want to know how this is measured?
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

### Updating

```bash
claude plugin marketplace update thirsty-claude
```

```bash
claude plugin update thirsty_claude@thirsty-claude
```

Then `/reload-plugins` in any open session. To have Claude Code do this on its own at session start, add `"autoUpdate": true` to the marketplace's entry under `extraKnownMarketplaces` in `~/.claude/settings.json`.

## Using it

- The pane stays closed until you ask for it:

  ```
  /thirsty_claude
  ```

- Counting runs from the session's start regardless, so the bucket is right whenever you open it.
- Close the pane with its cross; `/thirsty_claude` brings it back at the same level.
- The count is per session and starts at zero with each new session.

## How the water is estimated

**Short version:** nothing here is measured. Anthropic publishes no energy or water figures for Claude. The mod takes the token counts the API reports for every response, weights them by how much work each kind of token causes, multiplies by a per-model water rate derived from other providers' disclosures, and adds them up. The result is an order-of-magnitude estimate, about 60% accurate, as explained below.

### Where water goes

AI uses water in two places:

1. **Cooling the data centre.** Many sites use evaporative cooling, which turns fresh water into vapour that is not recovered. Google reports a fleet average of about 1.1 litres per kilowatt-hour of IT energy.
2. **Generating the electricity.** Gas, coal and nuclear plants use water for cooling. On a US-average grid this is roughly 3 litres per kilowatt-hour, and often larger than the on-site figure. Hydro and wind use almost none.

The mod's rates are "all-in": both parts together, on a US-average grid.

### What is counted

Every model response carries four token counts. Each is weighted relative to one fresh input token:

| Token kind | Weight | Why |
|---|---|---|
| Fresh input | 1 | Processed once, in one parallel batch |
| Cache write | 1.1 | A fresh input plus the cost of storing it |
| Cache read | 0.1 | Served from the prompt cache, little compute |
| Output, thinking included | 5 | Each generated token runs the whole model once |

The weighted sum is multiplied by a rate for the model family that answered, matched on the model id:

| Model family | Microlitres per weighted token |
|---|---|
| haiku | 0.5 |
| sonnet | 2 |
| opus, fable, mythos | 5 |
| anything else | 2 |

"This prompt" is every response of the current turn, tool calls and subagents included. "Session" is every response since the session started.

### A worked example

One step of a long session on a Sonnet-class model: 1,000 fresh input tokens, 2,000 written to cache, 100,000 read from cache, 500 generated.

```
weighted = 1,000 × 1 + 2,000 × 1.1 + 100,000 × 0.1 + 500 × 5 = 15,700
water    = 15,700 × 2 µL = 31,400 µL ≈ 31 mL
```

Without the weights, the same step would count 103,500 tokens at a flat rate and come out several times higher. That is why cache reads matter: in a long chat they are most of the count.

### Where the numbers come from

- **The base rate, about 2 µL per weighted token.** Google reports 0.24 Wh and 0.26 mL of on-site water for its median Gemini text prompt. Epoch AI estimates about 0.3 Wh for a typical GPT-4o query. Assuming a few hundred tokens per median prompt and adding US-average power-plant water gives roughly 2 µL per token for a frontier model.
- **The model-family scaling.** A bigger model moves more silicon per token. Haiku-class at a quarter and Opus-class at two and a half times the Sonnet rate is a judgement from relative size and price, not a measurement.
- **The weights.** Prefill of input tokens runs in one parallel batch; each output token is a separate pass through the model; cache reads skip most of the compute. The 0.1 and 5 are informed guesses from how a transformer serves a request.

### How accurate it is

About 60 out of 100. Expect the figure to be within roughly ±50% of the truth most of the time, and within 2x nearly always. The remaining uncertainty splits into:

| Source of error | Rough share | Who can close it |
|---|---|---|
| Energy per token for Claude specifically | 15 points | Only Anthropic, by publishing per-query figures |
| Water intensity at the actual data centre | 15 points | Anthropic or the cloud host; known only if traffic runs through Bedrock or Vertex in a named region |
| The weights and model-family rates | 10 points | Better measurements of inference; the constants are tunable |

Third-party estimates for Claude exist (Projet Celsius, CLEER) and land in the same ballpark as this mod, with Opus-class output tokens estimated at roughly 12 µL all-in against this mod's 25 µL. They are modelled, not measured, so agreement between them is reassuring but not proof.

### What would make it better

- Anthropic publishing energy and water per query, as Google did.
- Knowing the region and cooling design of the data centre that answered.
- Measured weights for cache reads and output tokens rather than estimates.

All constants sit at the top of `hooks/register.tsx`: `WEIGHTS`, `RATES_UL`, `DEFAULT_RATE_UL`, `BUCKET_ML` and `ACCURACY_NOTE`. Change them there.

### Sources

- Google, "Measuring the environmental impact of delivering AI at Google scale", August 2025: https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference
- Epoch AI, "How much energy does ChatGPT use?", February 2025: https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
- Sam Altman, "The Gentle Singularity", June 2025, for the 0.34 Wh and 0.32 mL ChatGPT figures: https://blog.samaltman.com/the-gentle-singularity
- Li, Yang, Islam, Ren, "Making AI Less Thirsty", 2023, revised 2025, for the power-plant water method: https://arxiv.org/abs/2304.03271
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
