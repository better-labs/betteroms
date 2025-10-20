# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BetterOMS is a lightweight, single-user order management system (OMS) for Polymarket on the Polygon network. It enables structured trading plans through JSON configuration files, supporting both paper trading (simulation) and real trading modes.


## Technology Stack

- **Runtime**: Node.js with TypeScript, managed via `pnpm`
- **Database**: Postgres from day 1
- **ORM**: Drizzle ORM for type-safe database access
- **Validation**: Zod schemas for JSON input validation
- **Deployment**: Vercel serverless functions
- **Local Dev**: Docker Compose for Postgres


## Drizzle ORM Database Best Practice
- Only use proper generate and migrate commands. Do not attempt to use db:push to shortcut any problems with the database configuration.