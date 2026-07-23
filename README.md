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

The Pantry screen stores products, quantities, locations, purchase dates and expiry dates in PostgreSQL. The seed command adds sample Pantry stock only when the database has no existing Pantry items.

The Receipts screen supports manual receipt entry and line-by-line review. Every line must be classified before food items can be imported into Pantry. Receipt fingerprints and finalisation status prevent the same receipt from creating Pantry stock twice.

The Prices screen derives product and retailer price history from imported receipts. Weight purchases are normalised per 100 g, liquids per litre and count-based purchases per item or pack so differently sized receipt lines can be compared more meaningfully.

The Prices screen also supports manual Woolworths, Coles and ALDI catalogue or shelf-price capture. It can compare individual products, estimate a remaining Shopping list at each retailer, show catalogue coverage and calculate an item-by-item split-shop estimate. Automatic product matching should be checked before relying on whole-list totals.

The Shopping screen stores multiple lists and their items in PostgreSQL. Items can be grouped, checked off, edited and cleared, with low-stock Pantry items available as quick-add suggestions. No extra migration is required for this feature.

## Android

Open `apps/android/food-health-sync` in Android Studio. Use JDK 17, Gradle wrapper 8.11.1, and install Android SDK Platform 35. Generate the wrapper first with `./scripts/bootstrap-android-wrapper.sh` if `gradlew` is absent.
