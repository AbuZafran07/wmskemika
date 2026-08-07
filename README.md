# Warehouse Management Inventory

1. contoh pada gambar 1 contoh menunya
2. contoh gambar 2 tampilan halaman login
3. contoh gambar 3 tampilan form sales order
4. contoh gambar 4 adalah contoh tampilan stock in
diatas hanya contoh untuk warna sesuaikan dan selaraskan seluruhnya dengan tampilan yang menarik modern 

contoh Menu Structure (GROUPED LIKE EXAMPLE)
RINGKASAN
- Dashboard

TRANSAKSI
- Plan Order (Inbound Plan)
- Stock In
- Sales Order (Outbound Plan)
- Stock Out
- Stock Adjustment

MASTER DATA
- Data Product
  - Products
  - Categories
  - Units
  - Suppliers
  - Customers
- User Management

LAPORAN
- Stock Report
- Inbound Report
- Outbound Report
- Adjustment Log
- Audit Log


🔧 PROMPT LOVABLE FINAL (COPY-PASTE)
Build a modern, production-ready Warehouse Inventory Management Web App for PT. KEMIKA KARYA PRATAMA with a bilingual UI (English / Indonesian), a clean modern design (strict workflow rules, and full audit logs.
0) PRODUCT GOAL
This app manages inbound and outbound warehouse flow with batch tracking and FEFO:
•	Inbound: Plan Order → Stock In (receiving) → Data Stock updates
•	Outbound (NEW FLOW): Sales Order acts as “Outbound Plan” → Stock Out executes real goods issue
•	Stock Adjustment exists and requires approval
1) UI / UX REQUIREMENTS (IMPORTANT)
•	Bilingual UI (EN/ID) toggle visible in top bar. All labels show EN with ID subtitle or switchable language.
•	Dan tampilan dark & light
•	Modern layout: sidebar + topbar + responsive mobile.
•	Exact menu labels & button text are locked (do not rename buttons/menus once defined).
•	Each module: list view + detail view + create/edit modal or page.
•	Archived view supported for completed documents (Plan Order fully received, Sales Order fully delivered).
2) AUTH + USER MANAGEMENT (REQUIRED)
Roles:
•	super_admin (only this role can create/manage users/edit delete)
•	admin
•	finance (input customer)
•	purchasing (view, input plan order, input vendor, units, kategori, produk)
•	warehouse (for handle stock in & out)
•	sales (for Sales Order creation)
•	viewer (read-only)
Rules:
•	Only super_admin can create new accounts (no public register).
•	Login page: username/email + password.
•	Enforce RBAC on every API + UI route.
•	Store session via JWT (or equivalent) and protect APIs.
Seed default Super Admin:
•	email/username: ferry@kemika.co.id
•	pass : 123456
•	role: super_admin
Approval Configuration:
•	System setting: allow_admin_approve (default false).
•	Default approval: ONLY super_admin can approve.
•	Admin can approve only if allow_admin_approve=true.
3) SIDEBAR MENU (LOCKED LABELS)
1.	Dashboard
2.	Data Product
3.	Plan Order (Inbound Plan)
4.	Stock In (Inbound)
5.	Data Stock
6.	Sales Order (Outbound Plan)
7.	Stock Out (Outbound)
8.	Stock Adjustment
9.	Reports
10.	Audit Log
11.	User Management (visible only to super_admin)
4) “DATA PRODUCT” (ONE MASTER MENU, WITH SUB-TABS)
Inside Data Product, create sub-tabs:
•	Products
•	Categories
•	Units
•	Suppliers
•	Customers
All master tables support:
•	Create / Edit / Soft Delete
•	Search, filter, pagination
•	Import/Export CSV and XLSX
•	Provide downloadable templates for both CSV and XLSX
•	Validation errors should show row number + reason.
4A) Products
Fields:
•	Product Code / SKU (optional)
•	Barcode (otomatis)
•	Product Name (required)
•	Photo product (required)
•	Category (dropdown) (required)
•	Unit (dropdown) (required)
•	Supplier default (dropdown ambil dari data supplier) (required)
•	Purchase Price (for valuation) (required)
•	Selling Price (optional) (required)
•	Min Stock, Max Stock (required)
•	Location/Rack (optional) 
•	Active flag
Rules:
•	Unit Price for Sales Order must auto-fill from Product Selling Price (or Purchase Price if selling is empty — configurable).
•	Prevent deletion if referenced; use soft delete.
4B) Categories
Fields: code, name, description, is_active
4C) Units
Fields: code, name, description, is_active
4D) Suppliers
Fields:
•	code, name supplier, contact_person, phone, email, NPWP, terms payment, address, city, notes, is_active
4E) Customers 
Fields:
•	code (unique)
•	name (required)
•	NPWP (text, optional but available) (required)
•	type (retail/Government/marketplace/etc, optional) (required)
•	PIC, jabatan, phone, email, terms payment (required)
•	address, city (required)
•	credit_limit (optional)
•	notes
•	is_active
5) ATTACHMENTS (CLOUDFLARE R2 REQUIRED)
All uploads MUST go to Cloudflare R2:
•	Stock In: delivery note / surat jalan vendor (required)
•	Stock Adjustment: evidence photo/document (required)
•	Plan Order: optional PO document (required)
•	Stock Out: delivery note / surat jalan outbound (required)
In D1 store only metadata:
•	file_key, url, mime, size, uploaded_at, uploaded_by, module_name, ref_table, ref_id
6) INBOUND FLOW (PLAN ORDER → STOCK IN → DATA STOCK)
6A) Plan Order (Inbound Plan)
Purpose: plan procurement before receiving stock.
Plan Number:
•	MANUAL INPUT ONLY (IMPORTANT)
•	No auto-numbering. User must type plan_number.
Header fields:
•	plan_number (manual, required, unique)
•	plan_date
•	supplier (required)
•	expected_delivery_date (optional)
•	notes (optional)
•	uploud PO Document (required)
•	status enum (see status section) 
Items fields:
•	product (dropdown from Products)
•	auto-fill: product_code, category, unit, unit PRICE
•	planned_qty (required)
•	subtotal
•	discount
•	TAX/VAT (bisa di input berapa persentasenya)
•	shipping cost
•	Total Amount
•	notes (optional)
•	tracking per item: qty_received, qty_remaining
Plan Order statuses:
•	draft
•	approved
•	partially_received
•	received
•	cancelled
Rules:
•	Only draft can be edited freely.
•	Approval required before Stock In can use it.
•	When all items qty_remaining = 0 → status becomes received and Plan Order appears in Archived view.
6B) Stock In (Inbound)
Purpose: receiving goods and creating batches.
Flow:
1.	User selects an available Plan Order:
o	show only Plan Orders with status approved or partially_received
o	and with at least one item qty_remaining > 0
2.	System loads remaining items only.
3.	For each received line, user inputs:
o	qty_received_now (cannot exceed qty_remaining)
o	batch/machine_no (required)
o	expired_date (optional but supported)
o	attachment upload (surat jalan vendor) to R2 (required)
4.	Submit → system:
o	create/append inventory_batches per product + batch_no + expired_date
o	increase qty_on_hand in that batch
o	write stock_transactions inbound record
o	update Plan Order item: qty_received += received_now; qty_remaining -= received_now
o	update Plan Order header status: partially_received or received
o	update Data Stock summary
FEFO:
•	Data Stock consumption uses FEFO: earliest expired first (null/blank expiry last).
7) DATA STOCK (BATCH / FEFO VIEW)
Data Stock list:
•	product_code, product_name, category, unit, total_stock (sum of batches)
•	click product → show batch breakdown:
o	batch_no, expired_date, qty_on_hand
•	Always order batches by FEFO:
o	expired_date ASC (null/blank last), then batch_no
8) OUTBOUND FLOW (NEW) — SALES ORDER → STOCK OUT
8A) Sales Order = “Outbound Plan” (Customer Order Document)
Purpose: record customer demand first (NO stock deduction yet).
Header fields:
•	sales_order_number (manual or system generated allowed, but must exist; if manual, enforce unique)
•	Sales Name (required)
•	order_date
•	customer (required; dropdown from Customers)
•	auto-fill dari data customer: PIC customer, phone, NPWP, terms payment, Type
•	customer_po_number (MANUAL, REQUIRED)
•	allocation of goods requests (required; dropdown Selling, Sample, Stock, etc)
•	project Instansi (required)
•	delivery deadline (tanggal tampilannya) (required)
•	uploud purchase order customer (required)
•	ship_to_address (optional)
•	notes (optional)
•	status enum (see below)
Items fields:
•	product (dropdown from Products)
•	auto-fill: product_code, category, unit
•	unit_price auto-filled from Product master (locked rule)
•	ordered_qty (required)
•	optional fields ready for future: discount, tax_rate, etc (can be null)
•	tracking per item: qty_delivered, qty_remaining
Sales Order statuses (Outbound Plan):
•	draft
•	approved
•	partially_delivered
•	delivered
•	cancelled
Rules:
•	Only approved/partially_delivered can be used for Stock Out.
•	When all items qty_remaining = 0 → status becomes delivered and moves to Archived view.
•	bosa
8B) Stock Out = Real Outbound Execution (takes from Sales Order)
Purpose: deduct real inventory using FEFO batches, and attach delivery note.
Flow UI:
1.	Select Sales Order:
o	show only status approved or partially_delivered
o	and with at least one item qty_remaining > 0
2.	System shows remaining items only.
3.	For each outbound line:
o	user enters qty_out_now (cannot exceed qty_remaining)
o	system suggests batch selection FEFO automatically (allow manual override with validation)
o	upload delivery note / surat jalan to R2 (required)
4.	Submit → system:
o	reduce inventory_batches.qty_on_hand for selected batches
o	create stock_transactions outbound record
o	update Sales Order item: qty_delivered += qty_out_now; qty_remaining -= qty_out_now
o	update Sales Order header status: partially_delivered or delivered
o	update Data Stock summary
o	if stock insufficient → block and show clear error
9) STOCK ADJUSTMENT (WITH APPROVAL)
Purpose: fix stock differences (audit-proof).
Fields:
•	adjustment_number (manual or auto ok)
•	adjustment_date
•	reason (required)
•	attachment upload to R2 (required)
•	status enum + approval trail
•	items:
o	product
o	batch selection (required, FEFO list)
o	adjustment_qty (+ or -)
o	notes
Statuses:
•	draft
•	submitted
•	approved
•	rejected
•	posted (stock updated)
Rules:
•	warehouse/admin can create draft + submit
•	approval required:
o	default only super_admin
o	admin only if allow_admin_approve=true
•	Once approved → posting updates batches qty_on_hand, logs stock_transactions type adjustment.
•	Every action writes audit log.
10) DASHBOARD + REPORTS
Dashboard cards:
•	Total Products, Total Suppliers, Total Customers
•	Low Stock Items (min_stock)
•	Stock Value (purchase_price * qty_on_hand)
•	Inbound/Outbound totals last 30 days
Charts:
•	7-day stock movement in/out
•	Top moving products
•	Top 5 Slowest Moving Products
•	Stock value by category
Low Stock Alerts page:
•	list items where current <= min_stock
Reports:
•	Inbound report (by date, supplier, plan_number)
•	Outbound report (by date, customer, customer_po_number)
•	Stock card per product (batch movements)
Export CSV/XLSX for reports.
11) DATABASE (CLOUDFLARE D1) — REQUIRED TABLES
Design D1 schema to support:
•	users, roles, settings
•	products, categories, units, suppliers, customers (with NPWP)
•	plan_order_headers, plan_order_items
•	sales_order_headers, sales_order_items
•	inventory_batches (batch_no, expired_date, qty_on_hand)
•	stock_transactions (in/out/adjustment; reference_no; ref_type; ref_id; user_id; timestamps)
•	attachments (R2 metadata + url)
•	audit_logs (who, what, before/after, module, ref id, timestamp)
Ensure indexes for performance on:
•	product_id, batch_no, expired_date
•	status fields for header tables
•	search fields (sku, name)
12) PDF PRINTING (REQUIRED)
Sales Order must be printable to a professional PDF:
•	Company header: PT. KEMIKA KARYA PRATAMA
•	Document title: SALES ORDER (Outbound Plan)
•	Show customer, NPWP, customer PO number, items, totals (even if totals optional)
•	Include signature placeholders
•	Include logo (bottle green + sage style)
Also enable PDF for Plan Order and Stock Out Delivery Note summary.
13) IMPORTANT BUSINESS RULES SUMMARY
•	Plan Order numbering: manual only
•	Stock In only from approved/partially_received Plan Orders with remaining qty
•	Sales Order is Outbound Plan (no stock deduction)
•	Stock Out only from approved/partially_delivered Sales Orders with remaining qty
•	FEFO batch logic for outbound and consumption
•	Attachments always in R2, D1 stores metadata + url
•	Only super_admin can create users
•	Approval: only super_admin by default; admin allowed only via setting
•	Every change writes audit logs
14) STATE DIAGRAM + STATUS ENUMS (MUST IMPLEMENT)
Provide explicit status enums and enforce transitions:
Plan Order:
draft → approved → partially_received → received
draft → cancelled
approved → cancelled (optional if no receiving yet)
Sales Order:
draft → approved → partially_delivered → delivered
draft → cancelled
approved → cancelled (optional if no delivery yet)
Stock Adjustment:
draft → submitted → approved → posted
submitted → rejected
draft → cancelled (optional)
15) DELIVERABLES
Deliver:
•	Full UI pages + navigation working (no “Coming soon”)
•	API endpoints for all modules
•	D1 migrations + seed super_admin
•	R2 upload integration
•	CSV/XLSX import/export templates
•	PDF printing 
•	Audit log viewer
Make sure the app loads modules correctly (no undefined function errors). Ensure all JS modules expose their load functions on window.* consistently, and the router never falls back to “Coming soon” for implemented pages.

16. Tambahkan dukungan Progressive Web App (PWA) agar aplikasi ini bisa diinstall di Android dan iPhone seperti aplikasi native.
Sertakan manifest.json, service worker, icon app (192x192 dan 512x512), meta tag Apple, dan konfigurasi caching untuk offline mode.
Warna utama gunakan #006E3C, nama aplikasi 
Pastikan ketika dibuka di mobile, tampil fullscreen dan bisa “Add to Home Screen”.
     
jalankan seluruhnya ya dengan benar dan berikan rekomendasinya

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://wmskemika.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/66ed799c-028e-4770-a66b-b52a7ff0cdfc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
