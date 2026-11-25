"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "teu-theme";

/** Applique le thème choisi et le mémorise sur l'appareil. */
export function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === "dark"
      ? true
      : choice === "light"
        ? false
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // stockage indisponible (mode privé) : le thème s'applique quand même
  }
}

/**
 * Sélecteur d'apparence — clair, sombre ou « comme le système ».
 *
 * Le réglage est **local à l'appareil** : il ne touche pas le compte, et un
 * utilisateur sur téléphone et sur ordinateur peut choisir différemment.
 */
export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    setChoice(stored === "dark" || stored === "light" ? stored : "system");
    setReady(true);
  }, []);

  // Le mode « système » suit les changements de thème du système.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (!stored || stored === "system") applyTheme("system");
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function select(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
  }

  const options: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Clair", icon: <Sun className="h-4 w-4" aria-hidden="true" /> },
    { value: "dark", label: "Sombre", icon: <Moon className="h-4 w-4" aria-hidden="true" /> },
    {
      value: "system",
      label: "Système",
      icon: <Monitor className="h-4 w-4" aria-hidden="true" />,
    },
  ];

  return (
    <div role="radiogroup" aria-label="Thème de l’interface" className="grid gap-3 sm:grid-cols-3">
      {options.map((option) => {
        const active = ready && choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => select(option.value)}
            className={`focusable flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
              active
                ? "border-primary bg-primary-50 font-medium text-primary-700"
                : "border-border bg-surface text-night hover:border-primary/40"
            }`}
          >
            <span className={active ? "text-primary-ink" : "text-muted"}>{option.icon}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
