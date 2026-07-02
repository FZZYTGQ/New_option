import { getUserFromRequest } from "./auth.js";
import { jsonResponse } from "./http.js";

export async function requireUser(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return { error: jsonResponse({ success: false, error: "请先登录" }, 401) };
  }
  if (user.status !== "active") {
    return {
      error: jsonResponse({ success: false, error: "账号已停用，请联系管理员" }, 403),
    };
  }
  return { user };
}

export async function requireAdmin(request, env) {
  const result = await requireUser(request, env);
  if (result.error) {
    return result;
  }
  if (result.user.role !== "admin") {
    return { error: jsonResponse({ success: false, error: "无权限访问" }, 403) };
  }
  return result;
}
