const UPSTREAM =
  "https://angao-yizhong-biaobaiqiang.0814-reboot.workers.dev";

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(UPSTREAM);

    // 保留原始请求的路径和查询参数
    upstreamUrl.pathname = incomingUrl.pathname;
    upstreamUrl.search = incomingUrl.search;

    // 复制请求头
    const headers = new Headers(request.headers);

    // 源站 Host 必须使用 Cloudflare Worker B 的域名
    headers.set("Host", upstreamUrl.host);

    // 转发一些基本信息
    headers.set("X-Forwarded-Host", incomingUrl.host);
    headers.set(
      "X-Forwarded-Proto",
      incomingUrl.protocol.replace(":", "")
    );

    /*
     * WebSocket
     *
     * 你的原网站 /api/chat 使用 WebSocket。
     * Worker A 将 WebSocket 请求继续转发给 Worker B。
     */
    const upgrade = request.headers.get("Upgrade");

    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return fetch(upstreamUrl.toString(), {
        method: request.method,
        headers,
      });
    }

    /*
     * 普通 HTTP 请求
     */
    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    // GET / HEAD 请求不能设置 body
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    try {
      const response = await fetch(
        upstreamUrl.toString(),
        init
      );

      /*
       * 复制源站响应头
       */
      const responseHeaders = new Headers(
        response.headers
      );

      /*
       * 如果源站发生重定向，并且 Location 指向
       * workers.dev，则改成当前访问的域名。
       */
      const location = responseHeaders.get("Location");

      if (location) {
        try {
          const locationUrl = new URL(location);

          if (
            locationUrl.hostname === upstreamUrl.hostname
          ) {
            locationUrl.protocol = incomingUrl.protocol;
            locationUrl.hostname = incomingUrl.hostname;

            responseHeaders.set(
              "Location",
              locationUrl.toString()
            );
          }
        } catch (_) {
          // 无法解析 Location 时保持原值
        }
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("Upstream request failed:", error);

      return new Response(
        "Bad Gateway\n\n" +
          "Reverse proxy could not connect to the upstream server.",
        {
          status: 502,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        }
      );
    }
  },
};