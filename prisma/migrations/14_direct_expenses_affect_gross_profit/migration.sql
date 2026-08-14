-- Direct Expenses must be deducted before gross profit.
--
-- `affectsGrossProfit` was never set when an organization's default chart
-- of accounts was provisioned, so it took the column default of false and
-- the system "Direct Expenses" group — which holds Purchase Accounts, the
-- ledger every posted bill debits — sat below the gross profit line.
--
-- Effect on a real book: buy 15,000, sell 70,000, and the P&L reported a
-- 100% gross margin instead of 78.57%. Net profit was correct throughout;
-- only the gross profit subtotal and margin were wrong, which is the
-- figure a reviewer reads first.
--
-- Scoped to system groups so a hand-built group of the same name, whose
-- owner may have classified it deliberately, is left alone.
UPDATE "ledger_groups"
   SET "affectsGrossProfit" = true
 WHERE "name" = 'Direct Expenses'
   AND "nature" = 'EXPENSES'
   AND "isSystem" = true
   AND "affectsGrossProfit" = false;
