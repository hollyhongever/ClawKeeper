// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { execFileSync } = require("child_process");

const UNSAFE_HOME_PATHS = new Set(["/tmp", "/var/tmp", "/dev/shm", "/"]);
const CRED_STORE_KEY_ENV = "NEMOCLAW_CRED_STORE_KEY";

const CRED_ENVELOPE_FORMAT = "nemoclaw.credentials.v1";
const CRED_ENVELOPE_VERSION = 1;
const CRED_ENCRYPTION = "aes-256-gcm";
const CRED_KDF_NAME = "scrypt";
const CRED_SCRYPT_N = 16384;
const CRED_SCRYPT_R = 8;
const CRED_SCRYPT_P = 1;
const CRED_SCRYPT_KEYLEN = 32;
const CRED_SCRYPT_MAXMEM = 128 * 1024 * 1024;
const CRED_SALT_BYTES = 16;
const CRED_IV_BYTES = 12;

let _credsDir = null;
let _credsFile = null;
let _warnedMissingStoreKey = false;

function credentialStoreError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normalizeCredentialStoreKey(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r/g, "").replace(/\n/g, "");
}

function getCredentialStoreKeyFromEnv() {
  return normalizeCredentialStoreKey(process.env[CRED_STORE_KEY_ENV] || "");
}

