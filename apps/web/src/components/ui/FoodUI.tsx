import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function FoodButton({
  children,
  href,
  variant = "primary",
  size = "medium",
  className,
}: {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "small" | "medium";
  className?: string;
}) {
  return (
    <Link className={classes("food-button", `food-button-${variant}`, `food-button-${size}`, className)} href={href}>
      {children}
    </Link>
  );
}

export function FoodCard({
  children,
  className,
  interactive = false,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  tone?: "default" | "soft" | "forest";
}) {
  return <section className={classes("food-card", `food-card-${tone}`, interactive && "food-card-interactive", className)}>{children}</section>;
}

export function FoodBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "coral";
}) {
  return <span className={classes("food-badge", `food-badge-${tone}`)}>{children}</span>;
}

export function FoodIconTile({
  children,
  tone = "green",
  size = "medium",
}: {
  children: ReactNode;
  tone?: "green" | "blue" | "amber" | "coral" | "cream";
  size?: "small" | "medium" | "large";
}) {
  return <span aria-hidden="true" className={classes("food-icon-tile", `food-icon-${tone}`, `food-icon-${size}`)}>{children}</span>;
}

export function FoodSectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="food-section-header">
      <div>
        {eyebrow ? <p className="food-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="food-section-action">{action}</div> : null}
    </header>
  );
}

export function FoodEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="food-empty-state">
      {icon ? <FoodIconTile size="large">{icon}</FoodIconTile> : null}
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function FoodSkeleton({ width = "100%", height = 16 }: { width?: string | number; height?: number }) {
  return <span aria-hidden="true" className="food-skeleton" style={{ width, height }} />;
}

export function FoodField({
  label,
  hint,
  className,
  ...props
}: ComponentPropsWithoutRef<"input"> & { label: string; hint?: string }) {
  return (
    <label className={classes("food-field", className)}>
      <span>{label}</span>
      <input {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
