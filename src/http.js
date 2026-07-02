const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders,
    },
  });
}

export function textResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: extraHeaders,
  });
}
