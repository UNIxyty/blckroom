import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.js";

export interface Storage {
  /** Signed URL the client PUTs the original capture to. */
  createSignedUploadUrl(path: string): Promise<{ url: string; token: string; path: string }>;
  /** Signed, expiring read URL. */
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  download(path: string): Promise<Buffer>;
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export function createStorage(config: AppConfig): Storage {
  const client: SupabaseClient = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const bucket = () => client.storage.from(config.SUPABASE_STORAGE_BUCKET);

  return {
    async createSignedUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error) throw new Error(`createSignedUploadUrl(${path}): ${error.message}`);
      return { url: data.signedUrl, token: data.token, path: data.path };
    },

    async createSignedUrl(path, expiresInSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds);
      if (error) throw new Error(`createSignedUrl(${path}): ${error.message}`);
      return data.signedUrl;
    },

    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error) throw new Error(`download(${path}): ${error.message}`);
      return Buffer.from(await data.arrayBuffer());
    },

    async upload(path, data, contentType) {
      const { error } = await bucket().upload(path, data, { contentType, upsert: true });
      if (error) throw new Error(`upload(${path}): ${error.message}`);
    },

    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error(`remove: ${error.message}`);
    },
  };
}
