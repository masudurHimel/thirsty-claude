# Thirsty Claude

A Claude Code mod that shows, beside the chat, how much water your session has cost: a tap dripping into a one-litre bucket. The bucket fills as tokens are spent, the tap drips while a reply is running, and past one litre the water spills over the rim.

![Thirsty Claude: the pane opens beside the chat and the tap drips into the bucket while a reply runs](asset/demo.gif)

```
      THIRSTY CLAUDE
  what this chat costs in water

           (tap and bucket)

🪣  Session       ≈ 0.37 L
💬  This prompt   ≈ 25 mL

   Actual use may range from half to twice this figure
   Want to know how this is measured?
```

The desktop app draws an animated SVG. A terminal session gets a box-character bucket with a falling drop.

## Install

One install at the user scope covers every way you run Claude Code on that machine: the terminal, the desktop app and the IDE extensions all load the same plugins.

### Terminal

At the prompt of a Claude Code session:

```
/plugin install thirsty_claude --marketplace masudurHimel/thirsty-claude
```

Answer `y` to add the marketplace, then pick a scope; user is the usual one. The mod is active in that session at once.

### Shell

From any shell, without opening a session:

```bash
claude plugin install thirsty_claude --marketplace masudurHimel/thirsty-claude
```

This is the route to use in scripts and on machines you set up by hand. Sessions started afterwards load it; a running one needs `/reload-plugins`.

### Desktop app (macOS, Windows)

The `/plugin` command does not run in the desktop app's Code tab. Instead:

1. Click **+** next to the prompt box, then **Plugins**.
2. Choose **Add marketplace** and enter `masudurHimel/thirsty-claude`.
3. Choose **Add plugin** and pick `thirsty_claude`.

Or run the shell command above and then `/reload-plugins` in the open session.

### VS Code and JetBrains

The extensions run the same Claude Code engine and read the same user-scope plugins. Install with the shell command above, then start a new session in the IDE or run `/reload-plugins` in an open one.

### Verifying

```bash
claude plugin list
```

should show `thirsty_claude@thirsty-claude` with status enabled. In a session, `/thirsty_claude` opens the pane.

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

