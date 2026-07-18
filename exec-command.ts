// Deterministic slash commands (`exec`).
//
// A command in commands.json may carry `exec`: an absolute path to an
// executable. Those commands are answered by running it — no Claude turn, no
// tokens, latency of the script alone. Everything else keeps the model path.
//
// The script receives each slash option twice, whichever is easier to consume:
//   argv:  --<option> <value>  (argparse/getopts friendly)
//   env:   DISCORD_OPT_<OPTION> plus DISCORD_COMMAND / _USER_ID / _CHANNEL_ID
//
// stdout drives the reply:
//   a JSON object with "text" and/or "embed"  → rendered as such
//   anything else                             → posted verbatim as text
//
// ANY failure (missing/failed script, timeout, empty or unusable output)
// returns null, and the caller falls through to the normal model-handled path.
// A broken script degrades to today's behaviour instead of eating the command.
//
// This module deliberately knows nothing about discord.js so it can be tested
// without a gateway connection — see exec-command.test.ts.

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const EXEC_DEFAULT_TIMEOUT_MS = 15_000
export const EXEC_MAX_TIMEOUT_MS = 120_000
const EXEC_MAX_BUFFER = 1024 * 1024

export type ExecCommandDef = {
  name: string
  exec?: string
  exec_timeout_ms?: number
}

export type ExecContext = {
  options: { name: string; value: string }[]
  userId: string
  channelId: string
}

// `embed` stays untyped here (server.ts owns EmbedSpec); it is passed straight
// to buildEmbedFromSpec, which already tolerates partial specs.
export type ExecReply = { text?: string; embed?: Record<string, unknown> }

export function parseExecOutput(stdout: string): ExecReply | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && ('text' in parsed || 'embed' in parsed)) {
        const reply: ExecReply = {}
        if (typeof parsed.text === 'string' && parsed.text.trim()) reply.text = parsed.text
        if (parsed.embed && typeof parsed.embed === 'object') reply.embed = parsed.embed
        return reply.text || reply.embed ? reply : null
      }
    } catch {
      // Not JSON after all — fall through and treat it as plain text.
    }
  }
  return { text: trimmed }
}

// Runs the command's `exec`. Returns the reply to post, or null to fall back.
export async function runExecScript(
  def: ExecCommandDef,
  ctx: ExecContext,
  log: (msg: string) => void = msg => process.stderr.write(msg),
): Promise<ExecReply | null> {
  const script = def.exec
  if (!script) return null
  if (!script.startsWith('/')) {
    log(`discord: /${def.name} exec must be an absolute path, got "${script}" — falling back to Claude\n`)
    return null
  }

  const args: string[] = []
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    DISCORD_COMMAND: def.name,
    DISCORD_USER_ID: ctx.userId,
    DISCORD_CHANNEL_ID: ctx.channelId,
  }
  for (const opt of ctx.options) {
    args.push(`--${opt.name}`, opt.value)
    env[`DISCORD_OPT_${opt.name.toUpperCase()}`] = opt.value
  }

  const timeout = Math.min(def.exec_timeout_ms ?? EXEC_DEFAULT_TIMEOUT_MS, EXEC_MAX_TIMEOUT_MS)
  const started = Date.now()
  let stdout: string
  try {
    const result = await execFileAsync(script, args, { timeout, maxBuffer: EXEC_MAX_BUFFER, env })
    stdout = result.stdout
  } catch (err) {
    log(`discord: /${def.name} exec failed after ${Date.now() - started}ms: ${err} — falling back to Claude\n`)
    return null
  }

  const reply = parseExecOutput(stdout)
  if (!reply) {
    log(`discord: /${def.name} exec produced no usable output — falling back to Claude\n`)
    return null
  }
  log(`discord: /${def.name} answered by exec in ${Date.now() - started}ms\n`)
  return reply
}
