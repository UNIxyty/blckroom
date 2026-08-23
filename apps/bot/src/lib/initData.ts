import { createHmac, timingSafeEqual } from "node:crypto";

export interface InitDataUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface ValidatedInitData {
  user: InitDataUser;
  authDate: Date;
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Validate Telegram Mini App initData per the documented algorithm:
 * secret_key = HMAC_SHA256(bot_token, key="WebAppData"),
 * hash = hex(HMAC_SHA256(data_check_string, secret_key)).
 * Rejects bad hashes and auth_date older than 24h. The user identity comes
 * exclusively from here — never from a request body.
 */
export function validateInitData(
  initData: string,
  botToken: string,
): ValidatedInitData | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw || !/^\d+$/.test(authDateRaw)) return null;
  const authDate = new Date(Number(authDateRaw) * 1000);
  if (Date.now() - authDate.getTime() > MAX_AGE_MS) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  let user: InitDataUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }
  if (typeof user.id !== "number") return null;

  return { user, authDate };
}
