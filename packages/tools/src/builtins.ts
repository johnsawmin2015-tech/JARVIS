import { lookup } from "node:dns/promises";
import { realpath, readFile, stat } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve, sep } from "node:path";
import { z } from "zod";
import type { Tool } from "./index";

const webOutputSchema = z.object({
  url: z.string().url(),
  status: z.number().int(),
  contentType: z.string(),
  text: z.string(),
  retrievedAt: z.string().datetime(),
});

export const webFetchTool: Tool<{ url: string }, z.infer<typeof webOutputSchema>> = {
  name: "web.fetch",
  description: "Fetch a public HTTPS document without following redirects",
  inputSchema: z.object({ url: z.string().url().max(2_048) }),
  outputSchema: webOutputSchema,
  riskClass: "R0",
  capabilities: ["web.fetch"],
  async execute(context, input) {
    const url = new URL(input.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      throw new Error("Only credential-free HTTPS URLs on the default port are allowed");
    }
    await assertPublicHost(url.hostname);
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(15_000)]),
      headers: { "user-agent": "JARVIS/0.1 (+controlled-research-agent)" },
    });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 2_000_000) throw new Error("Web response exceeds size limit");
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!/^(text\/|application\/(?:json|xml|xhtml\+xml))/.test(contentType)) {
      throw new Error("Web response content type is not supported");
    }
    const text = (await response.text()).slice(0, 2_000_000);
    return {
      url: url.toString(),
      status: response.status,
      contentType,
      text,
      retrievedAt: new Date().toISOString(),
    };
  },
};

export function createFileReadTool(
  rootDirectory: string,
): Tool<{ path: string }, { path: string; content: string; sizeBytes: number }> {
  const configuredRoot = resolve(rootDirectory);
  return {
    name: "file.read",
    description: "Read a UTF-8 text file from the configured project scope",
    inputSchema: z.object({ path: z.string().min(1).max(4_096) }),
    outputSchema: z.object({
      path: z.string(),
      content: z.string(),
      sizeBytes: z.number().int().nonnegative(),
    }),
    riskClass: "R0",
    capabilities: ["filesystem.read"],
    async execute(_context, input) {
      const root = await realpath(configuredRoot);
      const requested = await realpath(resolve(root, input.path));
      if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
        throw new Error("File path escapes the configured scope");
      }
      const metadata = await stat(requested);
      if (!metadata.isFile() || metadata.size > 2_000_000) {
        throw new Error("File is not a supported regular file or exceeds the size limit");
      }
      if (requested.includes("\0")) throw new Error("Invalid file path");
      return {
        path: requested.slice(root.length + 1),
        content: await readFile(requested, "utf8"),
        sizeBytes: metadata.size,
      };
    },
  };
}

const githubOutputSchema = z.object({
  repository: z.string(),
  path: z.string(),
  sha: z.string(),
  content: z.string(),
  retrievedAt: z.string().datetime(),
});

export const githubReadTool: Tool<
  { owner: string; repository: string; path: string; reference?: string | undefined },
  z.infer<typeof githubOutputSchema>
> = {
  name: "github.file.read",
  description: "Read a file from a configured GitHub repository",
  inputSchema: z.object({
    owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    repository: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    path: z.string().min(1).max(4_096),
    reference: z
      .string()
      .regex(/^[A-Za-z0-9_./-]+$/)
      .optional(),
  }),
  outputSchema: githubOutputSchema,
  riskClass: "R0",
  capabilities: ["repo.read"],
  async execute(context, input) {
    if (input.path.split("/").some((segment) => segment === "." || segment === "..")) {
      throw new Error("Repository path traversal is not allowed");
    }
    const token = context.requestSecret("GITHUB_TOKEN", "repo.read");
    const apiUrl = new URL(
      `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(
        input.repository,
      )}/contents/${input.path.split("/").map(encodeURIComponent).join("/")}`,
    );
    if (input.reference) apiUrl.searchParams.set("ref", input.reference);
    const response = await fetch(apiUrl, {
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(15_000)]),
      headers: {
        accept: "application/vnd.github.raw+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub request failed with status ${response.status}`);
    const content = (await response.text()).slice(0, 2_000_000);
    return {
      repository: `${input.owner}/${input.repository}`,
      path: input.path,
      sha: response.headers.get("etag")?.replaceAll('"', "") ?? "unknown",
      content,
      retrievedAt: new Date().toISOString(),
    };
  },
};

async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === "localhost" || hostname.endsWith(".local"))
    throw new Error("Private host denied");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private or unresolved host denied");
  }
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("127.") ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    normalized.startsWith("169.254.") ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(normalized) ||
    /^198\.(1[89])\./.test(normalized) ||
    normalized === "0.0.0.0"
  );
}
