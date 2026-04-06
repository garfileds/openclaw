/**
 * WeCom setupWizard — declarative CLI setup wizard configuration.
 *
 * The framework identifies and drives the channel's guided configuration flow
 * via the plugin.setupWizard field.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ChannelSetupWizard, ChannelSetupDmPolicy } from "openclaw/plugin-sdk/setup";
import type { ChannelSetupAdapter } from "openclaw/plugin-sdk/setup";
import { resolveWeComAccountMulti, setWeComAccountMulti } from "./accounts.js";
import { CHANNEL_ID } from "./const.js";
import { addWildcardAllowFrom } from "./openclaw-compat.js";
import type { WeComConfig } from "./utils.js";

// ============================================================================
// ChannelSetupAdapter — adapter used by the framework to apply config input
// ============================================================================

export const wecomSetupAdapter: ChannelSetupAdapter = {
  applyAccountConfig: ({ cfg, input }) => {
    const patch: Partial<WeComConfig> = {};

    if (input.token !== undefined) {
      patch.botId = String(input.token).trim();
    }
    if (input.privateKey !== undefined) {
      patch.secret = String(input.privateKey).trim();
    }

    // Enable by default on first-time configuration
    const account = resolveWeComAccountMulti({ cfg });
    if (!account.botId && !account.secret) {
      patch.enabled = true;
    }

    return setWeComAccountMulti(cfg, patch);
  },
};

// ============================================================================
// DM Policy configuration
// ============================================================================

/**
 * Set WeCom dmPolicy
 */
function setWeComDmPolicy(
  cfg: OpenClawConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
): OpenClawConfig {
  const account = resolveWeComAccountMulti({ cfg });
  const existingAllowFrom = account.config.allowFrom ?? [];
  const allowFrom =
    dmPolicy === "open"
      ? addWildcardAllowFrom(existingAllowFrom.map((x) => String(x)))
      : existingAllowFrom.map((x) => String(x));

  return setWeComAccountMulti(cfg, {
    dmPolicy,
    allowFrom,
  });
}

const dmPolicy: ChannelSetupDmPolicy = {
  label: "企业微信",
  channel: CHANNEL_ID,
  policyKey: `channels.${CHANNEL_ID}.dmPolicy`,
  allowFromKey: `channels.${CHANNEL_ID}.allowFrom`,
  getCurrent: (cfg) => {
    const account = resolveWeComAccountMulti({ cfg });
    return account.config.dmPolicy ?? "open";
  },
  setPolicy: (cfg, policy) => {
    return setWeComDmPolicy(cfg, policy);
  },
  promptAllowFrom: async ({ cfg, prompter }) => {
    const account = resolveWeComAccountMulti({ cfg });
    const existingAllowFrom = account.config.allowFrom ?? [];

    const entry = await prompter.text({
      message: "企业微信允许来源（用户ID或群组ID，逗号分隔）",
      placeholder: "user123, group456",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    });

    const allowFrom = String(entry ?? "")
      .split(/[\n,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);

    return setWeComAccountMulti(cfg, { allowFrom });
  },
};

// ============================================================================
// ChannelSetupWizard — declarative setup wizard configuration
// ============================================================================

export const wecomSetupWizard: ChannelSetupWizard = {
  channel: CHANNEL_ID,

  // ── 状态 ──────────────────────────────────────────────────────────────
  status: {
    configuredLabel: "已配置 ✓",
    unconfiguredLabel: "需要 Bot ID 和 Secret",
    configuredHint: "已配置",
    unconfiguredHint: "需要设置",
    resolveConfigured: ({ cfg }) => {
      const account = resolveWeComAccountMulti({ cfg });
      return Boolean(account.botId?.trim() && account.secret?.trim());
    },
    resolveStatusLines: ({ cfg, configured }) => {
      return [`企业微信: ${configured ? "已配置" : "需要 Bot ID 和 Secret"}`];
    },
  },

  // ── 引导说明 ──────────────────────────────────────────────────────────
  introNote: {
    title: "企业微信设置",
    lines: [
      "企业微信机器人需要以下配置信息：",
      "1. Bot ID: 企业微信机器人 ID",
      "2. Secret: 企业微信机器人密钥",
    ],
    shouldShow: ({ cfg }) => {
      const account = resolveWeComAccountMulti({ cfg });
      return !account.botId?.trim() || !account.secret?.trim();
    },
  },

  // ── Credentials input ──────────────────────────────────────────────────
  credentials: [
    {
      inputKey: "token",
      providerHint: "企业微信",
      credentialLabel: "Bot ID",
      envPrompt: "使用环境变量中的 Bot ID？",
      keepPrompt: "Bot ID 已配置，保留当前值？",
      inputPrompt: "企业微信机器人 Bot ID",
      inspect: ({ cfg }) => {
        const account = resolveWeComAccountMulti({ cfg });
        const hasValue = Boolean(account.botId?.trim());
        return {
          accountConfigured: hasValue,
          hasConfiguredValue: hasValue,
          resolvedValue: account.botId || undefined,
        };
      },
      applySet: ({ cfg, resolvedValue }) => {
        return setWeComAccountMulti(cfg, { botId: resolvedValue });
      },
    },
    {
      inputKey: "privateKey",
      providerHint: "企业微信",
      credentialLabel: "Secret",
      envPrompt: "使用环境变量中的 Secret？",
      keepPrompt: "Secret 已配置，保留当前值？",
      inputPrompt: "企业微信机器人 Secret",
      inspect: ({ cfg }) => {
        const account = resolveWeComAccountMulti({ cfg });
        const hasValue = Boolean(account.secret?.trim());
        return {
          accountConfigured: hasValue,
          hasConfiguredValue: hasValue,
          resolvedValue: account.secret || undefined,
        };
      },
      applySet: ({ cfg, resolvedValue }) => {
        return setWeComAccountMulti(cfg, { secret: resolvedValue });
      },
    },
  ],

  // ── Post-completion finalization ──────────────────────────────────────
  finalize: async ({ cfg }) => {
    // Ensure the channel is enabled after configuration is complete
    const account = resolveWeComAccountMulti({ cfg });
    if (account.botId?.trim() && account.secret?.trim() && !account.enabled) {
      return { cfg: setWeComAccountMulti(cfg, { enabled: true }) };
    }
    return undefined;
  },

  // ── Completion note ──────────────────────────────────────────────────
  completionNote: {
    title: "企业微信配置完成",
    lines: ["企业微信机器人已配置完成。", "运行 `openclaw start` 启动服务。"],
    shouldShow: ({ cfg }) => {
      const account = resolveWeComAccountMulti({ cfg });
      return Boolean(account.botId?.trim() && account.secret?.trim());
    },
  },

  // ── DM 策略 ──────────────────────────────────────────────────────────
  dmPolicy,

  // ── 禁用 ─────────────────────────────────────────────────────────────
  disable: (cfg) => {
    return setWeComAccountMulti(cfg, { enabled: false });
  },
};
