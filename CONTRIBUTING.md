# Contributing to MediaPruner

Thank you for your interest in contributing to MediaPruner! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- FFmpeg (for subtitle embedding)
- Git

### Getting Started

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/MediaPruner.git
   cd MediaPruner
   ```

2. **Set up the Python virtual environment:**
   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # Linux/Mac
   source .venv/bin/activate
   
   pip install -r backend/requirements.txt
   ```

3. **Install Node.js dependencies:**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

4. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Run in development mode:**
   ```bash
   npm run dev
   ```

## Code Style

### Backend (Python)
- Follow PEP 8 guidelines
- Use type hints for function parameters and return values
- Use async/await for database operations
- Add docstrings to functions and classes

### Frontend (TypeScript/React)
- Use TypeScript for all new code
- Use functional components with hooks
- Follow the existing component structure
- Use Tailwind CSS for styling

## Pull Request Process

**Required workflow: Target `develop` first, then `main`** ⚠️

We use a develop-first workflow for all changes. Create feature branches from `develop`, open a Pull Request targeting `develop`, and address review/CI there. A follow-up PR from `develop` → `main` will be created by maintainers after checks and any release gating are satisfied. Do not open PRs directly to `main` unless explicitly instructed by maintainers.

1. Create a feature branch from `develop`:
   ```bash
   git checkout -b feature/your-feature-name develop
   ```

2. Make your changes and commit with clear messages:
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve issue with..."
   ```

3. Push to your fork and create a Pull Request targeting `develop`

4. Ensure CI checks pass on `develop`

5. Wait for review and address any feedback

> Note: Maintainers will merge `develop` into `main` via a separate PR once `develop` is stable and CI checks are green. This ensures nothing lands in `main` directly without passing through `develop`.

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Reporting Issues

When reporting issues, please include:

1. A clear description of the problem
2. Steps to reproduce
3. Expected vs actual behavior
4. Screenshots if applicable
5. Environment details (OS, browser, etc.)

## Feature Requests

Feature requests are welcome! Please:

1. Check existing issues first
2. Provide a clear use case
3. Describe the expected behavior

## Questions?

Feel free to open a Discussion on GitHub for questions or ideas!
