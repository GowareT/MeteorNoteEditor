import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { settingsPrefs } from "./lib/settingsPrefs";
import "./styles/tokens.css";

const appearance = settingsPrefs.getAppearance();
if (appearance === "system") {
  document.documentElement.removeAttribute("data-theme");
} else {
  document.documentElement.setAttribute("data-theme", appearance);
}
document.documentElement.style.setProperty(
  "--mn-ui-font-size",
  `${settingsPrefs.getEditorFontSize()}px`,
);
document.documentElement.style.setProperty(
  "--mn-editor-font-size",
  `${settingsPrefs.getEditorFontSize()}px`,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
