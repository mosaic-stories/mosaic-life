# Contributing to Mosaic Life

We welcome contributions! This guide explains how to contribute effectively.

## Code of Conduct

Be respectful and inclusive. We're building something meaningful together.

## Development Workflow

1. Fork the repository
2. Create a feature branch from `develop`
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Commit Messages

Use Conventional Commits format:

```
feat: add story search functionality
fix: resolve date picker timezone issue
docs: update API authentication guide
chore: upgrade dependencies
```

## Pull Request Guidelines

- Target < 400 lines of code
- Include tests for new features
- Update documentation as needed
- Link to related GitHub issues

## Running Tests

```bash
# Frontend
cd apps/web
npm run test

# Backend
cd services/core-api
uv run pytest
```

## Code Style

- **TypeScript**: ESLint + Prettier
- **Python**: Ruff + MyPy (strict)

Always run `just validate-backend` before committing Python changes.
