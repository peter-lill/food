"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./food.module.css";

type Meal = {
  id: string;
  label: string;
  name: string;
  detail?: string;
  method?: "Microwave" | "Sandwich press" | "At home";
};

type DayPlan = {
  day: string;
  short: string;
  meals: Meal[];
};

const plans: DayPlan[] = [
  {
    day: "Monday",
    short: "Mon",
    meals: [
      { id: "mon-breakfast", label: "Breakfast", name: "Banana protein smoothie", detail: "110 g banana · oats · powdered PB · light milk · whey" },
      { id: "mon-am", label: "Morning snack", name: "Apple" },
      { id: "mon-lunch", label: "Office lunch", name: "Chicken burrito bowl", detail: "Chicken, brown rice, broccoli, carrots", method: "Microwave" },
      { id: "mon-pm", label: "Afternoon snack", name: "High-protein Greek yoghurt" },
      { id: "mon-dinner", label: "Dinner", name: "Lemon herb chicken", detail: "Sweet potato and broccoli", method: "At home" },
    ],
  },
  {
    day: "Tuesday",
    short: "Tue",
    meals: [
      { id: "tue-breakfast", label: "Breakfast", name: "Three eggs on wholegrain toast", detail: "With sautéed spinach" },
      { id: "tue-am", label: "Morning snack", name: "Raw almonds" },
      { id: "tue-lunch", label: "Office lunch", name: "Chicken, avocado and spinach toastie", detail: "Light cheese and Dijon mustard", method: "Sandwich press" },
      { id: "tue-pm", label: "Afternoon snack", name: "Cottage cheese" },
      { id: "tue-dinner", label: "Dinner", name: "Sirloin steak", detail: "Garlic mushrooms and roast vegetables", method: "At home" },
    ],
  },
  {
    day: "Wednesday",
    short: "Wed",
    meals: [
      { id: "wed-breakfast", label: "Breakfast", name: "Banana protein smoothie" },
      { id: "wed-am", label: "Morning snack", name: "Banana" },
      { id: "wed-lunch", label: "Office lunch", name: "Lean beef rice bowl", detail: "Broccoli and mushrooms", method: "Microwave" },
      { id: "wed-pm", label: "Afternoon snack", name: "High-protein Greek yoghurt" },
      { id: "wed-dinner", label: "Dinner", name: "Homemade lean beef burgers", detail: "Sweet potato wedges and salad", method: "At home" },
    ],
  },
  {
    day: "Thursday",
    short: "Thu",
    meals: [
      { id: "thu-breakfast", label: "Breakfast", name: "Greek yoghurt, blueberries and oats" },
      { id: "thu-am", label: "Morning snack", name: "Apple" },
      { id: "thu-lunch", label: "Office lunch", name: "Tuna melt toastie", detail: "Spinach, pickles and light cheese", method: "Sandwich press" },
      { id: "thu-pm", label: "Afternoon snack", name: "Protein shake" },
      { id: "thu-dinner", label: "Dinner", name: "Oven-baked salmon", detail: "Brown rice and green beans", method: "At home" },
    ],
  },
  {
    day: "Friday",
    short: "Fri",
    meals: [
      { id: "fri-breakfast", label: "Breakfast", name: "Banana protein smoothie" },
      { id: "fri-am", label: "Morning snack", name: "Raw almonds" },
      { id: "fri-lunch", label: "Office lunch", name: "Steak and mushroom toastie", detail: "Cooked onion, spinach, light cheese and Dijon", method: "Sandwich press" },
      { id: "fri-pm", label: "Afternoon snack", name: "High-protein Greek yoghurt" },
      { id: "fri-dinner", label: "Dinner", name: "Mexican chicken bowl", detail: "Rice, black beans, corn, avocado and Greek yoghurt", method: "At home" },
    ],
  },
  {
    day: "Saturday",
    short: "Sat",
    meals: [
      { id: "sat-breakfast", label: "Breakfast", name: "Eggs on wholegrain toast" },
      { id: "sat-am", label: "Morning snack", name: "Apple" },
      { id: "sat-lunch", label: "Lunch", name: "Chicken wrap or leftovers" },
      { id: "sat-pm", label: "Afternoon snack", name: "Cottage cheese" },
      { id: "sat-dinner", label: "Dinner", name: "Beef stir-fry", detail: "Broccoli, mushrooms, carrots, green beans and brown rice", method: "At home" },
    ],
  },
  {
    day: "Sunday",
    short: "Sun",
    meals: [
      { id: "sun-breakfast", label: "Breakfast", name: "Banana protein smoothie" },
      { id: "sun-am", label: "Morning snack", name: "Apple" },
      { id: "sun-lunch", label: "Lunch", name: "Roast chicken wrap", detail: "Lettuce, cucumber, beetroot and avocado" },
      { id: "sun-pm", label: "Afternoon snack", name: "High-protein Greek yoghurt" },
      { id: "sun-dinner", label: "Dinner", name: "Roast chicken", detail: "Sweet potato, broccoli and carrots", method: "At home" },
    ],
  },
];

