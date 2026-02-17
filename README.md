# ProofCheck

AI-powered alcohol beverage label verification tool. Upload a label image, extract text with AI, and compare it against expected application data to check compliance with TTB (Alcohol and Tobacco Tax and Trade Bureau) requirements.

**Live demo:** https://proof-check.cyrus-968.workers.dev

## Tech Stack

- **React Router v7** on **Cloudflare Workers** — server-side rendering at the edge with fast cold starts
- **Claude AI (Anthropic)** — vision models for label text extraction (Haiku for speed, Sonnet for accuracy)
- **shadcn/ui + Tailwind CSS** — accessible component library for a clean, usable UI
- **TypeScript** — end-to-end type safety
- **Vitest** — unit testing

## Setup

```bash
npm install
```

Create a `.dev.vars` file with your API key:

```
ANTHROPIC_API_KEY=sk-ant-...
AI_GATEWAY_URL=...             # optional, Cloudflare AI Gateway proxy
AI_GATEWAY_TOKEN=...           # optional, gateway auth token
```

Only `ANTHROPIC_API_KEY` is required. AI Gateway is optional.

## Development

```bash
npm run dev
```

Opens at `http://localhost:5173`.

## Testing

```bash
npm test              # run tests once
npm run test:watch    # watch mode
```

### Test Fixtures

The `test/fixtures/` directory contains real label images and CSV files for manual testing:

- **`labels/`** — Real label images sourced from the [TTB Public COLA Registry](https://www.ttb.gov/labeling/cola-public-registry) via the [COLA Cloud API](https://colacloud.us). Each file is named by its 14-digit TTB ID.
- **`csv/batch-valid.csv`** — All labels with correct expected data
- **`csv/batch-with-errors.csv`** — Same labels with intentional mismatches (wrong ABV, different brand casing, wrong class type) for testing comparison logic
- **`csv/batch-partial-match.csv`** — Subset of labels plus a nonexistent file, for testing unmatched file warnings
- **`csv/batch-missing-filename.csv`** — Missing `fileName` column, for testing CSV validation errors

To test manually: run `npm run dev`, go to `/batch`, upload the fixture images, and import a CSV file.

## Deployment

Deployed to Cloudflare Workers:

```bash
npm run deploy
```

Set production secrets via `wrangler secret put ANTHROPIC_API_KEY`.

## Architecture

```
app/
  routes/
    home.tsx          Landing page
    verify.tsx        Single label verification (extract + compare)
    batch.tsx         Batch verification (multiple labels)
    help.tsx          Help page with usage guide
  lib/
    extraction.server.ts    Model router (Sonnet vs Haiku)
    anthropic.server.ts     Claude API integration (raw fetch, structured output)
    comparison.server.ts    Field comparison logic + gov warning compliance
    types.ts                Shared TypeScript types
    constants.ts            TTB standard government warning text
    utils.ts                Shared utilities (cn, base64 encoding)
  components/               UI components (shadcn/ui + custom)
```

### Verification Flow

1. **Extract** — User uploads a label image. The server sends it to Claude which returns structured JSON with all label fields (brand name, ABV, net contents, government warning, etc.)
2. **Compare** — User optionally enters expected application data. The server runs field-by-field comparison with format normalization (ABV/Proof conversion, L/mL conversion, address abbreviation expansion).
3. **Result** — Each field gets a status (match / warning / mismatch / not_found). Overall status is approved, needs_review, or rejected. Government warning compliance is always checked against the TTB standard text (27 CFR 16.21-16.22).

### Batch Processing

The batch route supports uploading multiple label images at once with concurrency-limited parallel extraction. A template system lets users apply common expected data (e.g., same producer across all labels) to every file before comparing. Failed extractions can be retried without reprocessing the entire batch. Results can be downloaded as CSV for record-keeping.

## Approach and Assumptions

- **Two-step flow**: Extract first, then compare. This lets users verify extraction quality before submitting application data, and makes extraction independently useful.
- **Smart normalization**: Alcohol content accepts multiple formats (40% ABV, 80 Proof, "40% Alc./Vol. (80 Proof)") and cross-converts between proof and ABV. Net contents are compared as text (case-insensitive) to verify the label matches the application exactly. Addresses expand abbreviations (St to Street, Ave to Avenue, etc.).
- **Case-sensitive brand names with tolerance**: Exact match is preferred, but case-only differences (e.g., "STONE'S THROW" vs "Stone's Throw") produce a warning rather than a rejection. Labels often use stylized casing that differs from the application form.
- **Government warning compliance**: Checked against the exact TTB standard text. ALL CAPS and bold formatting for "GOVERNMENT WARNING:" are validated when the model can detect them.
- **Model choice**: Users can choose Haiku (faster, default) or Sonnet (more accurate). Both use prompted JSON output via the Anthropic API. Haiku defaults to meet the ~5 second response time requirement.
- **`beverageType` collected but unused**: The form collects beverage type for future use (TTB requirements vary by type), but current comparison logic doesn't branch on it.

## Trade-offs and Limitations

- **No persistent storage**: Results exist only in memory and clear on page refresh. Storing uploaded images in the browser (via IndexedDB) would add complexity without clear value for a prototype — the CSV export covers the need to save results. Production would need server-side storage.
- **No COLA integration**: The app is a standalone tool, not integrated with TTB's COLA system. Users manually enter expected data.
- **Bold detection is imprecise**: Vision models can detect ALL CAPS reliably but bold formatting detection from images is unreliable. The app flags explicit non-bold detection with a "verify manually" caveat.
- **No image preprocessing**: Poor lighting, extreme angles, or glare may reduce extraction quality. The extraction reports an image quality rating and confidence score.
- **Single-region deployment**: Runs on Cloudflare Workers (edge), but API calls to Anthropic route through their endpoints. Latency depends on the AI provider.
- **No authentication**: Open access, suitable for a prototype. Production would require auth and audit logging.
