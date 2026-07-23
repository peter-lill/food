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

## Android

Open `apps/android/food-health-sync` in Android Studio. Use JDK 17, Gradle wrapper 8.11.1, and install Android SDK Platform 35. Generate the wrapper first with `./scripts/bootstrap-android-wrapper.sh` if `gradlew` is absent.
