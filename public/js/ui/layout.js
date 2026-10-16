import { $ } from "./dom.js";

// Move the existing controls into a dialog on compact screens, preserving their
// event handlers and live game state. Never duplicate IDs or create a second UI.
export function bindLayout() {
  const dialog = $("panel-dialog");
  const compact = matchMedia("(max-width: 1199px)");
  const panels = [
    {
      button: $("open-mode"),
      slot: $("mode-slot"),
      panel: document.querySelector(".mode-panel"),
      label: "대국 설정",
    },
    {
      button: $("open-history"),
      slot: $("history-slot"),
      panel: document.querySelector(".history-panel"),
      label: "기보",
    },
  ];
  function restore() {
    for (const { slot, panel } of panels) slot.append(panel);
  }
  for (const { button, panel, label } of panels) {
    button.onclick = () => {
      restore();
      $("panel-content").append(panel);
      dialog.setAttribute("aria-label", label);
      dialog.showModal();
    };
  }
  $("close-panel").onclick = () => dialog.close();
  dialog.addEventListener("close", restore);
  compact.addEventListener("change", () => {
    dialog.close();
    restore();
  });
  return { closePanel: () => dialog.close() };
}
