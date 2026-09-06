# Food 0.1.0

A standalone personal food application. This repository does not modify or depend on CoffeeHQ.

## Folder boundary

- Food: `/home/peter/Development/food`
- CoffeeHQ: `/home/peter/Development/coffeehq`

The only planned connection is reverse-proxy routing so the standalone Food service can appear at `coffeehq.coffee/food`.

## Run the web app

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3100`.

## Accounts and households

Recipes are public. People can create an email/password account to save personal
favourites and a home shopping location across devices, create households and
invite verified users to join. Household membership does not expose another
person’s favourites or account preferences. A user can make their saved home
location the default from the account page, while explicitly choosing device
location for an individual barcode or grocery-price search.

Set these values in `.env` before enabling account registration:

- `BETTER_AUTH_URL`: the public origin, such as `https://food.coffeehq.coffee`
- `BETTER_AUTH_SECRET`: a cryptographically random secret of at least 32 characters
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`: the
  SMTP connection used for verification, password-reset and household invitations
- `FOOD_OWNER_EMAILS`: comma-separated verified accounts allowed to use the
  existing private planner, pantry, scan, receipts, prices, shopping and health tools

Run `npm run db:migrate:deploy` during production deployment before starting the
new application build.

The Pantry screen stores products, quantities, locations, purchase dates and expiry dates in PostgreSQL. The seed command adds sample Pantry stock only when the database has no existing Pantry items. Pantry entry supports selecting a saved product or continuously scanning EAN, UPC and Code 128 barcodes with the device camera. Known products are resolved from Food first; first-time numeric product barcodes are looked up through Open Food Facts and then UPCitemdb when needed. Returned product names and brands are cached locally, so subsequent scans do not call an external provider. The live camera stream is processed in the browser; no photo is taken or uploaded. Products absent from both lookup services can still be named manually once and reused later.

The Receipts screen supports manual receipt entry and line-by-line review. Every line must be classified before food items can be imported into Pantry. Receipt fingerprints and finalisation status prevent the same receipt from creating Pantry stock twice.

The Prices screen derives product and retailer price history from imported receipts. Weight purchases are normalised per 100 g, liquids per litre and count-based purchases per item or pack so differently sized receipt lines can be compared more meaningfully.

The Prices screen also supports manual Woolworths, Coles and ALDI catalogue or shelf-price capture. It can compare individual products, estimate a remaining Shopping list at each retailer, show catalogue coverage and calculate an item-by-item split-shop estimate. Automatic product matching should be checked before relying on whole-list totals.

For live Shopping-list searches, configure `SERPAPI_KEY` and optionally `GROCERY_PRICE_SEARCH_LOCATION`. Set `FOOD_DISABLE_SERPAPI_PRICES=1` to use Food’s stored observations and Open Prices without spending SerpApi quota. The environment location is the fallback for accounts without a saved home location. A user may search from their home/default area or explicitly grant browser location access for the current search.

## Australian grocery price collector

### Verified Woolworths browser

Woolworths blocks anonymous headless category browsing. Food therefore provides a persistent Playwright Chromium sidecar that can be verified by a person through noVNC and reused by the catalogue bridge over the private Compose network. Start both services with `docker compose --profile prices up -d --build food-woolworths-browser food-grocery-mcp`. The sidecar keeps its browser profile in the `food_woolworths_browser_profile` volume.

The noVNC page is bound to host loopback on port `6081` by default. From another computer, create an SSH tunnel with `ssh -N -L 6081:127.0.0.1:6081 peter@Coffee`, then open `http://127.0.0.1:6081/vnc.html?autoconnect=1&resize=scale&path=websockify`. Complete any Woolworths verification in that window. `WOOLWORTHS_NOVNC_PORT` changes the host-side port. `WOOLWORTHS_CDP_URL` may still point the bridge at a different trusted browser, but its DevTools endpoint must never be exposed to an untrusted network because it grants control of that browser profile.

The catalogue status endpoint reports `acquisitionMode: "verified-browser"` when the connection is configured. Existing cached products remain searchable if verification later expires; refreshes will fail with an actionable reconnect message rather than clearing the catalogue.

### Resumable Woolworths catalogue collection

