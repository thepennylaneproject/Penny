/**
 * GitHub App authentication helpers.
 *
 * Generates short-lived installation access tokens using the app's private key
 * so the worker can clone private repositories without needing a PAT.
 *
 * Flow:
 *   1. Sign a JWT with the app private key (RS256, valid 10 min)
 *   2. Look up the installation ID for the repo (GET /repos/:owner/:repo/installation)
 *   3. Exchange it for an installation access token (valid 1 hr)
 *   4. Inject the token into the clone URL as x-access-token
 */

import { createSign, createPrivateKey, type KeyObject } from "node:crypto";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID?.trim();
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY?.trim()
  // Railway stores multiline values with literal \n — normalize them
  ?.replace(/\\n/g, "\n");

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Parse the private key from PEM, handling both PKCS#1 and PKCS#8 formats.
 * Works around OpenSSL 3 / Alpine issues by extracting the DER bytes from
 * the PEM body and passing them explicitly with the correct type flag.
 */
function parsePrivateKey(pem: string): KeyObject {
  // Log diagnostics to help debug Railway env var encoding issues
  const hasRealNewlines = pem.includes("\n");
  const hasLiteralNewlines = pem.includes("\\n");
  const lines = pem.split("\n").map(l => l.trim()).filter(Boolean);
  console.error(
    `[github-app] key: ${pem.length} chars, ${lines.length} lines, ` +
    `real_newlines=${hasRealNewlines}, literal_\\n=${hasLiteralNewlines}, ` +
    `first="${lines[0]?.slice(0, 40)}", last="${lines[lines.length - 1]?.slice(0, 40)}"`
  );

  const body = lines.filter(l => !l.startsWith("-----")).join("");
  console.error(`[github-app] base64 body: ${body.length} chars → ${Math.floor(body.length * 3 / 4)} DER bytes`);

  const der = Buffer.from(body, "base64");
  const isPkcs8 = pem.includes("BEGIN PRIVATE KEY");
  try {
    return createPrivateKey({ key: der, format: "der", type: isPkcs8 ? "pkcs8" : "pkcs1" });
  } catch {
    return createPrivateKey({ key: der, format: "der", type: isPkcs8 ? "pkcs1" : "pkcs8" });
  }
}

/** Create a GitHub App JWT valid for ~9 minutes. */
function createAppJwt(): string {
  if (!GITHUB_APP_ID) throw new Error("GITHUB_APP_ID env var is not set");
  if (!GITHUB_APP_PRIVATE_KEY) throw new Error("GITHUB_APP_PRIVATE_KEY env var is not set");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(
    Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: GITHUB_APP_ID }))
  );
  const data = `${header}.${payload}`;
  // createPrivateKey handles both PKCS#1 and PKCS#8, using DER to bypass PEM formatting issues
  const privateKey = parsePrivateKey(GITHUB_APP_PRIVATE_KEY);
  const sign = createSign("RSA-SHA256");
  sign.update(data);
  const sig = base64url(sign.sign(privateKey));
  return `${data}.${sig}`;
}

/** Look up the GitHub App installation ID for a given repo URL. */
async function getInstallationId(repoUrl: string): Promise<string> {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) throw new Error(`Cannot parse GitHub owner/repo from URL: ${repoUrl}`);
  const [, owner, repo] = match;
  const jwt = createAppJwt();
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "penny-worker",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub App installation lookup failed for ${owner}/${repo} (${res.status}): ${body}`
    );
  }
  const data = (await res.json()) as { id?: number };
  if (!data.id) throw new Error("GitHub App installation response missing id field");
  return String(data.id);
}

/** Exchange a GitHub App JWT for an installation access token. */
async function getInstallationToken(installationId: string): Promise<string> {
  const jwt = createAppJwt();
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "penny-worker",
      },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub App token request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("GitHub App token response missing token field");
  return data.token;
}

/**
 * Build an authenticated HTTPS clone URL using a GitHub App installation token.
 *
 * Automatically looks up the installation ID from the repo URL — no per-project
 * configuration required as long as the app is installed on the repo.
 *
 * Input:  https://github.com/owner/repo  (or .git suffix)
 * Output: https://x-access-token:TOKEN@github.com/owner/repo.git
 */
export async function authenticatedCloneUrl(
  repoUrl: string,
  installationId?: string
): Promise<string> {
  const id = installationId ?? (await getInstallationId(repoUrl));
  const token = await getInstallationToken(id);
  const base = repoUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const url = new URL(base.startsWith("https://") ? base : `https://${base}`);
  url.username = "x-access-token";
  url.password = token;
  if (!url.pathname.endsWith(".git")) url.pathname += ".git";
  return url.toString();
}

/** Returns true if GitHub App credentials are configured. */
export function isGitHubAppConfigured(): boolean {
  return Boolean(GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY);
}
