import { escapeHtml } from "./api.js";

export function confirmAction({
  title = "确认删除",
  message = "确定删除这条记录？删除后无法恢复。",
  confirmLabel = "删除",
  cancelLabel = "取消",
} = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById("confirm-dialog");
    if (existing) {
      existing.remove();
    }

    const dialog = document.createElement("dialog");
    dialog.id = "confirm-dialog";
    dialog.className = "dialog";
    dialog.innerHTML = `
      <form method="dialog" class="dialog__form">
        <h2 class="dialog__title">${escapeHtml(title)}</h2>
        <p class="dialog__hint">${escapeHtml(message)}</p>
        <div class="dialog__actions">
          <button type="submit" class="btn btn--secondary" value="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="submit" class="btn btn--primary" value="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </form>
    `;

    dialog.addEventListener("close", () => {
      const ok = dialog.returnValue === "ok";
      dialog.remove();
      resolve(ok);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
