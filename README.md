# claude-plugin-discord

> **⚠️ Unofficial derivative work.** This repository is a **modified snapshot** of the Discord plugin from [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official) (version 0.0.4). It is **not affiliated with, endorsed by, or supported by Anthropic**. Redistributed under the terms of the upstream Apache 2.0 license — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE). For the official plugin, use `claude plugin install discord`.

Mirror del plugin Discord de Claude Code (`anthropics/claude-plugins-official`), con modificaciones locales aplicadas encima de la versión 0.0.4.

Este repo es un **snapshot** — NO está conectado al upstream. Se usa para:

- Backup privado del plugin instalado localmente
- Experimentar con modificaciones
- Conservar parches y features propios sin tener que reaplicarlos tras cada `claude plugin update discord`

## Qué contiene

El snapshot incluye cuatro bloques de cambios sobre el upstream:

1. **Plugin v0.0.4 base** — tal como se distribuye en `anthropics/claude-plugins-official` (la versión de `plugin.json` marca 0.0.4)
2. **Patch del issue #1091** — fix de la corrupción de `recipientId` en DMs tras prompts de permiso. Detalles en <https://github.com/anthropics/claude-plugins-official/issues/1091>
3. **Slash commands añadidos localmente** — soporte completo para registrar y servir slash commands de Discord vía un fichero `commands.json`. Añade imports `SlashCommandBuilder`, `REST`, `Routes`, `ApplicationCommandOptionType` y el bloque "Slash commands config" en `server.ts`
4. **Tools extra** — `send_embed` (embeds ricos para informes) y `send_buttons` (botones clicables con espera bloqueante, para aprobaciones remotas de acciones destructivas). Ver sección [Tools añadidos](#tools-añadidos).

## Tools añadidos

Encima de los tools del upstream (`reply`, `react`, `edit_message`, `status_message`, `fetch_messages`, `download_attachment`, `interaction_respond`, `register_commands`) este fork añade:

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

Copiado desde `~/.claude/plugins/cache/claude-plugins-official/discord/0.0.4/` el 2026-04-10.

## Estructura

```
.claude-plugin/plugin.json   # Metadata del plugin
.mcp.json                    # Config del servidor MCP (bun run start)
package.json                 # Dependencies (discord.js, @modelcontextprotocol/sdk)
server.ts                    # El código del plugin (con patch #1091 + slash commands)
skills/                      # Skills /discord:access y /discord:configure
ACCESS.md                    # Docs del modelo de control de acceso
bun.lock                     # Lockfile de Bun
```

## Instalación

### Opción 1 — Reemplazar el plugin instalado (recomendado)

Sobreescribe el directorio cacheado de Claude Code con el contenido de este repo. Útil después de un `claude plugin update discord` que haya revertido los parches.

```bash
# Asumiendo que el plugin instalado sigue siendo 0.0.4
rsync -a --exclude='node_modules' --exclude='.git' \
  ~/Projects/claude-plugin-discord/ \
  ~/.claude/plugins/cache/claude-plugins-official/discord/0.0.4/

# Reinstalar dependencies si node_modules estaba vacío o desactualizado
cd ~/.claude/plugins/cache/claude-plugins-official/discord/0.0.4/
bun install
```

Después reinicia Claude Code para que cargue el plugin actualizado.

### Opción 2 — Instalación fresca desde cero

Si no tienes el plugin instalado via `claude plugin install discord`, puedes clonar este repo y apuntar Claude Code a él:

```bash
git clone https://github.com/ermitovski/claude-plugin-discord.git ~/Projects/claude-plugin-discord
cd ~/Projects/claude-plugin-discord
bun install
```

Luego copia el contenido al cache de plugins (mismo comando que la Opción 1).

### Configurar el bot después de instalar

El plugin lee su estado de `~/.claude/channels/discord/` por defecto (override con `DISCORD_STATE_DIR`). Necesitas:

- `~/.claude/channels/discord/.env` con `DISCORD_BOT_TOKEN=...`
- `~/.claude/channels/discord/access.json` con la allowlist de usuarios/canales autorizados
- Opcionalmente `~/.claude/channels/discord/commands.json` si usas slash commands

Ver el skill `/discord:configure` dentro del propio plugin para guiar el setup.

### ⚠️ Sólo una sesión de Claude debe cargar el plugin

Si dos procesos de `claude` cargan este plugin simultáneamente, ambos abren un gateway de Discord con el mismo bot token. Cada slash command llega a las dos sesiones, las dos llaman `deferReply()`, una gana el ack y la otra falla — y `interaction_respond` revienta luego con `The reply to this interaction has not been sent or deferred`.

Para evitarlo: **desactiva el plugin globalmente** en `~/.claude/settings.json` y déjalo cargado sólo en la sesión que lo necesita (típicamente un wrapper que arranca con `claude --channels plugin:discord@claude-plugins-official`):

```json
{
  "enabledPlugins": {
    "discord@claude-plugins-official": false
  }
}
```

Desde la PR #6 el plugin loguea a stderr cuando `deferReply` falla, así que si vuelves a ver el síntoma busca `discord: deferReply failed` en los logs — casi seguro hay un segundo proceso cargando el plugin.

## Restaurar tras `claude plugin update discord`

Si en el futuro actualizas el plugin y quieres volver a aplicar este snapshot:

```bash
# 1. Localizar la versión nueva instalada
ls ~/.claude/plugins/cache/claude-plugins-official/discord/

# 2. Copiar este snapshot encima (ajustando la versión destino)
rsync -a --exclude='node_modules' --exclude='.git' \
  ~/Projects/claude-plugin-discord/ \
  ~/.claude/plugins/cache/claude-plugins-official/discord/<NUEVA_VERSION>/

# 3. Reinstall deps y reiniciar Claude Code
cd ~/.claude/plugins/cache/claude-plugins-official/discord/<NUEVA_VERSION>/
bun install
```

Ojo: si el plugin upstream ha cambiado cosas incompatibles, hay que mergearlo a mano — este repo NO es un fork con tracking del upstream.