The canonical importer only processes products already present in the verified
local cache. To grow that cache beyond manually refreshed categories, start the
resumable collector after the browser has been verified. It walks the configured
top-level Woolworths browse categories one at a time, persists the category
state in the same SQLite volume, and enriches every acquired product with its
authoritative detail before it can be imported:

```bash
curl -fsS 'http://127.0.0.1:8790/woolworths/catalogue/collection/start'
```

The request returns immediately. Follow its durable progress instead of
guessing from browser logs:

```bash
watch -n 10 'curl -fsS http://127.0.0.1:8790/woolworths/catalogue/collection/status'
```

Completed categories are not reacquired on a restart. Failed categories remain
visible with their error and can be retried deliberately once verification is
healthy again:

```bash
curl -fsS 'http://127.0.0.1:8790/woolworths/catalogue/collection/start?retryFailed=1'
```

Set `WOOLWORTHS_COLLECTION_CATEGORIES` to a comma-separated list of valid
`/shop/browse/...` paths when expanding or narrowing the collection plan. Use
`maxCategories=<number>` only for a small controlled run; omit it to process
all pending categories in the saved plan.

The collector discovers descendant browse paths while it processes each root
category and queues them in the same durable run. If an earlier bridge version
recorded only broad roots, revisit those roots once to seed their descendants
without resetting already completed child categories:

```bash
curl -fsS 'http://127.0.0.1:8790/woolworths/catalogue/collection/start?revisitCompletedRoots=1&retryFailed=1'
```

Every browse response is retained against its Woolworths stockcode, not just
the last path that happened to refresh. After changing source-category mapping,
revisit every completed category to rebuild those source-path associations
before running the controlled importer again:

```bash
curl -fsS 'http://127.0.0.1:8790/woolworths/catalogue/collection/start?revisitAllCompleted=1&retryFailed=1'
```

Wait for collection status to report no pending, running or failed categories,
then run the full controlled import. The importer selects a deterministic,
specific Woolworths source path for each stockcode and reindexes its canonical
department and shelf accordingly.

### Retailer leaf-collection contract

Every catalogue collector must discover the retailer's public category tree
before it acquires products. Parent categories are navigation evidence only;
only paths with no discovered children are product collection jobs. Retailers
with durable collection state must persist both the discovery frontier and
per-leaf pagination checkpoints, so a browser or network interruption resumes
the failed leaf rather than restarting from broad roots. A new retailer must
implement this discovery/leaf rule, source-path preservation, and a
retailer-specific controlled importer before it is added to an automated
catalogue refresh.

### Weekly specials refresh

Food can revisit the verified Woolworths catalogue every Wednesday morning to
publish current Woolworths prices and specials, then queue only retailer prices
that are stale or missing. The job waits for the complete catalogue collection,
refuses to import a partial run, and stops after eight hours by default.

Install the timer once on Coffee (the `OnCalendar` value uses the server's
local timezone):

```bash
sudo install -m 0755 scripts/refresh-weekly-specials.sh /home/peter/Development/food/scripts/refresh-weekly-specials.sh
sudo install -m 0644 deploy/food-weekly-specials-refresh.service /etc/systemd/system/food-weekly-specials-refresh.service
sudo install -m 0644 deploy/food-weekly-specials-refresh.timer /etc/systemd/system/food-weekly-specials-refresh.timer
sudo systemctl daemon-reload
sudo systemctl enable --now food-weekly-specials-refresh.timer
systemctl list-timers food-weekly-specials-refresh.timer
```

Use `sudo systemctl start food-weekly-specials-refresh.service` for a deliberate
manual run, and inspect its result with
`journalctl -u food-weekly-specials-refresh.service -n 100 --no-pager`.
The bridge's verified browser must be healthy before the timer starts. This
sweep refreshes the authoritative Woolworths catalogue; Coles remains covered
by the subsequent stale-listing queue rather than an unverified Coles catalogue
scrape.

### Controlled Woolworths canonical import

The verified Woolworths cache is not automatically treated as Food's canonical
catalogue. Preview a bounded batch first:

```bash
npm --workspace apps/web run products:woolworths-import -- --limit=30
```