function resolveHomeDir() {
  const raw = process.env.HOME || os.homedir();
  if (!raw) {
    throw new Error(
      "Cannot determine safe home directory for credential storage. " +
        "Set the HOME environment variable to a user-owned directory.",
    );
  }
  const home = path.resolve(raw);
  try {
    const real = fs.realpathSync(home);
    if (UNSAFE_HOME_PATHS.has(real)) {
      throw new Error(
        "Cannot store credentials: HOME resolves to '" +
          real +
          "' which is world-readable. " +
          "Set the HOME environment variable to a user-owned directory.",
      );
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (UNSAFE_HOME_PATHS.has(home)) {
    throw new Error(
      "Cannot store credentials: HOME resolves to '" +
        home +
        "' which is world-readable. " +
        "Set the HOME environment variable to a user-owned directory.",
    );
  }
  return home;
}

function getCredsDir() {
  if (!_credsDir) _credsDir = path.join(resolveHomeDir(), ".nemoclaw");
  return _credsDir;
}

function getCredsFile() {
  if (!_credsFile) _credsFile = path.join(getCredsDir(), "credentials.json");
  return _credsFile;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isEncryptedEnvelope(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.format !== CRED_ENVELOPE_FORMAT) return false;
  if (payload.encryption !== CRED_ENCRYPTION) return false;
  if (!isPlainObject(payload.kdf)) return false;
  if (payload.kdf.name !== CRED_KDF_NAME) return false;
  if (!isPlainObject(payload.cipher)) return false;
  return typeof payload.ciphertext === "string";
}

function normalizeCredentialValue(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r/g, "").trim();
}

function normalizeCredentialMap(raw) {
  if (!isPlainObject(raw)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[String(key)] = normalizeCredentialValue(value);
  }
  return normalized;
}

function deriveStoreKey(password, saltB64, kdf = {}) {
  const salt = Buffer.from(String(saltB64 || ""), "base64");
  if (salt.length === 0) {
    throw credentialStoreError("Credential store metadata is invalid (missing salt).", "CREDENTIAL_STORE_INVALID");
  }
  const N = Number.parseInt(kdf.N, 10) || CRED_SCRYPT_N;
  const r = Number.parseInt(kdf.r, 10) || CRED_SCRYPT_R;
  const p = Number.parseInt(kdf.p, 10) || CRED_SCRYPT_P;
  return crypto.scryptSync(password, salt, CRED_SCRYPT_KEYLEN, {
    N,
    r,
    p,
    maxmem: CRED_SCRYPT_MAXMEM,
  });
}

function encryptCredentialMap(credentials, password) {
  const normalized = normalizeCredentialMap(credentials);
  const salt = crypto.randomBytes(CRED_SALT_BYTES);
  const iv = crypto.randomBytes(CRED_IV_BYTES);
  const key = crypto.scryptSync(password, salt, CRED_SCRYPT_KEYLEN, {
    N: CRED_SCRYPT_N,
    r: CRED_SCRYPT_R,
    p: CRED_SCRYPT_P,
    maxmem: CRED_SCRYPT_MAXMEM,
  });

  const cipher = crypto.createCipheriv(CRED_ENCRYPTION, key, iv);
  const plaintext = Buffer.from(JSON.stringify(normalized), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    format: CRED_ENVELOPE_FORMAT,
    version: CRED_ENVELOPE_VERSION,
    encryption: CRED_ENCRYPTION,
    credentialCount: Object.keys(normalized).length,
    kdf: {
      name: CRED_KDF_NAME,
      N: CRED_SCRYPT_N,
      r: CRED_SCRYPT_R,
      p: CRED_SCRYPT_P,
      salt: salt.toString("base64"),
    },
    cipher: {
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    },
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptCredentialEnvelope(payload, password) {
  if (!password) {
    throw credentialStoreError(
      `Credential store is encrypted. Set ${CRED_STORE_KEY_ENV} or run 'clawkeeper security set-password'.`,
      "CREDENTIAL_STORE_KEY_REQUIRED",
    );
  }
  try {
    const key = deriveStoreKey(password, payload.kdf?.salt, payload.kdf);
    const iv = Buffer.from(String(payload.cipher?.iv || ""), "base64");
    const tag = Buffer.from(String(payload.cipher?.tag || ""), "base64");
    const ciphertext = Buffer.from(String(payload.ciphertext || ""), "base64");
    if (iv.length === 0 || tag.length === 0 || ciphertext.length === 0) {
      throw credentialStoreError(
        "Credential store metadata is invalid (cipher payload missing).",
        "CREDENTIAL_STORE_INVALID",
      );
    }
    const decipher = crypto.createDecipheriv(CRED_ENCRYPTION, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8"));
    return normalizeCredentialMap(parsed);
  } catch (error) {
    if (error && error.code === "CREDENTIAL_STORE_INVALID") {
      throw error;
    }
    throw credentialStoreError(
      `Credential store decryption failed. Check ${CRED_STORE_KEY_ENV} or rotate with 'clawkeeper security set-password'.`,
      "CREDENTIAL_STORE_DECRYPT_FAILED",
    );
  }
}

function parseCredentialStoreFile() {
  const file = getCredsFile();
  if (!fs.existsSync(file)) {
    return {
      exists: false,
      mode: "plaintext",
      credentials: {},
      payload: null,
      malformed: false,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (isEncryptedEnvelope(parsed)) {
      return {
        exists: true,
        mode: "encrypted",
        credentials: null,
        payload: parsed,
        malformed: false,
      };
    }
    if (isPlainObject(parsed)) {
      return {
        exists: true,
        mode: "plaintext",
        credentials: normalizeCredentialMap(parsed),
        payload: parsed,
        malformed: false,
      };
    }
  } catch {
    // Keep backwards-compatible behavior for malformed files: treat as empty.
  }

  return {
    exists: true,
    mode: "plaintext",
    credentials: {},
    payload: null,
    malformed: true,
  };
}

function writeCredentialStorePayload(payload) {
  const dir = getCredsDir();
  const file = getCredsFile();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function loadCredentialStore(opts = {}) {
  const { password = "", migratePlaintext = true } = opts;
  const parsed = parseCredentialStoreFile();
  const envPassword = getCredentialStoreKeyFromEnv();

  if (parsed.mode === "encrypted") {
    const secret = normalizeCredentialStoreKey(password) || envPassword;
    const credentials = decryptCredentialEnvelope(parsed.payload, secret);
    return { mode: "encrypted", credentials, migrated: false, encryptedPayload: parsed.payload };
  }

  const credentials = parsed.credentials || {};
  if (!migratePlaintext) {
    return { mode: "plaintext", credentials, migrated: false, encryptedPayload: null };
  }

  if (envPassword) {
    const envelope = encryptCredentialMap(credentials, envPassword);
    writeCredentialStorePayload(envelope);
    return { mode: "encrypted", credentials, migrated: true, encryptedPayload: envelope };
  }

  return { mode: "plaintext", credentials, migrated: false, encryptedPayload: null };
}

function writeCredentialMap(credentials, opts = {}) {
  const forceEncrypted = opts.forceEncrypted === true;
  const password = normalizeCredentialStoreKey(opts.password || "") || getCredentialStoreKeyFromEnv();
  const payload = normalizeCredentialMap(credentials);
  if (forceEncrypted || password) {
    if (!password) {
      throw credentialStoreError(
        `Credential store is encrypted. Set ${CRED_STORE_KEY_ENV} or run 'clawkeeper security set-password'.`,
        "CREDENTIAL_STORE_KEY_REQUIRED",
      );
    }
    writeCredentialStorePayload(encryptCredentialMap(payload, password));
    return "encrypted";
  }
  writeCredentialStorePayload(payload);
  return "plaintext";
}

function reportCredentialStoreAccessWarning(error) {
  if (!error || _warnedMissingStoreKey) return;
  if (
    error.code === "CREDENTIAL_STORE_KEY_REQUIRED" ||
    error.code === "CREDENTIAL_STORE_DECRYPT_FAILED" ||
    error.code === "CREDENTIAL_STORE_INVALID"
  ) {
    _warnedMissingStoreKey = true;
    console.error(`  ${error.message}`);
  }
}

function loadCredentials() {
  try {
    return loadCredentialStore({ migratePlaintext: true }).credentials;
  } catch (error) {
    if (
      error &&
      (error.code === "CREDENTIAL_STORE_KEY_REQUIRED" ||
        error.code === "CREDENTIAL_STORE_DECRYPT_FAILED" ||
        error.code === "CREDENTIAL_STORE_INVALID")
    ) {
      throw error;
    }
    return {};
  }
}

function saveCredential(key, value) {
  const parsed = parseCredentialStoreFile();
  const store = loadCredentialStore({ migratePlaintext: true });
  const creds = { ...store.credentials };
  creds[key] = normalizeCredentialValue(value);

  const shouldEncrypt = parsed.mode === "encrypted" || store.mode === "encrypted";
  writeCredentialMap(creds, { forceEncrypted: shouldEncrypt });
}

function getCredential(key) {
  if (process.env[key]) return normalizeCredentialValue(process.env[key]);

  try {
    const creds = loadCredentials();
    const value = normalizeCredentialValue(creds[key]);
    return value || null;
  } catch (error) {
    reportCredentialStoreAccessWarning(error);
    return null;
  }
}

function getCredentialStoreStatus() {
  const parsed = parseCredentialStoreFile();
  const envPassword = getCredentialStoreKeyFromEnv();

  if (parsed.mode === "encrypted") {
    let credentialCount = Number.parseInt(parsed.payload?.credentialCount, 10);
    if (!Number.isFinite(credentialCount) || credentialCount < 0) credentialCount = 0;

    if (envPassword) {
      try {
        credentialCount = Object.keys(decryptCredentialEnvelope(parsed.payload, envPassword)).length;
      } catch {
        // Keep envelope metadata count when decryption fails.
      }
    }

    return {
      mode: "encrypted",
      credentialCount,
      passwordEnvDetected: Boolean(envPassword),
      path: getCredsFile(),
    };
  }

  return {
    mode: "plaintext",
    credentialCount: Object.keys(parsed.credentials || {}).length,
    passwordEnvDetected: Boolean(envPassword),
    path: getCredsFile(),
  };
}

function setCredentialStorePassword(nextPassword, opts = {}) {
  const newPassword = normalizeCredentialStoreKey(nextPassword || "");
  if (!newPassword) {
    throw credentialStoreError("Credential-store password cannot be empty.", "CREDENTIAL_STORE_PASSWORD_REQUIRED");
  }

  const parsed = parseCredentialStoreFile();
  let credentials = {};
  let previousMode = "plaintext";

  if (parsed.mode === "encrypted") {
    previousMode = "encrypted";
    const currentPassword =
      normalizeCredentialStoreKey(opts.currentPassword || "") || getCredentialStoreKeyFromEnv();
    credentials = decryptCredentialEnvelope(parsed.payload, currentPassword);
  } else {
    credentials = normalizeCredentialMap(parsed.credentials || {});
  }

  writeCredentialMap(credentials, { forceEncrypted: true, password: newPassword });

  return {
    previousMode,
    mode: "encrypted",
    credentialCount: Object.keys(credentials).length,
    path: getCredsFile(),
  };
}

function promptSecret(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stderr;
    let answer = "";
    let rawModeEnabled = false;
    let finished = false;

    function cleanup() {
      input.removeListener("data", onData);
      if (rawModeEnabled && typeof input.setRawMode === "function") {
        input.setRawMode(false);
      }
      if (typeof input.pause === "function") {
        input.pause();
      }
    }

    function finish(fn, value) {
      if (finished) return;
      finished = true;
      cleanup();
      output.write("\n");
      fn(value);
    }

    function onData(chunk) {
      const text = chunk.toString("utf8");
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];

        if (ch === "\u0003") {
          finish(reject, Object.assign(new Error("Prompt interrupted"), { code: "SIGINT" }));
          return;
        }

        if (ch === "\r" || ch === "\n") {
          finish(resolve, answer.trim());
          return;
        }

        if (ch === "\u0008" || ch === "\u007f") {
          if (answer.length > 0) {
            answer = answer.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }

        if (ch === "\u001b") {
          // Ignore terminal escape/control sequences such as Delete, arrows,
          // Home/End, etc. while leaving the buffered secret untouched.
          const rest = text.slice(i);
          // eslint-disable-next-line no-control-regex
          const match = rest.match(/^\u001b(?:\[[0-9;?]*[~A-Za-z]|\][^\u0007]*\u0007|.)/);
          if (match) {
            i += match[0].length - 1;
          }
          continue;
        }

        if (ch >= " ") {
          answer += ch;
          output.write("*");
        }
      }
    }

    output.write(question);
    input.setEncoding("utf8");
    if (typeof input.resume === "function") {
      input.resume();
    }
    if (typeof input.setRawMode === "function") {
      input.setRawMode(true);
      rawModeEnabled = true;
    }
    input.on("data", onData);
  });
}

function prompt(question, opts = {}) {
  return new Promise((resolve, reject) => {
    const silent = opts.secret === true && process.stdin.isTTY && process.stderr.isTTY;
    if (silent) {
      promptSecret(question)
        .then(resolve)
        .catch((err) => {
          if (err && err.code === "SIGINT") {
            reject(err);
            process.kill(process.pid, "SIGINT");
            return;
          }
          reject(err);
        });
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    let finished = false;
    function finish(fn, value) {
      if (finished) return;
      finished = true;
      rl.close();
      if (!process.stdin.isTTY) {
        if (typeof process.stdin.pause === "function") {
          process.stdin.pause();
        }
        if (typeof process.stdin.unref === "function") {
          process.stdin.unref();
        }
      }
      fn(value);
    }
    rl.on("SIGINT", () => {
      const err = Object.assign(new Error("Prompt interrupted"), { code: "SIGINT" });
      finish(reject, err);
      process.kill(process.pid, "SIGINT");
    });
    rl.question(question, (answer) => {
      finish(resolve, answer.trim());
    });
  });
}

async function ensureApiKey() {
  let key = getCredential("NVIDIA_API_KEY");
  if (key) {
    process.env.NVIDIA_API_KEY = key;
    return;
  }

  console.log("");
  console.log("  ┌─────────────────────────────────────────────────────────────────┐");
  console.log("  │  NVIDIA API Key required                                        │");
  console.log("  │                                                                 │");
  console.log("  │  1. Go to https://build.nvidia.com/settings/api-keys            │");
  console.log("  │  2. Sign in with your NVIDIA account                            │");
  console.log("  │  3. Click 'Generate API Key' button                             │");
  console.log("  │  4. Paste the key below (starts with nvapi-)                    │");
  console.log("  └─────────────────────────────────────────────────────────────────┘");
  console.log("");

  while (true) {
    key = normalizeCredentialValue(await prompt("  NVIDIA API Key: ", { secret: true }));

    if (!key) {
      console.error("  NVIDIA API Key is required.");
      continue;
    }

    if (!key.startsWith("nvapi-")) {
      console.error("  Invalid key. Must start with nvapi-");
      continue;
    }

    break;
  }

  saveCredential("NVIDIA_API_KEY", key);
  process.env.NVIDIA_API_KEY = key;
  console.log("");
  console.log("  Credential saved to ~/.nemoclaw/credentials.json");
  console.log("");
}

function isRepoPrivate(repo) {
  try {
    const json = execFileSync("gh", ["api", `repos/${repo}`, "--jq", ".private"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return json === "true";
  } catch {
    return false;
  }
}

async function ensureGithubToken() {
  let token = getCredential("GITHUB_TOKEN");
  if (token) {
    process.env.GITHUB_TOKEN = token;
    return;
  }

  try {
    token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (token) {
      process.env.GITHUB_TOKEN = token;
      return;
    }
  } catch {
    /* ignored */
  }

  console.log("");
  console.log("  ┌──────────────────────────────────────────────────┐");
  console.log("  │  GitHub token required (private repo detected)   │");
  console.log("  │                                                  │");
  console.log("  │  Option A: gh auth login (if you have gh CLI)    │");
  console.log("  │  Option B: Paste a PAT with read:packages scope  │");
  console.log("  └──────────────────────────────────────────────────┘");
  console.log("");

  token = await prompt("  GitHub Token: ", { secret: true });

  if (!token) {
    console.error("  Token required for deploy (repo is private).");
    process.exit(1);
  }

  saveCredential("GITHUB_TOKEN", token);
  process.env.GITHUB_TOKEN = token;
  console.log("");
  console.log("  Credential saved to ~/.nemoclaw/credentials.json");
  console.log("");
}

const exports_ = {
  loadCredentials,
  normalizeCredentialValue,
  saveCredential,
  getCredential,
  getCredentialStoreStatus,
  setCredentialStorePassword,
  getCredentialStoreKeyFromEnv,
  prompt,
  ensureApiKey,
  ensureGithubToken,
  isRepoPrivate,
  CRED_STORE_KEY_ENV,
};

Object.defineProperty(exports_, "CREDS_DIR", { get: getCredsDir, enumerable: true });
Object.defineProperty(exports_, "CREDS_FILE", { get: getCredsFile, enumerable: true });

module.exports = exports_;
