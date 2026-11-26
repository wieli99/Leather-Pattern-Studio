import { computed, ref, watch, type Ref, type WritableComputedRef } from "vue";

/**
 * Phones: narrow portrait windows, and short landscape windows on touch screens. Keep in sync with
 * the compact media queries in `src/responsive.css`; CSS owns the layout, this flag only drives the
 * few behaviours CSS cannot express.
 */
export const compactLayoutQuery = "(width < 760px), (max-height: 500px) and (pointer: coarse)";

const query = typeof matchMedia === "function" ? matchMedia(compactLayoutQuery) : undefined;
const compact = ref(!!query?.matches);
query?.addEventListener("change", (event) => (compact.value = event.matches));

export function useCompactLayout(): Readonly<Ref<boolean>> {
  return compact;
}

export type PanelName = "left" | "panel" | "bottom";
const storageKeys: Record<PanelName, string> = { left: "panel-left", panel: "panel-right", bottom: "panel-bottom" };

function stored(name: PanelName) {
  try { return localStorage.getItem(storageKeys[name]) !== "false"; }
  catch { return true; }
}

/**
 * Visibility of the tool rail, the object/property sidebar and the status bar. Desktop choices
 * persist; the compact layout starts with the canvas uncovered (sidebar closed) and keeps its own
 * choices for the session so a phone visit never rewrites the desktop layout.
 */
export function usePanelVisibility(): Record<PanelName, WritableComputedRef<boolean>> {
  const desktop = { left: ref(stored("left")), panel: ref(stored("panel")), bottom: ref(stored("bottom")) };
  const phone = { left: ref(true), panel: ref(false), bottom: ref(true) };
  const visibility = (name: PanelName) =>
    computed({
      get: () => (compact.value ? phone : desktop)[name].value,
      set: (value: boolean) => {
        if (compact.value) {
          phone[name].value = value;
          return;
        }
        desktop[name].value = value;
        try { localStorage.setItem(storageKeys[name], String(value)); }
        catch { /* The choice still applies for this session. */ }
      },
    });
  return { left: visibility("left"), panel: visibility("panel"), bottom: visibility("bottom") };
}

/**
 * Phones show one bottom sheet at a time: when a tool's settings open, the object and property
 * sheet closes so the canvas keeps room. It can be reopened while the tool stays open.
 */
export function closeSidebarForTools(panel: Ref<boolean>, toolOpen: () => boolean) {
  watch(toolOpen, (open) => {
    if (open && compact.value) panel.value = false;
  });
}

const toolSettingsCollapsed = ref(false);
/** Whether phone tool settings are collapsed; shared by every tool for the session. */
export function sharedCollapse(): Ref<boolean> {
  return toolSettingsCollapsed;
}
