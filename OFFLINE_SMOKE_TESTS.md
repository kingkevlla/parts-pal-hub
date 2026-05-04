# Offline Smoke Test Checklist

Use this checklist to verify every route still works without internet. 

## How to simulate offline
1. Open the app and sign in **while online** (auth tokens cache).
2. Let the dashboard load once so initial sync populates IndexedDB.
3. Open Chrome DevTools → **Network** tab → set throttling to **Offline** (or disable Wi-Fi on a phone build).
4. Confirm the red **OfflineBanner** appears and the header **ConnectionStatus** badge shows "Offline".
5. Run each section below. After all tests, switch back to **Online** and verify the pending-mutations counter drains to 0 and data appears in Supabase.

Legend: ✅ = expected to work offline · ⏳ = queued, syncs on reconnect · ❌ = requires internet (document the limitation)

---

## 🔐 /auth — Login
- ✅ Already-signed-in session stays valid (token cached)
- ❌ New login / signup (requires Supabase auth) — should show clear error

## 🏠 / and /dashboard — Dashboard
- ✅ KPI cards render from cached products / transactions / inventory
- ✅ Date range picker filters local cached data
- ✅ Red-highlighted expiry dates render
- ❌ Server-side aggregate widgets may show stale numbers — verify they don't crash

## 👑 /owner-dashboard — Owner Dashboard
- ✅ Stock bars, top products, voice alerts use cached snapshot
- ✅ 60s auto-refresh fails silently and keeps showing cached values

## 🛒 /pos — Point of Sale
- ✅ Product grid loads from cache, fuzzy search works
- ✅ Barcode exact-match auto-add works
- ✅ Warehouse selector lists cached warehouses
- ✅ Add to cart, quantity edits, manual item entry (routes to Extra warehouse)
- ⏳ Checkout: transaction + transaction_items + stock_movements + (optional) new customer all queued with client UUIDs
- ⏳ Split payments persist locally
- ⏳ Loan/credit sale creates borrower + loan offline
- ✅ Pending bills (waiter tabs) save & reopen from cache
- ✅ Receipt prints with cached business name, logo, QR
- **Reconnect check:** transaction appears in Supabase, inventory.quantity decremented by trigger, stock_movements rows present

## 📦 /inventory — Inventory
- ✅ Product list, search, sort, pagination (100/page) from cache
- ⏳ Add / edit / delete product
- ⏳ Bulk stock adjustment dialog (multi-row insert into stock_movements)
- ✅ Image picker — cached images render; **❌ new uploads to product-images bucket fail offline** (warn user)
- ✅ Auto-generated 6-char SKU still works (client-side)
- ✅ Export to Excel/CSV from cached data
- ❌ Import from Excel that references server-side validation

## 📥 /stock-in and 📤 /stock-out
- ⏳ Create stock movement (insert queued, inventory updates after sync via trigger)
- ✅ Warehouse + product dropdowns from cache

## 🔧 /stock-adjustment
- ⏳ Manual adjustment with mandatory reason — queued

## 🏷️ /categories
- ✅ List from cache
- ⏳ Create / rename / delete

## 🏬 /warehouses
- ✅ List from cache (including Extra)
- ⏳ Create / edit / delete

## 👥 /customers and /suppliers
- ✅ Lists, search, filter
- ⏳ Add / edit / delete dialogs

## 💳 /loans
- ✅ Loan list with borrower joins from cached data
- ⏳ New loan, repayment, custom interest

## 💸 /expenses
- ✅ List, category filter, budget bars
- ⏳ Create expense (✅ without receipt; ❌ with receipt upload)

## 👨‍💼 /employees
- ✅ Roster, attendance log, leave balance, payroll summary, loans
- ⏳ Mark attendance, add leave, run payroll line, employee loan

## 📊 /reports, /sales-history, /transactions
- ✅ Render from cached transactions + items
- ✅ Date-range filtering uses local data
- ❌ Heavy server aggregates may be stale — note timestamp of last sync

## 🔔 Notifications hub (header bell)
- ✅ Expiry, low-stock, loan-due alerts compute from cached tables

## ⚙️ /settings
- ✅ Profile, Receipt, System, Security tabs render cached settings
- ⏳ Save changes (system_settings upsert queued)
- ✅ Business/Company name change reflects in Sidebar + POSHeader after save
- ⏳ User Management: add/edit/delete user + user_roles row

## 👤 /user-management
- ✅ User + roles list from cache
- ⏳ Role assignment (user_roles insert/delete)

## 🛟 /support and 404
- ✅ Static pages render

---

## 🔁 Reconnect verification (run once at the end)
1. Re-enable network.
2. Within ~10s the **ConnectionStatus** badge flips to "Online" and pending count drops to 0.
3. Open Supabase Studio → spot-check 3 tables you mutated (e.g. `transactions`, `inventory`, `stock_movements`) and confirm rows exist with the client-generated UUIDs.
4. Confirm DB triggers fired:
   - `update_inventory_on_stock_movement` decremented stock
   - `clamp_inventory_quantity` prevented negatives
5. Hard-refresh the app — UI should match server state (no duplicate rows).

## 🚨 Known offline limitations (document & warn user in UI if not already)
- New auth sign-up / password reset
- Storage uploads (product images, expense receipts, business logo)
- Server-side aggregate reports
- Edge-function calls (if any)
