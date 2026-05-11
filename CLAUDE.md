# CLAUDE.md

Skill routing for git gud deck / Claude Code sessions.

## GStack Routing

When the user's request matches an available skill, invoke it via the skill. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Code health check → invoke /health

## Health Stack

```bash
typecheck:    tsc --noEmit
lint:         eslint src/**/*.ts
test:         npx vitest run --reporter=verbose
deadcode:     npx knip --no-exports
shell:        shellcheck scripts/*.sh 2>/dev/null || echo "No shell scripts"
```

## Project

Name: Veritas
Description: Veritas — MCP-native research intelligence platform for AI agents
Location: ~/veritas

## Repository

- **Local Path**: `/home/ubuntu/veritas`
- **Package Name**: `veritas`
- **Display Name**: Veritas

## Commands

```bash
# Development
npm run dev        # Start development server
npm run mcp        # Start MCP server

# Build
npm run build      # TypeScript compilation
npm run typecheck  # Type checking only

# Database
npm run db:migrate
npm run db:generate
npm run db:studio

# Testing
npm run test       # Run vitest

# Lint
npm run lint       # Run eslint
```
