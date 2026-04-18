import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { createWecomAgentWebhookHandler } from "./src/agent/webhook.js";
import { wecomPlugin } from "./src/channel.js";
import { CHANNEL_ID, WEBHOOK_PATHS } from "./src/const.js";
import { createWeComMcpTool } from "./src/mcp/index.js";
import { setWeComRuntime } from "./src/runtime.js";
import { handleWecomWebhookRequest } from "./src/webhook/index.js";

export { wecomPlugin } from "./src/channel.js";
export { setWeComRuntime, getWeComRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "wecom",
  name: "WeCom",
  description: "WeCom channel plugin",
  plugin: wecomPlugin,
  setRuntime: setWeComRuntime,
  registerFull(api: OpenClawPluginApi) {
    // Register wecom_mcp tool: invoke WeCom MCP Server via HTTP
    api.registerTool(createWeComMcpTool() as unknown, { name: "wecom_mcp" });

    const agentWebhookHandler = createWecomAgentWebhookHandler(api.runtime);

    // Register Agent-mode HTTP routes (prefix match covers accountId sub-paths)
    api.registerHttpRoute({
      path: WEBHOOK_PATHS.AGENT_PLUGIN,
      handler: agentWebhookHandler,
      auth: "plugin",
      match: "prefix",
    });
    api.registerHttpRoute({
      path: WEBHOOK_PATHS.AGENT,
      handler: agentWebhookHandler,
      auth: "plugin",
      match: "prefix",
    });

    // Register bot webhook HTTP routes (prefix match)
    const webhookRoutes = [WEBHOOK_PATHS.BOT_PLUGIN, WEBHOOK_PATHS.BOT_ALT, WEBHOOK_PATHS.BOT];
    for (const routePath of webhookRoutes) {
      api.registerHttpRoute({
        path: routePath,
        handler: handleWecomWebhookRequest,
        auth: "plugin",
        match: "prefix",
      });
    }

    // Inject media-send instructions (WeCom channel only)
    api.on("before_prompt_build", (_event, ctx) => {
      if (ctx?.channelId !== CHANNEL_ID) {
        return;
      }
      return {
        appendSystemContext: [
          "重要：涉及发送图片/视频/语音/文件给用户时，请务必使用 `MEDIA:` 指令。详见  wecom-send-media 这个 skill（技能）。",
          "重要：当需要向用户发送结构化卡片消息（如通知、投票、按钮选择等）时，请在回复中直接输出 JSON 代码块（```json ... ```），其中 card_type 字段标明卡片类型。详见 wecom-send-template-card 技能。",
        ].join("\n"),
      };
    });
  },
});