**Short version:** nothing here is measured. Anthropic publishes no energy or water figures for Claude: its October 2026 S-1 filing and Public Benefit Report carry none [[6]](#sources), and independent trackers report the same gap [[5]](#sources). The mod takes the token counts the API reports for every response, weights them by how much work each kind of token causes, multiplies by a per-model water rate derived from other providers' disclosures [[1]](#sources) [[2]](#sources) [[3]](#sources), and adds them up. The result is an estimate: actual use may range from half to twice the figure shown, as explained below.

### Where water goes

AI uses water in two places:

1. **Cooling the data centre.** Many sites use evaporative cooling, which turns fresh water into vapour that is not recovered. Google reports a 2024 fleet-average water-use effectiveness of about 1.1 litres per kilowatt-hour of IT energy, the figure behind its 0.26 mL per median Gemini prompt [[1]](#sources). Other hosts report lower on-site figures: Microsoft about 0.30 L/kWh and AWS about 0.12 L/kWh withdrawn, as collected by Projet Celsius [[5]](#sources).
2. **Generating the electricity.** Gas, coal and nuclear plants use water for cooling. Li, Yang, Islam and Ren put the US-average water consumption of electricity generation at about 3.1 litres per kilowatt-hour, often larger than the on-site figure [[4]](#sources). Hydro and wind use almost none.

The mod's rates are "all-in": both parts together, on a US-average grid, following the method of [[4]](#sources).

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

- **The base rate, about 2 µL per weighted token.** Google reports 0.24 Wh and 0.26 mL of on-site water for its median Gemini text prompt [[1]](#sources). Epoch AI estimates about 0.3 Wh for a typical GPT-4o query [[2]](#sources), and OpenAI's CEO gave 0.34 Wh and about 0.32 mL per average ChatGPT query [[3]](#sources). Google did not disclose the token count behind its median; assuming a few hundred tokens per prompt and adding the US-average power-plant water of [[4]](#sources) gives roughly 2 µL per token for a frontier model.
- **The model-family scaling.** A bigger model moves more silicon per token. Haiku-class at a quarter and Opus-class at two and a half times the Sonnet rate is a judgement from relative size and price, not a measurement. For comparison, Projet Celsius models Claude Opus-class at 2.8 Wh per 1,000 written tokens and 0.9 Wh per 1,000 read tokens [[5]](#sources), and the CLEER dataset puts a typical Opus 5 chat at about 1.6 Wh [[6]](#sources).
- **The weights.** Prefill of input tokens runs in one parallel batch; each output token is a separate pass through the model; cache reads skip most of the compute. The 0.1 and 5 are informed guesses from how a transformer serves a request. Projet Celsius's roughly 3:1 written-to-read energy ratio [[5]](#sources) and Epoch's note that a 10,000-token input raises a query from 0.3 to about 2.5 Wh [[2]](#sources) are the nearest published anchors.

### How accurate it is

Actual use may range from half to twice the figure shown. That range comes from propagating the plausible range of each input (energy per token, cooling water per kWh, grid water per kWh, the token weights) through the formula above; it is a judgement about the spread, not a measured error, since no ground truth for Claude exists. The uncertainty splits into:

| Source of error | Rough weight | Who can close it |
|---|---|---|
| Energy per token for Claude specifically | largest | Only Anthropic, by publishing per-query figures |
| Water intensity at the actual data centre | large | Anthropic or the cloud host; known only if traffic runs through Bedrock or Vertex in a named region |
| The weights and model-family rates | smaller | Better measurements of inference; the constants are tunable |

Third-party estimates for Claude exist [[5]](#sources) [[6]](#sources) and land in the same ballpark as this mod: converting Projet Celsius's 2.8 Wh per 1,000 written tokens with Google's on-site water [[1]](#sources) and the power-plant water of [[4]](#sources) gives roughly 12 µL per Opus-class output token all-in, against this mod's 25 µL. They are modelled, not measured, so agreement between them is reassuring but not proof.

The older figure that circulates online, about 500 mL per 10 to 50 responses, comes from the 2023 version of [[4]](#sources) for GPT-3 on 2023 hardware. It is roughly 50 to 100 times this mod's rates. The 2025 company disclosures [[1]](#sources) [[3]](#sources) are far lower, mainly because of newer chips and better measurement.

### What would make it better

- Anthropic publishing energy and water per query, as Google did.
- Knowing the region and cooling design of the data centre that answered.
- Measured weights for cache reads and output tokens rather than estimates.

All constants sit at the top of `hooks/register.tsx`: `WEIGHTS`, `RATES_UL`, `DEFAULT_RATE_UL`, `BUCKET_ML` and `ACCURACY_NOTE`. Change them there.

### Sources

1. Google Cloud, "Measuring the environmental impact of delivering AI at Google scale", August 2025. Median Gemini Apps text prompt: 0.24 Wh, 0.03 gCO2e, 0.26 mL water; 2024 fleet-average water-use effectiveness. Blog: https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference and paper: https://arxiv.org/abs/2508.15734
2. Epoch AI, "How much energy does ChatGPT use?", February 2025. About 0.3 Wh per typical GPT-4o query; about 2.5 Wh with a 10,000-token input. https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
3. Sam Altman, "The Gentle Singularity", June 2025. Average ChatGPT query: 0.34 Wh and 0.000085 gallons (about 0.32 mL) of water; no methodology given. https://blog.samaltman.com/the-gentle-singularity
4. Pengfei Li, Jianyi Yang, Mohammad A. Islam, Shaolei Ren, "Making AI Less 'Thirsty': Uncovering and Addressing the Secret Water Footprint of AI Models", 2023, revised 2025. On-site plus off-site (power generation) water method; US-average electricity water intensity about 3.1 L/kWh; the GPT-3 "500 mL per 10 to 50 responses" figure. https://arxiv.org/abs/2304.03271
5. Projet Celsius, "How much energy and water do Claude Fable 5.2 and Opus 5.5 use?", November 2026. Modelled: 2.8 Wh per 1,000 written tokens, 0.9 Wh per 1,000 read tokens, hosts' water-use effectiveness (Google 1.15, Microsoft 0.30, AWS 0.12 L/kWh). Notes that Anthropic publishes no figures. https://projetcelsius.com/en/blog/fable-5-2-opus-5-5-energy-water/
6. azvai, "Is Claude sustainable? Anthropic's environmental impact, per its S-1", 2026. Reports that Anthropic's October 2026 S-1 and Public Benefit Report give no energy, water or emissions numbers; quotes the CLEER dataset (Sustainable AI Group, September 2026): about 1.6 Wh per typical Opus 5 chat, about 43 Wh per agentic session. https://azvai.com/en/is-claude-sustainable/

Sources 1 to 3 are company disclosures. Source 4 is peer-reviewed academic work. Sources 5 and 6 are third-party modelling and reporting, not audited.

## FAQ

### Why is it showing so much water?

- **It counts everything the session does, not just your typed prompts.** Every model response is counted: each tool-call step, each file read, each subagent. One prompt in a coding session can be dozens of responses.
- **Every response re-reads the whole conversation.** A long session carries hundreds of thousands of tokens of context into every step. Cache reads are charged at a tenth of a fresh token, but there are so many that they still add up.
- **Output is charged five times a fresh input token**, and reasoning tokens count as output. A reply that thought for a few thousand hidden tokens costs more than the visible answer suggests.
- **The rate is all-in.** Roughly three quarters of each figure is water used to generate the electricity, not water at the data centre. On-site cooling alone would be about a quarter of what the pane shows.
- **Scale check.** A full day of agentic work on an Opus-class model can reach 10 to 15 litres. That is about two minutes of a shower, and under one percent of the water behind a single beef burger. It looks large only because it is honest about the total, where a "per prompt" figure is not.

### How do you know the real figure is within half to twice this?

- **It is a judgement, not a measurement.** Nobody outside Anthropic can measure Claude's water use, because Anthropic publishes no energy or water figures. The range says how far off the estimate is likely to be, not that it has been checked.
- **What it rests on.** Four inputs with published or reasoned ranges: energy per token from Google's and OpenAI's disclosures [[1]](#sources) [[2]](#sources) [[3]](#sources), cooling water per kWh from Google's fleet figure [[1]](#sources), grid water per kWh from peer-reviewed work [[4]](#sources), and token weights from how inference works. Propagating those ranges through the formula gives a spread of roughly a factor of two either way.
- **Independent cross-checks.** Estimates that used different methods, Projet Celsius per token [[5]](#sources) and CLEER per chat [[6]](#sources), land within about 2x of this mod. That is consistency, not proof.
- **What would settle it.** A per-query figure from Anthropic, as Google published for Gemini. The mod's prediction for a median text prompt on a Sonnet-class model is on the order of 1 to 3 mL all-in; if Anthropic publishes a number, that is the line to check it against.

### Why does the count start at zero in every session?

The mod stores its totals in the session's state, which Claude Code keeps per session. A new session starts fresh. Closing and reopening the pane within a session does not reset it.

### Can I change the rates?

Yes. `WEIGHTS`, `RATES_UL`, `DEFAULT_RATE_UL`, `BUCKET_ML` and `ACCURACY_NOTE` are constants at the top of `hooks/register.tsx`. Edit them, run `claude plugin test .`, and reload.

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
