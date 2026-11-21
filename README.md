# claude-plugin-discord

> **⚠️ Unofficial derivative work.** This repository is a **modified snapshot** of the Discord plugin from [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official) (version 0.0.6). It is **not affiliated with, endorsed by, or supported by Anthropic**. Redistributed under the terms of the upstream Apache 2.0 license — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE). For the official plugin, use `claude plugin install discord`.

Mirror del plugin Discord de Claude Code (`anthropics/claude-plugins-official`), con modificaciones locales aplicadas encima de la versión 0.0.6.

Este repo es un **snapshot** — NO está conectado al upstream. Se usa para:

- Backup privado del plugin instalado localmente
- Experimentar con modificaciones
- Conservar parches y features propios: al instalarse desde su propio marketplace (`discord@ermitovski`), el autoupdate del oficial no los pisa

## Instalación

El repo es también un marketplace (`ermitovski`, en `.claude-plugin/marketplace.json`). Se instala como `discord@ermitovski`, separado de `discord@claude-plugins-official`, para que el autoupdate del marketplace oficial no pise el fork:

```bash
claude plugin marketplace add ermitovski/claude-plugin-discord
claude plugin install discord@ermitovski
```

El plugin se sigue llamando `discord`: los tools (`mcp__plugin_discord_discord__*`), el estado en `~/.claude/channels/discord/` y `/discord:access` son los mismos que con el oficial. No instalar los dos a la vez.

`--channels` solo admite plugins de la allowlist de Anthropic, que casa nombre y marketplace. Para `plugin:discord@ermitovski` hace falta declararlo en managed settings (`/Library/Application Support/ClaudeCode/managed-settings.json` en macOS):

```json
{
  "channelsEnabled": true,
  "allowedChannelPlugins": [{ "plugin": "discord", "marketplace": "ermitovski" }]
}
```

`allowedChannelPlugins` sustituye a la allowlist por defecto de Anthropic.

La cache de plugins se versiona por `version` de `.claude-plugin/plugin.json` (`~/.claude/plugins/cache/ermitovski/discord/<version>/`): subirla en cada cambio que deba llegar a las instalaciones.

## Qué contiene

El snapshot incluye cinco bloques de cambios sobre el upstream:

1. **Plugin v0.0.6 base** — tal como se distribuye en `anthropics/claude-plugins-official` (la versión de `plugin.json` marca 0.0.6). La 0.0.6 añade el tool `list_emojis`; la 0.0.5,  el tool `create_thread` y el fix #1365 de `recipientId`; este último no se porta porque el patch #1091 de abajo ya lo cubre y además descarta el caso en que `recipientId` es el ID del propio bot
2. **Patch del issue #1091** — fix de la corrupción de `recipientId` en DMs tras prompts de permiso. Detalles en <https://github.com/anthropics/claude-plugins-official/issues/1091>
3. **Slash commands añadidos localmente** — soporte completo para registrar y servir slash commands de Discord vía un fichero `commands.json`. Añade imports `SlashCommandBuilder`, `REST`, `Routes`, `ApplicationCommandOptionType` y el bloque "Slash commands config" en `server.ts`
4. **Tools extra** — `send_embed` (embeds ricos para informes) y `send_buttons` (botones clicables con espera bloqueante, para aprobaciones remotas de acciones destructivas). Ver sección [Tools añadidos](#tools-añadidos).
5. **Slash commands deterministas (`exec`)** — un comando puede responder ejecutando un script, sin despertar al modelo. Ver sección [Comandos deterministas](#comandos-deterministas-exec).

## Comandos deterministas (`exec`)

Por defecto, cada slash command se le entrega al modelo, que lo interpreta y responde con `interaction_respond`. Eso cuesta un turno de modelo (tokens + latencia) aunque el comando siempre haga exactamente lo mismo.

Un comando en `commands.json` puede llevar `exec`: la ruta **absoluta** de un ejecutable. Si está presente, el plugin lo ejecuta y responde con su salida — sin turno de modelo, sin tokens, a la latencia del script.

```json
{
  "name": "crypto",
  "description": "Bitcoin portfolio - precio actual y holdings",
  "guild_id": "123...",
  "exec": "/Users/tu/scripts/crypto.py",
  "exec_timeout_ms": 15000
}
```

**Entrada.** El script recibe cada opción del slash command por partida doble, la que le resulte más cómoda:

| Vía | Forma |
|-----|-------|
| argv | `--<opción> <valor>` (compatible con argparse/getopts) |
| env | `DISCORD_OPT_<OPCIÓN>`, más `DISCORD_COMMAND`, `DISCORD_USER_ID`, `DISCORD_CHANNEL_ID` |

**Salida.** Lo que el script imprima por stdout decide la respuesta:

- Un objeto JSON con `text` y/o `embed` → se renderiza como tal. El `embed` usa el mismo esquema que el tool `send_embed`.
- Cualquier otra cosa → se publica como texto tal cual (truncado a 2000 caracteres, el límite de Discord).

```sh
#!/bin/sh
# Texto plano
echo "BTC: 95.000€ (+2,3%)"

# ...o un embed
cat <<'EOF'
{"embed":{"title":"Bitcoin","color":"orange","fields":[{"name":"Precio","value":"95.000€"}]}}
EOF
```

**Degradación.** Cualquier fallo —script inexistente, salida vacía, exit code ≠ 0, timeout, ruta relativa— cae al comportamiento normal: el comando se le entrega al modelo, igual que si no hubiera `exec`. Un script roto nunca se come el comando; como mucho lo hace lento. Los fallos se registran en stderr.

`exec_timeout_ms` por defecto son 15 s, con un tope de 120 s.

**Cuándo usarlo.** Comandos que siempre ejecutan lo mismo y devuelven una respuesta con formato fijo (portfolios, estados, métricas). Lo que necesite interpretar, decidir o redactar, mejor déjalo en el modelo.

## Tools añadidos

Encima de los tools del upstream (`reply`, `react`, `list_emojis`, `edit_message`, `status_message`, `fetch_messages`, `download_attachment`, `create_thread`, `interaction_respond`, `register_commands`) este fork añade:

### `send_embed`

Envía un embed Discord con título, descripción, color, fields, footer, thumbnail, imagen, autor y timestamp. Útil para informes estructurados (daily briefing, solar, finanzas, crypto) — se renderizan mucho mejor en móvil que los bullets en texto plano.

```ts
send_embed({
  chat_id: "1467502243849834507",
  title: "☀️ Solar — Hoy",
  description: "Producción récord del mes",
  color: "orange",
  fields: [
    { name: "Producción", value: "34.2 kWh", inline: true },
    { name: "Consumo",    value: "18.5 kWh", inline: true },
    { name: "Batería",    value: "92%",       inline: true },
  ],
  footer: "Huawei SUN2000-6KTL-L1",
  timestamp: "now",
})
```

### `send_buttons`

Envía un mensaje con botones clicables y **bloquea** hasta que un usuario autorizado pulse uno (o hasta timeout). Pensado para aprobaciones remotas: en vez de pedir al usuario que escriba "sí/no", le mandas `[Approve] [Reject]` y espera el click desde el móvil. Al clickar, el mensaje se edita para mostrar quién pulsó qué y los botones se deshabilitan (auditoría en el historial del canal).

```ts
const r = await send_buttons({
  chat_id: "1472689227660656794",
  text: "🔄 Backup de Vaultwarden en d4800 — ¿proceder?",
  buttons: [
    { label: "Backup", value: "yes", style: "success", emoji: "✅" },
    { label: "Cancel", value: "no",  style: "danger",  emoji: "❌" },
  ],
  timeout_s: 600, // 10 min
})
// r.clicked -> "yes" / "no"
```

- `timeout_s`: default 300 (5 min), max 840 (14 min, límite de Discord interactions).
- `allowed_users`: por defecto la allowlist completa; pásalo para restringir (p. ej. sólo admin principal).
- Máximo 25 botones (5 filas de 5). Estilos: `primary`/`secondary`/`success`/`danger`.

## Origen

Copiado desde `~/.claude/plugins/cache/claude-plugins-official/discord/0.0.4/` el 2026-04-10. Rebasado sobre upstream 0.0.5 (commit `41448d41`, #9) y portado a 0.0.6 (#11) el 2026-11-18. Desde #10 el repo es su propio marketplace.

## Estructura

```
.claude-plugin/plugin.json   # Metadata del plugin
.mcp.json                    # Config del servidor MCP (bun run start)
package.json                 # Dependencies (discord.js, @modelcontextprotocol/sdk)
server.ts                    # El código del plugin (con patch #1091 + slash commands)
exec-command.ts              # Runner de comandos deterministas (`exec`)
exec-command.test.ts         # Tests del runner (bun test)
skills/                      # Skills /discord:access y /discord:configure
ACCESS.md                    # Docs del modelo de control de acceso
bun.lock                     # Lockfile de Bun
```

## Configurar el bot después de instalar

El plugin lee su estado de `~/.claude/channels/discord/` por defecto (override con `DISCORD_STATE_DIR`). Necesitas:

- `~/.claude/channels/discord/.env` con `DISCORD_BOT_TOKEN=...`
- `~/.claude/channels/discord/access.json` con la allowlist de usuarios/canales autorizados
- Opcionalmente `~/.claude/channels/discord/commands.json` si usas slash commands

Ver el skill `/discord:configure` dentro del propio plugin para guiar el setup.

## ⚠️ Sólo una sesión de Claude debe cargar el plugin

Si dos procesos de `claude` cargan este plugin simultáneamente, ambos abren un gateway de Discord con el mismo bot token. Cada slash command llega a las dos sesiones, las dos llaman `deferReply()`, una gana el ack y la otra falla — y `interaction_respond` revienta luego con `The reply to this interaction has not been sent or deferred`.

Para evitarlo: **desactiva el plugin globalmente** en `~/.claude/settings.json` y actívalo sólo en la sesión que lo necesita (típicamente un wrapper):

```json
{
  "enabledPlugins": {
    "discord@ermitovski": false
  }
}
```

```bash
claude --settings '{"enabledPlugins":{"discord@ermitovski":true}}' \
       --channels plugin:discord@ermitovski
```

`--settings` prevalece sobre los user settings.

Desde la PR #6 el plugin loguea a stderr cuando `deferReply` falla, así que si vuelves a ver el síntoma busca `discord: deferReply failed` en los logs — casi seguro hay un segundo proceso cargando el plugin.

## Actualizar

**Un cambio en este repo → las instalaciones.** Sube `version` en `.claude-plugin/plugin.json` en el mismo PR (la cache va por versión: sin subirla, `plugin update` no trae nada). Después, en cada máquina:

```bash
claude plugin marketplace update ermitovski
claude plugin update discord@ermitovski
```

y relanza la sesión que carga el plugin.

**Una versión nueva de upstream.** Este repo no hace tracking del upstream: los cambios se portan a mano en un PR (ejemplos: #9 → 0.0.5, #11 → 0.0.6), subiendo `version` al valor de upstream. Para saber si hay versión nueva, compara con `~/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/discord/.claude-plugin/plugin.json`.
