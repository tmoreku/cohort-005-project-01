import { useEffect } from "react";
import { useLocation } from "react-router";

// ─── Highlight on arrival ───
// A Notification links to the exact item it's about. When a page loads with
// a target, this scrolls to the element with that id and briefly highlights
// it (the `.highlight-on-arrival` class in app.css).
//
// With no argument it follows the URL fragment (`#discussion-question-12`);
// the app layout calls it that way, so every page gets fragment targets for
// free. A page whose target comes from a search parameter instead (e.g.
// `/admin/refunds?request=7`) passes the element id itself.

const HIGHLIGHT_CLASS = "highlight-on-arrival";
const HIGHLIGHT_MS = 2500;

export function useHighlightOnArrival(elementId?: string | null) {
  const location = useLocation();
  const fromHash = decodeURIComponent(location.hash.replace(/^#/, ""));
  const targetId = elementId === undefined ? fromHash : elementId;

  useEffect(() => {
    if (!targetId) return;
    const element = document.getElementById(targetId);
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.remove(HIGHLIGHT_CLASS);
    // Restart the animation if the same item is targeted twice in a row.
    void element.offsetWidth;
    element.classList.add(HIGHLIGHT_CLASS);

    const timeout = window.setTimeout(
      () => element.classList.remove(HIGHLIGHT_CLASS),
      HIGHLIGHT_MS
    );
    return () => window.clearTimeout(timeout);
  }, [targetId, location.key]);
}
