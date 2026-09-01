import { createHash, createHmac } from "node:crypto";

const REGION = "auto";
const SERVICE = "s3";

type QueryEntry = [string, string];
type CompletedPart = { partNumber: number; etag: string; size?: number };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Configure the shared Cloudflare R2 credentials.`);
  return value;
}

function config() {
  const endpoint = required("MEDIA_R2_ENDPOINT").replace(/\/+$/, "");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:") throw new Error("MEDIA_R2_ENDPOINT must use HTTPS.");
  return {
    endpoint,
    bucket: required("MEDIA_R2_BUCKET_NAME"),
    accessKeyId: required("MEDIA_R2_ACCESS_KEY_ID"),
    secretAccessKey: required("MEDIA_R2_SECRET_ACCESS_KEY"),
  };
}

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function objectPath(bucket: string, key: string) {
  return `/${encode(bucket)}/${key.split("/").map(encode).join("/")}`;
}

function canonicalQuery(entries: QueryEntry[]) {
  return entries.map(([key, value]) => [encode(key), encode(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      if (aValue !== bValue) return aValue < bValue ? -1 : 1;
      return 0;
    })
    .map(([key, value]) => `${key}=${value}`).join("&");
}

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret: string, date: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function timestamps(now = new Date()) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, date: amzDate.slice(0, 8) };
}

function signature(method: string, path: string, query: QueryEntry[], headers: Record<string, string>, payloadHash: string, amzDate: string, date: string, secret: string) {
  const normalized = Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const).sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = normalized.map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = normalized.map(([name]) => name).join(";");
  const canonicalRequest = [method, path, canonicalQuery(query), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonicalRequest)].join("\n");
  return { signedHeaders, scope, value: createHmac("sha256", signingKey(secret, date)).update(stringToSign).digest("hex") };
}

async function signedRequest(method: string, key: string, query: QueryEntry[] = [], body = "", extraHeaders: Record<string, string> = {}) {
  const settings = config();
  const path = objectPath(settings.bucket, key);
  const { amzDate, date } = timestamps();
  const payloadHash = hash(body);
  const host = new URL(settings.endpoint).host;
  const signingHeaders = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...extraHeaders };
  const signed = signature(method, path, query, signingHeaders, payloadHash, amzDate, date, settings.secretAccessKey);
  const headers = new Headers(extraHeaders);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("x-amz-date", amzDate);
  headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${settings.accessKeyId}/${signed.scope}, SignedHeaders=${signed.signedHeaders}, Signature=${signed.value}`);
  const response = await fetch(`${settings.endpoint}${path}${query.length ? `?${canonicalQuery(query)}` : ""}`, { method, headers, body: body || undefined, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.text();
    const message = xmlValue(payload, "Message") || payload.slice(0, 300) || response.statusText;
    throw new Error(`Shared Cloudflare R2 returned ${response.status}: ${message}`);
  }
  return response;
}

function presignedUrl(method: string, key: string, query: QueryEntry[], expiresSeconds: number) {
  const settings = config();
  const path = objectPath(settings.bucket, key);
  const host = new URL(settings.endpoint).host;
  const { amzDate, date } = timestamps();
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const signedQuery: QueryEntry[] = [
    ...query,
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${settings.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const signed = signature(method, path, signedQuery, { host }, "UNSIGNED-PAYLOAD", amzDate, date, settings.secretAccessKey);
  signedQuery.push(["X-Amz-Signature", signed.value]);
  return `${settings.endpoint}${path}?${canonicalQuery(signedQuery)}`;
}

function xmlValue(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))?.[1]?.trim() || null;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function createMediaMultipartUpload(key: string, contentType: string) {
  const response = await signedRequest("POST", key, [["uploads", ""]], "", { "content-type": contentType });
  const uploadId = xmlValue(await response.text(), "UploadId");
  if (!uploadId) throw new Error("Shared Cloudflare R2 did not return a multipart upload ID.");
  return uploadId;
}

export async function listMediaMultipartParts(key: string, uploadId: string) {
  const payload = await (await signedRequest("GET", key, [["uploadId", uploadId]])).text();
  return [...payload.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((match) => ({
    partNumber: Number(xmlValue(match[1], "PartNumber")),
    etag: xmlValue(match[1], "ETag") || "",
    size: Number(xmlValue(match[1], "Size") || 0),
  })).filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag);
}

export function presignMediaMultipartParts(key: string, uploadId: string, partNumbers: number[]) {
  return partNumbers.map((partNumber) => ({
    partNumber,
    url: presignedUrl("PUT", key, [["partNumber", String(partNumber)], ["uploadId", uploadId]], 6 * 60 * 60),
  }));
}

export async function completeMediaMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]) {
  const body = `<CompleteMultipartUpload>${parts.sort((a, b) => a.partNumber - b.partNumber).map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
  const payload = await (await signedRequest("POST", key, [["uploadId", uploadId]], body, { "content-type": "application/xml" })).text();
  return xmlValue(payload, "ETag");
}

export async function abortMediaMultipartUpload(key: string, uploadId: string) {
  await signedRequest("DELETE", key, [["uploadId", uploadId]]);
}

export function createMediaPlaybackUrl(key: string) {
  const lifetime = 12 * 60 * 60;
  return { url: presignedUrl("GET", key, [], lifetime), expiresAt: new Date(Date.now() + lifetime * 1000).toISOString() };
}

export async function headMediaObject(key: string) {
  const response = await signedRequest("HEAD", key);
  return {
    contentLength: Number(response.headers.get("content-length") || 0),
    contentType: response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || null,
    etag: response.headers.get("etag"),
  };
}

