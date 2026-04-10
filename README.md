# claude-plugin-discord

Private mirror del plugin Discord de Claude Code (`anthropics/claude-plugins-official`), versión 0.0.4 con la patch del issue #1091 (DM recipientId corruption) aplicada.

Este repo es un snapshot — NO está conectado al upstream. Se usa para:
- Backup privado del plugin instalado localmente
- Experimentar con modificaciones
- Conservar la patch de #1091 sin tener que reaplicarla a mano tras cada `claude plugin update discord`

## Origen

Copiado desde `~/.claude/plugins/cache/claude-plugins-official/discord/0.0.4/` el $(date +%Y-%m-%d).

## Patch del issue #1091

Fix del bug `recipientId` corruption tras prompts de permiso. Ver detalles en el commit correspondiente o en:
https://github.com/anthropics/claude-plugins-official/issues/1091

## Reinstalar desde este repo

```bash
rsync -a --exclude='node_modules' --exclude='.git' ~/Projects/claude-plugin-discord/ ~/.claude/plugins/cache/claude-plugins-official/discord/0.0.4/
```
