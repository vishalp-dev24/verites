# Veritas Monorepo Workspace Setup

This project uses npm workspaces to manage multiple packages in a single repository with shared dependencies.

## Workspace Structure

```
veritas/
├── package.json          # Root workspace configuration
├── node_modules/         # Shared dependencies at root
├── sdk/javascript/       # @veritas/sdk - JavaScript SDK
│   └── package.json
└── dashboard/            # @veritas/dashboard - Next.js dashboard
    └── package.json
```

## Installing Dependencies

From the root directory, run:

```bash
npm install
```

This will install all dependencies for root, SDK, and dashboard in a single `node_modules` at the root.

## Available Scripts

### Root Package
```bash
npm run dev          # Start API server
npm run build        # Build TypeScript
npm run test         # Run tests
npm run typecheck    # TypeScript type checking
```

### SDK
```bash
npm run build -w @veritas/sdk     # Build SDK
npm run dev -w @veritas/sdk       # Dev mode with watch
```

### Dashboard
```bash
npm run dev -w @veritas/dashboard      # Start dev server
npm run build -w @veritas/dashboard    # Build for production
```

## Adding Dependencies

### To a specific workspace:
```bash
npm install <package> -w @veritas/sdk
npm install <package> -w @veritas/dashboard
```

### To root:
```bash
npm install <package> -w veritas
```

## Workspace Benefits

1. **Single node_modules**: All dependencies are hoisted to root, saving disk space
2. **Shared dependencies**: Common packages (axios, typescript, etc.) are installed once
3. **Inter-workspace imports**: Dashboard can import from SDK using `@veritas/sdk`
4. **Atomic installs**: One command installs everything
5. **Linked workspaces**: Changes to SDK are immediately available to dashboard