const shoppingSections = [
  { title: "Protein", items: ["3 kg chicken breast", "1.5 kg sirloin steak", "1 kg lean beef mince", "2 salmon fillets", "4 tins tuna in spring water", "30 eggs", "2 kg high-protein Greek yoghurt", "500 g cottage cheese", "Whey protein"] },
  { title: "Vegetables", items: ["3 heads broccoli", "2 large bags baby spinach", "1 kg mushrooms", "1 kg carrots", "500 g green beans", "2 cucumbers", "2 bags mixed salad leaves", "4 avocados", "Onions for cooking", "2 bulbs garlic", "Cos lettuce", "Beetroot slices", "Pickles"] },
  { title: "Fruit", items: ["12 bananas", "10 apples", "2 punnets blueberries"] },
  { title: "Bread and grains", items: ["Wholegrain bread", "Wholegrain wraps", "1 kg rolled oats", "1 kg brown rice", "3 kg sweet potatoes"] },
  { title: "Pantry and extras", items: ["Powdered peanut butter", "Light milk", "Light cheese", "Black beans", "Corn kernels", "Extra virgin olive oil", "Raw almonds", "Dijon mustard", "Cinnamon", "Taco seasoning"] },
];

const prepItems = [
  "Cook a batch of chicken breast",
  "Cook brown rice and cool promptly",
  "Roast sweet potato and carrots",
  "Steam broccoli and green beans",
  "Cook lean beef mince for bowls",
  "Slice chicken for toasties and wraps",
  "Portion office lunches into glass containers",
  "Freeze bananas in 110 g portions",
];

const mealStorageKey = "food-standalone-meals-v1";
const shoppingStorageKey = "food-standalone-shopping-v1";
const prepStorageKey = "food-standalone-prep-v1";
const waterStorageKey = "food-standalone-water-v1";

function todayIndex() {
  const index = new Date().getDay();
  return index === 0 ? 6 : index - 1;
}

