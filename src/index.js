import { getSessionId } from "./auth.js";
import { renderSharePage } from "./shareTemplate.js";
import { getShare } from "./share.js";
import { textResponse } from "./http.js";
import { handleLogin, handleLogout, handleMe } from "./routes/auth.js";
import { handleExtract } from "./routes/extract.js";
import { handleHistoryDetail, handleHistoryList } from "./routes/history.js";
import {
  ensureAdminUser,
  handleAdminCreateUser,
  handleAdminHistory,
  handleAdminPatchUser,
  handleAdminStats,
  handleAdminUsers,
} from "./routes/admin.js";

export default {
  async fetch(request, env, ctx) {
    await ensureAdminUser(env, request);

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/api/auth/login" && method === "POST") {
      return handleLogin(request, env);
    }
    if (pathname === "/api/auth/logout" && method === "POST") {
      const sessionId = getSessionId(request);
      if (sessionId) {
        ctx.waitUntil(env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run());
      }
      return handleLogout(request);
    }
    if (pathname === "/api/auth/me" && method === "GET") {
      return handleMe(request, env);
    }

    if (pathname === "/api/extract" && method === "POST") {
      return handleExtract(request, env);
    }

    if (pathname === "/api/history" && method === "GET") {
      return handleHistoryList(request, env);
    }

    const historyMatch = pathname.match(/^\/api\/history\/([a-zA-Z0-9]+)$/);
    if (historyMatch && method === "GET") {
      return handleHistoryDetail(request, env, historyMatch[1]);
    }

    if (pathname === "/api/admin/stats" && method === "GET") {
      return handleAdminStats(request, env);
    }
    if (pathname === "/api/admin/users" && method === "GET") {
      return handleAdminUsers(request, env);
    }
    if (pathname === "/api/admin/users" && method === "POST") {
      return handleAdminCreateUser(request, env);
    }
    if (pathname === "/api/admin/history" && method === "GET") {
      return handleAdminHistory(request, env);
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9]+)$/);
    if (adminUserMatch && method === "PATCH") {
      return handleAdminPatchUser(request, env, adminUserMatch[1]);
    }

    const shareMatch = pathname.match(/^\/s\/([a-zA-Z0-9]+)$/);
    if (shareMatch && method === "GET") {
      const data = await getShare(env, shareMatch[1]);
      if (!data) {
        return textResponse("分享链接不存在或已过期", 404, {
          "Content-Type": "text/plain; charset=utf-8",
        });
      }
      return new Response(renderSharePage(data, shareMatch[1]), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
