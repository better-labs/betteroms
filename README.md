# BetterOMS

BetterOMS is a lightweight, single-user order management system (OMS) for **Polymarket** on the **Polygon** network.  
It is designed to help an individual trader define, simulate, and execute structured trading plans with safety and clarity.

To be used for both live trading and paper trading (for benchmark purposes).It accepts JSON trade plans (with a **paper vs. live** toggle), runs on an hourly cron, and executes/updates/cancels orders via Polymarket APIs.

BetterOMS is part of a suite of tools. For more context see here: https://github.com/better-labs

---

## 🎯 Purpose
Prediction markets like Polymarket allow users to bet on real-world events, but the native interfaces are geared toward manual, ad-hoc trading. BetterOMS exists to solve this gap by giving a **repeatable, rules-based execution framework** where you can:

- Define trades in **JSON** (with size, price, time-in-force, risk guards).
- Run them in **paper mode** (simulation) before committing real capital.
- Execute them safely on-chain through batch jobs, without staying online 24/7.

BetterOMS will also be a key pre-requisite for building BetterAI v2, to help automate signals generated via BetterAI Engine.




---

## 🛠️ The Problems Addressed
Many excellent prediction market tools exist to generate signals (market alpha) for trading decisions. However, the user of those systems are asked to manually execute trades based on those signals.

Typical issues traders face on Polymarket:
- Manual order entry is error-prone and time-consuming.  
- No structured way to test strategies before going live.  
- Risk of leaving funds exposed if you have to paste private keys into scripts.  
- Lack of tools for “set-and-forget” orders like *cancel after X hours* or *only buy below this price*.  

BetterOMS addresses these by:
- **Automating execution** on a schedule (e.g., hourly cron).  
- **Simulating fills** against the live order book for paper trading and benchmarking.  
- **Separating concerns**: one path for paper mode, one for real mode.  


---

## ✅ What It Does
- Accepts structured trade plans in JSON.
- Simulates or executes orders (YES/NO outcomes with BUY/SELL support).
- Supports both MARKET and LIMIT order types.
- Handles cancellations, expirations, and price guards.
- Tracks PnL and positions.
- Provides an upgrade path for secure delegated signing.  

---

## 🚀 Roadmap (Phases)
1. **Scaffolding**: Types, validation, DB, logging.  
2. **Paper Trading**: Deterministic simulator + PnL tracking.  
3. **Real Trading**: Polymarket API integration for live orders.  
4. **Controls**: Cancel-after, price triggers, risk checks.  
5. **Security & UI**: Delegate contract for signing, minimal dashboard.  

---

## Docs

Please see the /docs folder for more information.

## Demo
// Todo


## Todos

- Complete adding Phase 8 features and demo script.
- Begin paper trading benchmarks of BetterAI engine predictions.