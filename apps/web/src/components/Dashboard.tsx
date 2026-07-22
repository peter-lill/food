"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { inventory, recipes } from "@/lib/demo";

const mealStorageKey = "food-standalone-meals-v1";
const waterStorageKey = "food-standalone-water-v1";

const dayMeals = [
  [
    ["mon-breakfast", "Banana protein smoothie"],
    ["mon-am", "Apple"],
    ["mon-lunch", "Chicken burrito bowl"],
    ["mon-pm", "High-protein Greek yoghurt"],
    ["mon-dinner", "Lemon herb chicken"],
  ],
  [
    ["tue-breakfast", "Three eggs on wholegrain toast"],
    ["tue-am", "Raw almonds"],
    ["tue-lunch", "Chicken, avocado and spinach toastie"],
    ["tue-pm", "Cottage cheese"],
    ["tue-dinner", "Sirloin steak"],
  ],
  [
    ["wed-breakfast", "Banana protein smoothie"],
    ["wed-am", "Banana"],
    ["wed-lunch", "Lean beef rice bowl"],
    ["wed-pm", "High-protein Greek yoghurt"],
    ["wed-dinner", "Homemade lean beef burgers"],
  ],
  [
    ["thu-breakfast", "Greek yoghurt, blueberries and oats"],
    ["thu-am", "Apple"],
    ["thu-lunch", "Tuna melt toastie"],
    ["thu-pm", "Protein shake"],
    ["thu-dinner", "Oven-baked salmon"],
  ],
  [
    ["fri-breakfast", "Banana protein smoothie"],
    ["fri-am", "Raw almonds"],
    ["fri-lunch", "Steak and mushroom toastie"],
    ["fri-pm", "High-protein Greek yoghurt"],
    ["fri-dinner", "Mexican chicken bowl"],
  ],
  [
    ["sat-breakfast", "Eggs on wholegrain toast"],
    ["sat-am", "Apple"],
    ["sat-lunch", "Chicken wrap or leftovers"],
    ["sat-pm", "Cottage cheese"],
    ["sat-dinner", "Beef stir-fry"],
  ],
  [
    ["sun-breakfast", "Banana protein smoothie"],
    ["sun-am", "Apple"],
    ["sun-lunch", "Roast chicken wrap"],
    ["sun-pm", "High-protein Greek yoghurt"],
    ["sun-dinner", "Roast chicken"],
  ],
] as const;

function todayIndex() {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export function Dashboard() {
  const [water, setWater] = useState(0);
  const [completedMeals, setCompletedMeals] = useState<Record<string, boolean>>({});
  const meals = dayMeals[todayIndex()];

  useEffect(() => {
    try {
      setWater(Number(localStorage.getItem(waterStorageKey) ?? "0"));
      setCompletedMeals(JSON.parse(localStorage.getItem(mealStorageKey) ?? "{}"));
    } catch {
      setWater(0);
      setCompletedMeals({});
    }
  }, []);

  function addWater(amount: number) {
    setWater((current) => {
      const next = Math.min(4000, current + amount);
      localStorage.setItem(waterStorageKey, String(next));
      return next;
    });
  }

  function toggleMeal(id: string) {
    setCompletedMeals((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(mealStorageKey, JSON.stringify(next));
      return next;
    });
  }

  const completedCount = meals.filter(([id]) => completedMeals[id]).length;
  const mealProgress = Math.round((completedCount / meals.length) * 100);
  const waterProgress = Math.min(100, Math.round((water / 3000) * 100));
  const nextMeal = meals.find(([id]) => !completedMeals[id]);
  const useSoon = inventory.filter((item) => item.useSoon);
  const readyRecipe = useMemo(() => [...recipes].sort((a, b) => b.available - a.available)[0], []);

  return (
    <div className="dashboard-stack">
      <section className="welcome-panel">
        <div>
          <p className="eyebrow">TODAY AT A GLANCE</p>
          <h2>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, Peter.</h2>
          <p>{nextMeal ? `Your next planned meal is ${nextMeal[1]}.` : "Every planned meal is complete for today."}</p>
        </div>
        <Link className="primary-button" href="/planner">Open meal plan</Link>
      </section>

      <div className="dashboard-grid">
        <section className="panel span-7">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MEAL PLAN</p>
              <h2>Today&apos;s meals</h2>
            </div>
            <span className="pill">{completedCount}/{meals.length} complete</span>
          </div>
          <div className="progress-track" aria-label={`${mealProgress}% of meals complete`}>
            <span style={{ width: `${mealProgress}%` }} />
          </div>
          <div className="task-list">
            {meals.map(([id, name], index) => (
              <button className={`task-row ${completedMeals[id] ? "complete" : ""}`} type="button" key={id} onClick={() => toggleMeal(id)}>
                <span className="task-check">{completedMeals[id] ? "✓" : ""}</span>
                <span>
                  <small>{["Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Dinner"][index]}</small>
                  <strong>{name}</strong>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel span-5 hydration-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HYDRATION</p>
              <h2>{(water / 1000).toFixed(2)} L</h2>
            </div>
            <span className="pill">Goal 3.0 L</span>
          </div>
          <div className="hydration-visual" style={{ "--water": `${waterProgress}%` } as React.CSSProperties}>
            <div><strong>{waterProgress}%</strong><small>of daily goal</small></div>
          </div>
          <div className="quick-buttons">
            <button type="button" onClick={() => addWater(250)}>+250 mL</button>
            <button type="button" onClick={() => addWater(500)}>+500 mL</button>
          </div>
        </section>

        <section className="panel span-4">
          <div className="panel-heading">
            <div><p className="eyebrow">INVENTORY</p><h2>Use soon</h2></div>
            <Link href="/inventory">View all</Link>
          </div>
          <div className="compact-list">
            {useSoon.map((item) => (
              <div key={item.name}><span><strong>{item.name}</strong><small>{item.location}</small></span><span className="pill warning">{item.quantity}</span></div>
            ))}
          </div>
        </section>

        <section className="panel span-4">
          <div className="panel-heading">
            <div><p className="eyebrow">READY TO COOK</p><h2>{readyRecipe.name}</h2></div>
            <span className="pill">{readyRecipe.available}% ready</span>
          </div>
          <p className="panel-copy">{readyRecipe.minutes} minutes · {readyRecipe.protein} g protein</p>
          <Link className="secondary-button full-width" href="/recipes">Choose a recipe</Link>
        </section>

        <section className="panel span-4">
          <div className="panel-heading">
            <div><p className="eyebrow">HEALTH</p><h2>Daily snapshot</h2></div>
            <Link href="/health">Details</Link>
          </div>
          <div className="metric-pair"><span><small>Steps</small><strong>8,642</strong></span><span><small>Exercise</small><strong>42 min</strong></span></div>
          <div className="metric-pair"><span><small>Sleep</small><strong>7 h 18 m</strong></span><span><small>Weight</small><strong>93.3 kg</strong></span></div>
        </section>

        <section className="panel span-12 action-panel">
          <div><p className="eyebrow">NEXT ACTION</p><h2>Turn the plan into a shopping list</h2><p className="panel-copy">Review ingredients and organise the next shop by category.</p></div>
          <Link className="primary-button" href="/shopping">Open shopping</Link>
        </section>
      </div>
    </div>
  );
}