export function FoodDashboard({ firstName }: { firstName: string }) {
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [completedMeals, setCompletedMeals] = useState<Record<string, boolean>>({});
  const [shopping, setShopping] = useState<Record<string, boolean>>({});
  const [prep, setPrep] = useState<Record<string, boolean>>({});
  const [water, setWater] = useState(0);
  const [tab, setTab] = useState<"plan" | "shop" | "prep" | "progress">("plan");

  useEffect(() => {
    try {
      setCompletedMeals(JSON.parse(localStorage.getItem(mealStorageKey) ?? "{}"));
      setShopping(JSON.parse(localStorage.getItem(shoppingStorageKey) ?? "{}"));
      setPrep(JSON.parse(localStorage.getItem(prepStorageKey) ?? "{}"));
      setWater(Number(localStorage.getItem(waterStorageKey) ?? "0"));
    } catch {
      // Ignore malformed local data and start fresh.
    }
  }, []);

  useEffect(() => localStorage.setItem(mealStorageKey, JSON.stringify(completedMeals)), [completedMeals]);
  useEffect(() => localStorage.setItem(shoppingStorageKey, JSON.stringify(shopping)), [shopping]);
  useEffect(() => localStorage.setItem(prepStorageKey, JSON.stringify(prep)), [prep]);
  useEffect(() => localStorage.setItem(waterStorageKey, String(water)), [water]);

  const current = plans[selectedDay];
  const completedToday = current.meals.filter((meal) => completedMeals[meal.id]).length;
  const progress = Math.round((completedToday / current.meals.length) * 100);
  const weekCompleted = useMemo(
    () => plans.flatMap((day) => day.meals).filter((meal) => completedMeals[meal.id]).length,
    [completedMeals],
  );

  function toggleMeal(id: string) {
    setCompletedMeals((value) => ({ ...value, [id]: !value[id] }));
  }

  function toggleShopping(item: string) {
    setShopping((value) => ({ ...value, [item]: !value[item] }));
  }

  function togglePrep(item: string) {
    setPrep((value) => ({ ...value, [item]: !value[item] }));
  }

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>PERSONAL FOOD PLAN</p>
            <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}.</h1>
            <p className={styles.subtitle}>A simple week built for better cholesterol, sustainable fat loss and practical office lunches.</p>
          </div>
          <div className={styles.privateBadge}>Stored locally on this device</div>
        </header>

        <nav className={styles.tabs} aria-label="Food planner sections">
          <button className={tab === "plan" ? styles.activeTab : ""} onClick={() => setTab("plan")}>Weekly plan</button>
          <button className={tab === "shop" ? styles.activeTab : ""} onClick={() => setTab("shop")}>Shopping list</button>
          <button className={tab === "prep" ? styles.activeTab : ""} onClick={() => setTab("prep")}>Meal prep</button>
          <button className={tab === "progress" ? styles.activeTab : ""} onClick={() => setTab("progress")}>Progress</button>
        </nav>

        {tab === "plan" && (
          <>
            <section className={styles.dayStrip}>
              {plans.map((day, index) => (
                <button key={day.day} className={selectedDay === index ? styles.selectedDay : ""} onClick={() => setSelectedDay(index)}>
                  <span>{day.short}</span><small>{day.meals.filter((meal) => completedMeals[meal.id]).length}/5</small>
                </button>
              ))}
            </section>

            <section className={styles.mealGrid}>
              {current.meals.map((meal) => {
                const complete = Boolean(completedMeals[meal.id]);
                return (
                  <button key={meal.id} className={`${styles.mealCard} ${complete ? styles.complete : ""}`} onClick={() => toggleMeal(meal.id)}>
                    <div className={styles.check}>{complete ? "✓" : ""}</div>
                    <div>
                      <span>{meal.label}</span>
                      <h2>{meal.name}</h2>
                      {meal.detail && <p>{meal.detail}</p>}
                      {meal.method && <em>{meal.method}</em>}
                    </div>
                  </button>
                );
              })}
            </section>

            <section className={styles.recipeCard}>
              <div>
                <p className={styles.eyebrow}>GO-TO BREAKFAST</p>
                <h2>Banana protein smoothie</h2>
                <p>Fast, filling and office-morning friendly.</p>
              </div>
              <div className={styles.ingredients}>
                <span><strong>110 g</strong> frozen banana</span>
                <span><strong>50 g</strong> rolled oats</span>
                <span><strong>16 g</strong> powdered peanut butter</span>
                <span><strong>300 mL</strong> light milk</span>
                <span><strong>1 scoop</strong> vanilla whey</span>
              </div>
            </section>
          </>
        )}

        {tab === "shop" && (
          <section className={styles.shoppingGrid}>
            {shoppingSections.map((section) => (
              <article className={styles.listCard} key={section.title}>
                <h2>{section.title}</h2>
                {section.items.map((item) => (
                  <label key={item} className={shopping[item] ? styles.checkedItem : ""}>
                    <input type="checkbox" checked={Boolean(shopping[item])} onChange={() => toggleShopping(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </article>
            ))}
            <button className={styles.resetButton} onClick={() => setShopping({})}>Reset shopping list</button>
          </section>
        )}

        {tab === "prep" && (
          <section className={styles.prepLayout}>
            <article className={styles.listCard}>
              <p className={styles.eyebrow}>SUNDAY · ABOUT 90 MINUTES</p>
              <h2>Meal-prep run sheet</h2>
              {prepItems.map((item, index) => (
                <label key={item} className={prep[item] ? styles.checkedItem : ""}>
                  <input type="checkbox" checked={Boolean(prep[item])} onChange={() => togglePrep(item)} />
                  <span><strong>{index + 1}.</strong> {item}</span>
                </label>
              ))}
              <button className={styles.resetButton} onClick={() => setPrep({})}>Reset prep list</button>
            </article>
            <aside className={styles.tipCard}>
              <p className={styles.eyebrow}>FOOD SAFETY</p>
              <h2>Keep office lunches cold</h2>
              <p>Refrigerate cooked food promptly, use an insulated lunch bag when needed, and reheat microwave meals until steaming hot throughout.</p>
              <hr />
              <p className={styles.eyebrow}>YOUR PREFERENCES</p>
              <p>No capsicum, Brussels sprouts, asparagus, pasta or raw onion. Tomato stays off sandwiches.</p>
            </aside>
          </section>
        )}


        {tab === "progress" && (
          <>
        <section className={styles.summaryGrid}>
          <article className={styles.heroCard}>
            <div className={styles.cardTopline}><span>Today</span><strong>{current.day}</strong></div>
            <div className={styles.progressRing} style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
              <div><strong>{progress}%</strong><span>{completedToday}/{current.meals.length} meals</span></div>
            </div>
          </article>
          <article className={styles.metricCard}>
            <span>Water</span>
            <strong>{(water / 1000).toFixed(2)} L</strong>
            <small>Goal 3.0 L</small>
            <div className={styles.waterBar}><i style={{ width: `${Math.min(100, (water / 3000) * 100)}%` }} /></div>
            <div className={styles.waterButtons}>
              {[250, 500, 750].map((amount) => <button key={amount} onClick={() => setWater((value) => Math.min(4000, value + amount))}>+{amount} mL</button>)}
              <button onClick={() => setWater(0)}>Reset</button>
            </div>
          </article>
          <article className={styles.metricCard}>
            <span>Weekly consistency</span>
            <strong>{weekCompleted}/35</strong>
            <small>Meals checked off this week</small>
            <div className={styles.miniNote}>Consistency beats perfection.</div>
          </article>
        </section>

            <section className={styles.recipeCard}>
              <div>
                <p className={styles.eyebrow}>THIS WEEK</p>
                <h2>{weekCompleted} of 35 meals completed</h2>
                <p>Your planner and water progress are stored locally on this device.</p>
              </div>
              <div className={styles.ingredients}>
                <span><strong>{progress}%</strong> today</span>
                <span><strong>{(water / 1000).toFixed(2)} L</strong> water</span>
                <span><strong>{Math.round((weekCompleted / 35) * 100)}%</strong> weekly consistency</span>
              </div>
            </section>
          </>
        )}
        <footer className={styles.footer}>Standalone Food · planner progress is stored locally in this browser</footer>
      </div>
    </main>
  );
}
