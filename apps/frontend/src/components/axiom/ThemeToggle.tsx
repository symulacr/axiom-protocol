/*
  ThemeToggle — global light/dark icon button. Dispatches the uiStore
  settings theme (persisted in axiom-ui-settings); App mirrors it onto
  html[data-theme] + body.light, which the console (.app-shell.light) and
  the landing (body.light) both consume. Renders the icon of the theme you
  will switch TO.
*/
import { useUiStore } from "../../lib/uiStore.js";
import { getCopy, type Locale } from "../../lib/copy.js";
import { Moon, Sun } from "./icons.js";

export function ThemeToggle({ locale }: { locale: Locale }) {
  const copy = getCopy(locale);
  const { state, dispatch } = useUiStore();
  const light = state.settings.theme === "light";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={() =>
        dispatch({
          type: "settings",
          patch: { ...state.settings, theme: light ? "dark" : "light" },
        })
      }
      aria-label={light ? copy.a11y.switchToDark : copy.a11y.switchToLight}
      title={light ? copy.a11y.switchToDark : copy.a11y.switchToLight}
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
