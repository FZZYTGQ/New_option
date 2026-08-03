import { formatRequestError, requireAuth } from "./api.js";
import { createHistoryListController } from "./history-list.js";

const historyList = document.getElementById("history-list");
const status = document.getElementById("status");

let recordsController = null;

function setStatus(message, type = "error") {
  status.hidden = false;
  status.textContent = message;
  status.className = `status status--${type}`;
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  recordsController = createHistoryListController({
    container: historyList,
    emptyMessage: "还没有历史记录，去首页提取一个视频吧。",
  });

  try {
    await recordsController.load();
    status.hidden = true;
  } catch (error) {
    setStatus(formatRequestError(error, "加载历史记录失败"));
  }

  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden && recordsController) {
      try {
        await recordsController.load();
      } catch {
        // ignore
      }
    }
  });
}

init();
