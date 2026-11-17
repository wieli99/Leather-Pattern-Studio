import "./style.css";
import "./textFonts.css";
import { prepareDevelopmentStartup } from "./developmentStartup";
async function start() {
  if (import.meta.env.DEV && !(await prepareDevelopmentStartup())) return;
  // Load the editor singleton only after removing production worker control.
  const [{ createApp }, { default: App }] = await Promise.all([
    import("vue"),
    import("./vue/App.vue"),
  ]);
  await Promise.all(["PatternSans", "PatternSerif", "PatternMono"].flatMap(f => ["", "bold ", "italic ", "bold italic "].map(style => document.fonts.load(`${style}16px ${f}`))));
  const app = createApp(App);
  const { numericWheel } = await import("./vue/numericWheel");
  app.directive("numeric-wheel", numericWheel);
  app.mount("#root");
}
void start().catch((error) => {
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    root.textContent = error instanceof Error ? error.message : String(error);
  }
});
