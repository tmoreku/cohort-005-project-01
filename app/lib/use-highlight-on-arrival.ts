import { useEffect } from "react";
import { useLocation } from "react-router";

// ─── Highlight on arrival ───
// A Notification links to the exact item it's about. When a page loads with
// a target, this scrolls to the element with that id and briefly highlights
// it (the `.highlight-on-arrival` class in app.css).
//
// The target may render after the navigation (a lazy list, a deferred
// loader), so if it isn't there yet this watches the DOM for it for a short
// while, then gives up quietly.

const HIGHLIGHT_CLASS = "highlight-on-arrival";
const HIGHLIGHT_MS = 2500;
const WAIT_FOR_TARGET_MS = 5000;

function highlight(element: HTMLElement): () => void {
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
}

/**
 * Scrolls to and highlights the element a Notification points at.
 *
 * @param elementId The id of the element to highlight, without a `#`.
 *   Leave it out to follow the URL fragment (`#discussion-question-12`); the
 *   app layout calls it that way, so every page gets fragment targets for
 *   free. A page whose target comes from somewhere else, such as a search
 *   parameter (`/admin/refunds?request=7`), passes the element id itself,
 *   e.g. `useHighlightOnArrival(requestId ? \`refund-request-${requestId}\` : null)`.
 *   `null` or `""` means there's nothing to highlight.
 */
export function useHighlightOnArrival(elementId?: string | null) {
  const location = useLocation();
  const fromHash = decodeURIComponent(location.hash.replace(/^#/, ""));
  const targetId = elementId === undefined ? fromHash : elementId;

  useEffect(() => {
    if (!targetId) return;

    const existing = document.getElementById(targetId);
    if (existing) return highlight(existing);

    let stopHighlight: (() => void) | undefined;
    const observer = new MutationObserver(() => {
      const element = document.getElementById(targetId);
      if (!element) return;
      stopWaiting();
      stopHighlight = highlight(element);
    });
    const giveUp = window.setTimeout(stopWaiting, WAIT_FOR_TARGET_MS);
    function stopWaiting() {
      observer.disconnect();
      window.clearTimeout(giveUp);
    }
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      stopWaiting();
      stopHighlight?.();
    };
  }, [targetId, location.key]);
}
