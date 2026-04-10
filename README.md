# claude-plugin-discord

Private mirror del plugin Discord de Claude Code (`anthropics/claude-plugins-official`), con modificaciones locales aplicadas encima de la versión 0.0.4.

Este repo es un **snapshot** — NO está conectado al upstream. Se usa para:

- Backup privado del plugin instalado localmente
- Experimentar con modificaciones
- Conservar parches y features propios sin tener que reaplicarlos tras cada `claude plugin update discord`

## Qué contiene

El snapshot incluye tres bloques de cambios sobre el upstream:

1. **Plugin v0.0.4 base** — tal como se distribuye en `anthropics/claude-plugins-official` (la versión de `plugin.json` marca 0.0.4)
2. **Patch del issue #1091** — fix de la corrupción de `recipientId` en DMs tras prompts de permiso. Detalles en <https://github.com/anthropics/claude-plugins-official/issues/1091>
3. **Slash commands añadidos localmente** — soporte completo para registrar y servir slash commands de Discord vía un fichero `commands.json`. Añade imports `SlashCommandBuilder`, `REST`, `Routes`, `ApplicationCommandOptionType` y el bloque "Slash commands config" en `server.ts`

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
