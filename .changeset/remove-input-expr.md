---
"@executioncontrolprotocol/protocol": minor
"@executioncontrolprotocol/engine": minor
"@executioncontrolprotocol/app": minor
---

Remove inline `$expr` from step inputs. Data edges are `$ref` only; use transform steps to reshape data. Validation rejects input `$expr` with `ECP_EXPR_INVALID` and a suggestion to use a transform step. Control `expr` on steps, branches and loops is unchanged.