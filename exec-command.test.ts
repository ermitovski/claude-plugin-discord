import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseExecOutput, runExecScript, EXEC_MAX_TIMEOUT_MS } from './exec-command'

let dir: string
const script = (name: string, body: string): string => {
  const p = join(dir, name)
  writeFileSync(p, body)
  chmodSync(p, 0o755)
  return p
}

const ctx = { options: [], userId: 'U1', channelId: 'C1' }
const quiet = () => {}

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'exec-cmd-')) })
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

// ── parseExecOutput ──────────────────────────────────────────────────

test('plain text becomes text', () => {
  expect(parseExecOutput('BTC 95.000€\n')).toEqual({ text: 'BTC 95.000€' })
})

test('JSON envelope with embed is parsed', () => {
  const out = parseExecOutput('{"embed":{"title":"Crypto","fields":[]}}')
  expect(out?.embed).toEqual({ title: 'Crypto', fields: [] })
  expect(out?.text).toBeUndefined()
})

test('JSON envelope with both text and embed keeps both', () => {
  const out = parseExecOutput('{"text":"hola","embed":{"title":"T"}}')
  expect(out).toEqual({ text: 'hola', embed: { title: 'T' } })
})

test('JSON without text/embed keys is treated as plain text', () => {
  // A script printing raw data JSON shouldn't be silently swallowed.
  expect(parseExecOutput('{"btc": 95000}')).toEqual({ text: '{"btc": 95000}' })
})

test('malformed JSON falls back to text, not a crash', () => {
  expect(parseExecOutput('{oops')).toEqual({ text: '{oops' })
})

test('empty or whitespace output returns null', () => {
  expect(parseExecOutput('')).toBeNull()
  expect(parseExecOutput('   \n ')).toBeNull()
})

test('envelope with empty text and no embed returns null', () => {
  expect(parseExecOutput('{"text":"   "}')).toBeNull()
})

// ── runExecScript ────────────────────────────────────────────────────

test('runs the script and returns its output', async () => {
  const p = script('ok.sh', '#!/bin/sh\necho "hola mundo"\n')
  expect(await runExecScript({ name: 'x', exec: p }, ctx, quiet)).toEqual({ text: 'hola mundo' })
})

test('options arrive as --name value on argv', async () => {
  const p = script('args.sh', '#!/bin/sh\necho "$@"\n')
  const out = await runExecScript({ name: 'tou', exec: p }, {
    ...ctx, options: [{ name: 'day', value: 'today' }, { name: 'n', value: '3' }],
  }, quiet)
  expect(out).toEqual({ text: '--day today --n 3' })
})

test('options and context also arrive as env vars', async () => {
  const p = script('env.sh', '#!/bin/sh\necho "$DISCORD_COMMAND $DISCORD_OPT_DAY $DISCORD_USER_ID $DISCORD_CHANNEL_ID"\n')
  const out = await runExecScript({ name: 'tou', exec: p }, {
    options: [{ name: 'day', value: 'today' }], userId: 'U9', channelId: 'C9',
  }, quiet)
  expect(out).toEqual({ text: 'tou today U9 C9' })
})

test('non-zero exit falls back (null)', async () => {
  const p = script('fail.sh', '#!/bin/sh\necho "algo"\nexit 1\n')
  expect(await runExecScript({ name: 'x', exec: p }, ctx, quiet)).toBeNull()
})

test('script writing only to stderr falls back', async () => {
  const p = script('stderr.sh', '#!/bin/sh\necho "boom" >&2\n')
  expect(await runExecScript({ name: 'x', exec: p }, ctx, quiet)).toBeNull()
})

test('timeout falls back instead of hanging the interaction', async () => {
  const p = script('slow.sh', '#!/bin/sh\nsleep 5\necho "tarde"\n')
  const started = Date.now()
  const out = await runExecScript({ name: 'x', exec: p, exec_timeout_ms: 300 }, ctx, quiet)
  expect(out).toBeNull()
  expect(Date.now() - started).toBeLessThan(3000)
})

test('missing script falls back', async () => {
  expect(await runExecScript({ name: 'x', exec: '/nonexistent/nope.sh' }, ctx, quiet)).toBeNull()
})

test('relative path is rejected (no PATH lookup)', async () => {
  expect(await runExecScript({ name: 'x', exec: 'echo' }, ctx, quiet)).toBeNull()
})

test('no exec field returns null', async () => {
  expect(await runExecScript({ name: 'x' }, ctx, quiet)).toBeNull()
})

test('timeout is capped', async () => {
  // A huge exec_timeout_ms must not let a wedged script hold the interaction
  // open indefinitely; the cap is what the runner actually applies.
  const p = script('quick.sh', '#!/bin/sh\necho ok\n')
  expect(await runExecScript({ name: 'x', exec: p, exec_timeout_ms: 999_999_999 }, ctx, quiet))
    .toEqual({ text: 'ok' })
  expect(EXEC_MAX_TIMEOUT_MS).toBeLessThanOrEqual(120_000)
})

test('a script emitting an embed envelope round-trips', async () => {
  const p = script('embed.sh', `#!/bin/sh\ncat <<'EOF'\n{"embed":{"title":"Bitcoin","color":"orange","fields":[{"name":"Precio","value":"95.000€"}]}}\nEOF\n`)
  const out = await runExecScript({ name: 'crypto', exec: p }, ctx, quiet)
  expect(out?.embed).toEqual({
    title: 'Bitcoin', color: 'orange',
    fields: [{ name: 'Precio', value: '95.000€' }],
  })
})
