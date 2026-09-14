#!/usr/bin/env bash
# Bootstrap do Superpowers: injeta a skill `using-superpowers` no inicio da
# sessao. Sem isso as skills ficam no disco mas o agente nao sabe que precisa
# consultar uma antes de agir — que e o ponto do Superpowers.
# Equivalente local ao SessionStart hook do plugin obra/superpowers (MIT).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
skill="$root/.agents/skills/using-superpowers/SKILL.md"
[ -f "$skill" ] || exit 0

node -e '
const body = require("fs").readFileSync(process.argv[1], "utf8");
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext:
      "<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n" +
      "**Below is the full content of your `using-superpowers` skill — your " +
      "introduction to using skills. For all other skills, use the Skill tool:**\n\n" +
      body + "\n</EXTREMELY_IMPORTANT>",
  },
}));
' "$skill"
