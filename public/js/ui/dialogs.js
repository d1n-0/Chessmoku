import { $ } from "./dom.js";

export function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 3500);
}
export function confirmAction(title, detail, fn) {
  $("confirm-title").textContent = title;
  $("confirm-detail").textContent = detail;
  $("confirm-dialog").showModal();
  $("confirm-ok").onclick = () => {
    $("confirm-dialog").close();
    fn();
  };
}
export function bindDialogs() {
  $("confirm-cancel").onclick = () => $("confirm-dialog").close();
  for (const b of document.querySelectorAll(".close-dialog"))
    b.onclick = () => b.closest("dialog").close();
  for (const d of document.querySelectorAll("dialog"))
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    });
}
