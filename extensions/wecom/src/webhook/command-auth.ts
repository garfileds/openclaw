/**
 * Command Authorization
 *
 * Migrated from the lh version shared/command-auth.ts.
 * Adapted for the new WeComConfig (dmPolicy / allowFrom flattened at top level).
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import type { WeComConfig } from "../utils.js";

// ============================================================================
// Internal utility functions
// ============================================================================

/** Normalize allowlist entry: trim whitespace, lowercase, strip wecom:/user:/userid: prefixes */
function normalizeWecomAllowFromEntry(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^wecom:/, "")
    .replace(/^user:/, "")
    .replace(/^userid:/, "");
}

/** Check if the sender is in the allowlist */
function isWecomSenderAllowed(senderUserId: string, allowFrom: string[]): boolean {
  const list = new Set(
    allowFrom.map((entry) => normalizeWecomAllowFromEntry(entry)).filter(Boolean),
  );
  if (list.has("*")) {
    return true;
  }
  const normalizedSender = normalizeWecomAllowFromEntry(senderUserId);
  if (!normalizedSender) {
    return false;
  }
  return list.has(normalizedSender);
}

// ============================================================================
// Command authorization resolution
// ============================================================================

/** Command authorization result */
export interface WecomCommandAuthResult {
  /** Whether the current message is a command requiring authorization */
  shouldComputeAuth: boolean;
  /** DM policy configured for the account */
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  /** Whether the current sender is in the allowlist */
  senderAllowed: boolean;
  /** Whether an authorizer is configured */
  authorizerConfigured: boolean;
  /** Final authorization result: true=allow, false=deny, undefined=no auth needed */
  commandAuthorized: boolean | undefined;
  /** Effective allowlist */
  effectiveAllowFrom: string[];
}

/**
 * Resolve command authorization status
 *
 * Adapted for the new WeComConfig flattened fields:
 * - dmPolicy → accountConfig.dmPolicy
 * - allowFrom → accountConfig.allowFrom
 */
export async function resolveWecomCommandAuthorization(params: {
  core: PluginRuntime;
  cfg: OpenClawConfig;
  accountConfig: WeComConfig;
  rawBody: string;
  senderUserId: string;
}): Promise<WecomCommandAuthResult> {
  const { core, cfg, accountConfig, rawBody, senderUserId } = params;

  const dmPolicy = accountConfig.dmPolicy ?? "pairing";
  const configAllowFrom = (accountConfig.allowFrom ?? []).map((v) => String(v));

  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, cfg);

  // WeCom channel does not support pairing CLI ("Channel wecom does not support pairing"),
  // so pairing policy is equivalent to allowlist.
  // Policy semantics:
  // - open: commands are allowed for everyone (unless higher-level access-groups deny)
  // - allowlist: commands require allowFrom allowlist
  // - pairing: equivalent to allowlist (since WeCom does not support pairing CLI)
  const effectiveAllowFrom = dmPolicy === "open" ? ["*"] : configAllowFrom;

  const senderAllowed = isWecomSenderAllowed(senderUserId, effectiveAllowFrom);
  const allowAllConfigured = effectiveAllowFrom.some(
    (entry) => normalizeWecomAllowFromEntry(entry) === "*",
  );
  const authorizerConfigured = allowAllConfigured || effectiveAllowFrom.length > 0;
  const useAccessGroups = cfg.commands?.useAccessGroups !== false;

  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [{ configured: authorizerConfigured, allowed: senderAllowed }],
      })
    : undefined;

  return {
    shouldComputeAuth,
    dmPolicy,
    senderAllowed,
    authorizerConfigured,
    commandAuthorized,
    effectiveAllowFrom,
  };
}

// ============================================================================
// Unauthorized command prompt builder
// ============================================================================

/**
 * Build a Chinese prompt for unauthorized commands
 *
 * @param scope - "bot" (smart bot) or "agent" (self-built app)
 */
export function buildWecomUnauthorizedCommandPrompt(params: {
  senderUserId: string;
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  scope: "bot" | "agent";
}): string {
  const user = params.senderUserId || "unknown";
  const policy = params.dmPolicy;
  const scopeLabel = params.scope === "bot" ? "Bot（智能机器人）" : "Agent（自建应用）";
  const dmPrefix = params.scope === "bot" ? "channels.wecom.bot" : "channels.wecom.agent";
  const allowCmd = (value: string): string =>
    `openclaw config set ${dmPrefix}.allowFrom '${value}'`;
  const policyCmd = (value: string): string =>
    `openclaw config set ${dmPrefix}.dmPolicy "${value}"`;

  if (policy === "disabled") {
    return [
      `无权限执行命令（${scopeLabel} 已禁用：dmPolicy=disabled）`,
      `触发者：${user}`,
      `管理员：${policyCmd("open")}（全放开）或 ${policyCmd("allowlist")}（白名单）`,
    ].join("\n");
  }

  return [
    `无权限执行命令（入口：${scopeLabel}，userid：${user}）`,
    `管理员全放开：${policyCmd("open")}`,
    `管理员放行该用户：${policyCmd("allowlist")}`,
    `然后设置白名单：${allowCmd(JSON.stringify([user]))}`,
    `如果仍被拦截：检查 commands.useAccessGroups/访问组`,
  ].join("\n");
}
