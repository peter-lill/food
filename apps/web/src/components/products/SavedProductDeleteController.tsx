"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./SavedProductDeleteController.module.css";

const holdDelayMs = 650;
const movementTolerancePx = 10;

type DeleteResponse = {
  deleted?: boolean;
  error?: string;
  product?: { id: string; name: string };
};

function productButtonFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const button = target.closest('section[aria-label="Saved products"] button');
  return button instanceof HTMLButtonElement && button.querySelector("strong") ? button : null;
}

function productDescriptor(button: HTMLButtonElement) {
  const name = button.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const trailing = button.querySelector(":scope > span:last-child");
  const trailingText = trailing?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const barcode = trailingText && trailingText !== "No barcode" && !trailingText.startsWith("Tap to delete")
    ? trailingText
    : button.dataset.productBarcode || null;

  return { name, barcode, trailing };
}

function messageElement(section: Element) {
  const existing = section.querySelector<HTMLElement>("[data-product-delete-message]");
  if (existing) return existing;

  const message = document.createElement("p");
  message.dataset.productDeleteMessage = "true";
  message.setAttribute("role", "status");
  section.append(message);
  return message;
}

function showMessage(button: HTMLButtonElement, text: string, tone: "success" | "error") {
  const section = button.closest('section[aria-label="Saved products"]');
  if (!section) return;
  const message = messageElement(section);
  message.dataset.tone = tone;
  message.setAttribute("role", tone === "error" ? "alert" : "status");
  message.textContent = text;
}

function restoreTrailingText(button: HTMLButtonElement) {
  const trailing = button.querySelector<HTMLElement>(":scope > span:last-child");
  if (trailing && button.dataset.originalTrailingText !== undefined) {
    trailing.textContent = button.dataset.originalTrailingText;
  }
}

function disarmButton(button: HTMLButtonElement | null) {
  if (!button) return;
  restoreTrailingText(button);
  delete button.dataset.productDeleteArmed;
  delete button.dataset.productDeleting;
  delete button.dataset.originalTrailingText;
  delete button.dataset.productBarcode;
  button.removeAttribute("aria-label");
  button.removeAttribute("title");
}

function armButton(button: HTMLButtonElement) {
  const { name, barcode, trailing } = productDescriptor(button);
  if (!name || !trailing) return;

  document
    .querySelectorAll<HTMLButtonElement>('section[aria-label="Saved products"] button[data-product-delete-armed="true"]')
    .forEach((other) => {
      if (other !== button) disarmButton(other);
    });

  button.dataset.originalTrailingText = trailing.textContent ?? "";
  if (barcode) button.dataset.productBarcode = barcode;
  trailing.textContent = "Tap to delete";
  button.dataset.productDeleteArmed = "true";
  button.setAttribute("aria-label", `Delete ${name}. Tap again to confirm.`);
  button.title = `Tap again to permanently delete ${name} from saved products`;
  navigator.vibrate?.(45);
}

export function SavedProductDeleteController() {
  const router = useRouter();

  useEffect(() => {
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressedButton: HTMLButtonElement | null = null;
    let suppressClickFor: HTMLButtonElement | null = null;
    let startX = 0;
    let startY = 0;
    let deleting = false;

    const clearPressTimer = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      pressedButton = null;
    };

    const deleteProduct = async (button: HTMLButtonElement) => {
      if (deleting) return;
      const { name, barcode, trailing } = productDescriptor(button);
      if (!name) return;

      deleting = true;
      button.dataset.productDeleting = "true";
      if (trailing) trailing.textContent = "Deleting…";

      try {
        const response = await fetch("/api/products/catalogue", {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, barcode }),
        });
        const payload = await response.json() as DeleteResponse;

        if (!response.ok || !payload.deleted) {
          throw new Error(payload.error || `Delete returned HTTP ${response.status}.`);
        }

        showMessage(button, `${payload.product?.name ?? name} was deleted from saved products.`, "success");
        button.remove();
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "The saved product could not be deleted.";
        showMessage(button, message, "error");
        disarmButton(button);
      } finally {
        deleting = false;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const button = productButtonFromTarget(event.target);
      if (!button) {
        document
          .querySelectorAll<HTMLButtonElement>('section[aria-label="Saved products"] button[data-product-delete-armed="true"]')
          .forEach(disarmButton);
        clearPressTimer();
        return;
      }

      if (button.dataset.productDeleteArmed === "true") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      clearPressTimer();
      pressedButton = button;
      startX = event.clientX;
      startY = event.clientY;
      pressTimer = setTimeout(() => {
        if (!pressedButton) return;
        armButton(pressedButton);
        suppressClickFor = pressedButton;
        pressTimer = null;
      }, holdDelayMs);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pressedButton) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > movementTolerancePx) {
        clearPressTimer();
      }
    };

    const onPointerEnd = () => clearPressTimer();

    const onClick = (event: MouseEvent) => {
      const button = productButtonFromTarget(event.target);
      if (!button) return;

      if (suppressClickFor === button) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        suppressClickFor = null;
        return;
      }

      if (button.dataset.productDeleteArmed === "true") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void deleteProduct(button);
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      const button = productButtonFromTarget(event.target);
      if (!button) return;
      event.preventDefault();
      armButton(button);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);

    return () => {
      clearPressTimer();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [router]);

  return <span aria-hidden className={styles.controller} />;
}