The preview is read-only. It retains existing authoritative Woolworths
listings, links only exact barcode or exact normalised-name identities, creates
only in-stock records with both a verified detail response and a barcode, and
reports every skipped record. Apply the exact reviewed batch with:

```bash
npm --workspace apps/web run products:woolworths-import -- --limit=30 --apply
```

Use `--offset=<number>` for the next page, or
`--category=/shop/browse/...` to constrain the batch to one cached Woolworths
category. Re-running an applied batch is safe: the listing is retained and its
current verified price is recorded again.

Once a representative preview has been checked, use `--all` to preflight the
entire verified cache in one run. It still imports only records that satisfy
the same detail, stock, barcode, identity and label-fidelity safeguards; it
prints non-retained records and an aggregate summary by default:

```bash
npm --workspace apps/web run products:woolworths-import -- --all
```

Apply that exact full-cache plan only after its summary has been reviewed:

```bash
npm --workspace apps/web run products:woolworths-import -- --all --apply
```

Add `--verbose` to list retained records as well. Bulk mode reads cache pages
of 500 records by default (up to 1,000 with `--page-size=1000`), preloads
retailer listings, barcode matches and aliases once per page, and commits each
page in a single database transaction. It prevents duplicate names and
barcodes across the whole run and leaves skipped records untouched. This is
the reusable pattern for large retailer catalogue imports: listing identity is
retailer-specific, while canonical products are created only for verified
barcode identities.

If Woolworths rejects the container browser but accepts Chromium running directly on the server, use the host-browser mode. Install `chromium-browser`, `xvfb`, `openbox`, `x11vnc`, `novnc` and `websockify`, then install and start the supplied service:

```bash
sudo install -m 0644 deploy/food-woolworths-browser.service /etc/systemd/system/food-woolworths-browser.service
sudo systemctl daemon-reload
sudo systemctl enable --now food-woolworths-browser.service
```

The host browser keeps its profile under `~/snap/chromium/common/food-woolworths-profile`, exposes CDP only on host loopback port `9224`, and exposes noVNC only on host loopback port `6084`. Tunnel noVNC from another computer with `ssh -N -L 6084:127.0.0.1:6084 peter@Coffee`, then open `http://127.0.0.1:6084/vnc.html?autoconnect=1&resize=scale&path=websockify` to verify the session.

Start the grocery bridge with the host-network override so it can reach the loopback-only CDP socket without publishing browser control:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.host-browser.yml \
  --profile prices \
  up -d --build food-grocery-mcp
```

Do not start `food-woolworths-browser` in this mode. The catalogue database remains in the same `food_grocery_catalogue_data` volume, so existing cached results survive browser or provider failures.

Food can run the GPL-licensed [Australian Grocery Price Database](https://github.com/tjhowse/aus_grocery_price_database) as a separate optional service. It collects Coles and Woolworths observations into InfluxDB. Food imports those observations into its own `StoreProduct` and `PriceObservation` records and resolves retailer names through Product Intelligence.

Start the optional collector stack:

```bash
docker compose --profile prices up -d food-price-influx food-auscost-collector
```

Add the matching `AUSCOST_INFLUX_*` values from `.env.example` to `apps/web/.env`, then import recent observations:

```bash
cd apps/web
npm run prices:import:auscost
```

`AUSCOST_IMPORT_LOOKBACK_HOURS` controls the import window. Re-running the importer is safe because observations with the same retailer product, timestamp and `auscost` source are skipped. The upstream collector remains a separate GPL v3-or-later service and is not copied into Food’s Next.js source.

The Shopping screen stores multiple lists and their items in PostgreSQL. Items can be grouped, checked off, edited and cleared, with low-stock Pantry items available as quick-add suggestions. Shopping entry uses the same saved-product, two-stage external lookup and continuous barcode scanner as Pantry, allowing an empty package to be scanned directly onto a replacement list. Scanned products remain in the reusable catalogue after Pantry stock is consumed.

## Android

Open `apps/android/food-health-sync` in Android Studio. Use JDK 17, Gradle wrapper 8.11.1, and install Android SDK Platform 35. Generate the wrapper first with `./scripts/bootstrap-android-wrapper.sh` if `gradlew` is absent.
