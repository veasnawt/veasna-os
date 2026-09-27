/** Native IME margins resize the entire WebView. Keep whichever editable field is focused
 * visible within its own scroll container after the keyboard animation/layout finishes. */
export function installKeyboardViewport(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reveal = () => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || !element.matches("input,textarea,[contenteditable=true]")) return;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const rect = element.getBoundingClientRect();
    if (rect.bottom > bottom - 24 || rect.top < top + 16) element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  };
  const update = () => { clearTimeout(timer); timer = setTimeout(reveal, 120); };
  window.addEventListener("resize", update);
  window.visualViewport?.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  return () => { clearTimeout(timer); window.removeEventListener("resize", update); window.visualViewport?.removeEventListener("resize", update); document.removeEventListener("focusin", update); };
}
