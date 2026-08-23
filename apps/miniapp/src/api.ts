import { getInitData } from "./telegram.js";

export interface Me {
  id: string;
  role: "pending" | "barber" | "owner" | "superadmin";
  status: "pending" | "active" | "suspended";
  first_name: string | null;
  username?: string | null;
  shop_id?: string | null;
}

let token: string | null = null;

async function authenticate(): Promise<void> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: getInitData() }),
  });
  if (!res.ok) throw new Error(`auth failed (${res.status})`);
  const data = await res.json();
  token = data.token;
}

/**
 * Fetch wrapper: attaches the session JWT, re-authenticates once on 401
 * (the JWT lives 15 minutes; initData is valid for 24h).
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!token) await authenticate();

  const doFetch = () =>
    fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init?.body && !(init.body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
      },
    });

  let res = await doFetch();
  if (res.status === 401) {
    await authenticate();
    res = await doFetch();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getMe(): Promise<Me> {
  return api<Me>("/api/me");
}
