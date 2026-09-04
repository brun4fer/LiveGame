import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const run = promisify(execFile);

async function curlRequest(method: "PUT" | "DELETE", url: string) {
  try {
    const args = ["--silent", "--show-error", "--request", method];
    if (method === "PUT") args.push("--data-binary", "r2-healthcheck");
    args.push("--write-out", "\n%{http_code}", url);
    const { stdout } = await run("curl.exe", args);
    const split = stdout.lastIndexOf("\n");
    const body = split >= 0 ? stdout.slice(0, split) : "";
    const status = Number(split >= 0 ? stdout.slice(split + 1) : stdout);
    if (status < 200 || status >= 300) {
      const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
      const message = body.match(/<Message>([^<]+)<\/Message>/)?.[1];
      throw new Error(`Cloudflare R2 returned ${status}${code ? ` ${code}` : ""}${message ? `: ${message}` : ""}.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cloudflare R2 returned")) throw error;
    throw new Error("The Windows HTTP client could not connect to Cloudflare R2.");
  }
}

async function checkCors(url: string, origin: string) {
  const { stdout } = await run("curl.exe", [
    "--silent", "--show-error", "--request", "OPTIONS",
    "--header", `Origin: ${origin}`,
    "--header", "Access-Control-Request-Method: PUT",
    "--header", "Access-Control-Request-Headers: content-type",
    "--dump-header", "-", "--output", "NUL", url,
  ]);
  const allowedOrigin = stdout.match(/^access-control-allow-origin:\s*(.+)$/im)?.[1]?.trim();
  const allowedMethods = stdout.match(/^access-control-allow-methods:\s*(.+)$/im)?.[1]?.trim() || "";
  if (allowedOrigin !== origin || !allowedMethods.toUpperCase().includes("PUT")) {
    throw new Error(`Cloudflare R2 CORS does not allow ${origin} to upload video.`);
  }
  console.log(`R2 CORS allows uploads from ${origin}.`);
}

async function main() {
  const { abortMultipartUpload, createMultipartUpload, createObjectDeleteUrl, createObjectUploadUrl } = await import("../src/lib/r2");
  const key = `healthchecks/${randomUUID()}`;
  const objectUploadUrl = createObjectUploadUrl(key);
  await checkCors(objectUploadUrl, "http://localhost:3000");
  let uploadId: string | null = null;
  try {
    uploadId = await createMultipartUpload(key, "application/octet-stream");
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause as { code?: string } | undefined : undefined;
    if (cause?.code !== "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || process.platform !== "win32") throw error;
    await curlRequest("PUT", objectUploadUrl);
    await curlRequest("DELETE", createObjectDeleteUrl(key));
    console.log("R2 signed upload/delete passed using the Windows certificate store.");
    return;
  } finally {
    if (uploadId) await abortMultipartUpload(key, uploadId);
  }
  console.log("R2 multipart create/abort passed.");
}

main().catch((error) => {
  const cause = error instanceof Error && "cause" in error ? error.cause as { code?: string; message?: string } | undefined : undefined;
  console.error([error instanceof Error ? error.message : String(error), cause?.code, cause?.message].filter(Boolean).join(" · "));
  process.exitCode = 1;
});
