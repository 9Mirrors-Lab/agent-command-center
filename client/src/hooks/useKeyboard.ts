import { useEffect } from "react";

interface KeyboardActions {
  onSpawn: () => void;
  onEscape: () => void;
  onNavigate: (direction: "up" | "down") => void;
  onSelect: () => void;
  onStop: () => void;
  onResume: () => void;
  onBroadcast: () => void;
  onSelectIndex: (index: number) => void;
  onToggleManager: () => void;
}

export function useKeyboard(actions: KeyboardActions) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;

      // Escape always works
      if (e.key === "Escape") {
        actions.onEscape();
        return;
      }

      // All other shortcuts only fire when not focused on an input
      if (isInput) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          actions.onSpawn();
          break;
        case "j":
        case "ArrowDown":
          e.preventDefault();
          actions.onNavigate("down");
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          actions.onNavigate("up");
          break;
        case "Enter":
          e.preventDefault();
          actions.onSelect();
          break;
        case "s":
          e.preventDefault();
          actions.onStop();
          break;
        case "r":
          e.preventDefault();
          actions.onResume();
          break;
        case "b":
          e.preventDefault();
          actions.onBroadcast();
          break;
        case "m":
          e.preventDefault();
          actions.onToggleManager();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          e.preventDefault();
          actions.onSelectIndex(Number(e.key) - 1);
          break;
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [actions]);
}
