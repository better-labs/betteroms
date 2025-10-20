# Test Trade Plans

Sample trade plan JSON files for testing BetterOMS CLI functionality.

## Files

### simple-buy.json
Basic trade plan with single MARKET BUY order.
```bash
pnpm run execute:trade-plan ./test/trade-plans/simple-buy.json
```

### multi-trade.json
Trade plan with multiple orders (BUY and SELL).
```bash
pnpm run execute:trade-plan ./test/trade-plans/multi-trade.json
```

### invalid.json
Invalid trade plan (missing required `mode` field) - used for testing error handling.
```bash
pnpm run execute:trade-plan ./test/trade-plans/invalid.json
```

## Trade Plan Format

```json
{
  "planId": "unique-identifier",
  "mode": "paper" | "live",
  "trades": [
    {
      "marketId": "token-id-or-slug",
      "outcome": "YES" | "NO",
      "side": "BUY" | "SELL",
      "orderType": "MARKET",
      "size": 100
    }
  ]
}
```

## Testing Different Input Methods

1. **File path:**
   ```bash
   pnpm run execute:trade-plan ./test/trade-plans/simple-buy.json
   ```

2. **Stdin (pipe):**
   ```bash
   cat ./test/trade-plans/simple-buy.json | pnpm run execute:trade-plan
   ```

3. **Stdin (heredoc):**
   ```bash
   pnpm run execute:trade-plan <<EOF
   {
     "planId": "test-001",
     "mode": "paper",
     "trades": [
       {
         "marketId": "0x123...",
         "outcome": "YES",
         "side": "BUY",
         "orderType": "MARKET",
         "size": 100
       }
     ]
   }
   EOF
   ```
