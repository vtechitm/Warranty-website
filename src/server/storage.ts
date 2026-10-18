import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { env } from "./env";

/**
 * Object storage abstraction for user uploads (claim photos).
 * Objects are private: they are only ever served through authorized API routes, never by public URL.
 * Keys are generated server-side (`claims/2026/10/<uuid>.jpg`) and never derived from user input.
 */
export interface ObjectStorage {
  readonly driver: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]{2,5}$/;

export function assertSafeKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes("..") || key.includes("//")) throw new Error(`Invalid storage key: ${key}`);
}

const EXT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/** Local disk (development / single-server). Files live under STORAGE_LOCAL_DIR. */
export class LocalStorage implements ObjectStorage {
  readonly driver = "local" as const;
  constructor(private root: string) {}

  private file(key: string) {
    assertSafeKey(key);
    return path.join(path.resolve(this.root), ...key.split("/"));
  }

  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body, { flag: "wx" }); // never overwrite
  }

  async get(key: string) {
    try {
      const body = await readFile(this.file(key));
      return { body, contentType: EXT_TYPES[key.split(".").pop()!] ?? "application/octet-stream" };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

/** Any S3-compatible service (AWS S3, Cloudflare R2, MinIO, Wasabi, DigitalOcean Spaces, …), SigV4-signed. */
export class S3Storage implements ObjectStorage {
  readonly driver = "s3" as const;
  private client: AwsClient;
  constructor(
    private cfg: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean },
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region, service: "s3" });
  }

  url(key: string) {
    assertSafeKey(key);
    const u = new URL(this.cfg.endpoint);
    if (this.cfg.forcePathStyle) u.pathname = `${u.pathname.replace(/\/+$/, "")}/${this.cfg.bucket}/${key}`;
    else {
      u.hostname = `${this.cfg.bucket}.${u.hostname}`;
      u.pathname = `${u.pathname.replace(/\/+$/, "")}/${key}`;
    }
    return u.toString();
  }

  private async send(method: string, key: string, init: { body?: Buffer; headers?: Record<string, string> } = {}) {
    const req = await this.client.sign(this.url(key), { method, body: init.body ? new Uint8Array(init.body) : undefined, headers: init.headers });
    return this.fetchImpl(req);
  }

  async put(key: string, body: Buffer, contentType: string) {
    const res = await this.send("PUT", key, { body, headers: { "Content-Type": contentType, "Content-Length": String(body.length) } });
    if (!res.ok) throw new Error(`S3 PUT ${key} failed: ${res.status} ${await res.text().catch(() => "")}`.trim());
  }

  async get(key: string) {
    const res = await this.send("GET", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${key} failed: ${res.status}`);
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }

  async delete(key: string) {
    const res = await this.send("DELETE", key);
    if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${key} failed: ${res.status}`);
  }
}

let instance: ObjectStorage | null = null;

export function storage(): ObjectStorage {
  if (instance) return instance;
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    if (!e.S3_ENDPOINT || !e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
    }
    instance = new S3Storage({
      endpoint: e.S3_ENDPOINT, region: e.S3_REGION, bucket: e.S3_BUCKET,
      accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY, forcePathStyle: e.S3_FORCE_PATH_STYLE,
    });
  } else {
    instance = new LocalStorage(e.STORAGE_LOCAL_DIR);
  }
  return instance;
}

/** Test hook: swap the storage backend. */
export function setStorage(s: ObjectStorage | null) {
  instance = s;
}
