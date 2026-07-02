let hideTimer = null;
let removeTimer = null;

export function showToast(message = "已复制到剪贴板") {
  const existing = document.getElementById("toast");
  if (existing) {
    existing.remove();
  }

  window.clearTimeout(hideTimer);
  window.clearTimeout(removeTimer);

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast--visible");
  });

  hideTimer = window.setTimeout(() => {
    toast.classList.remove("toast--visible");
    toast.classList.add("toast--hiding");
  }, 2000);

  removeTimer = window.setTimeout(() => {
    toast.remove();
  }, 2400);
}
