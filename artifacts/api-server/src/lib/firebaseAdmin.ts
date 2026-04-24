import { existsSync, statSync } from "node:fs";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

type FirebaseServiceAccountConfig = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type FirebaseDecodedToken = {
  uid: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
  };
};

type FirebaseLookupUser = {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoUrl?: string;
  providerUserInfo?: Array<{
    providerId?: string;
  }>;
};

function readTrimmedEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFirebasePrivateKey() {
  const value = process.env.FIREBASE_PRIVATE_KEY;
  return typeof value === "string" && value.trim() ? value.replace(/\\n/g, "\n") : undefined;
}

function readFirebaseWebApiKey() {
  return readTrimmedEnv("FIREBASE_WEB_API_KEY")
    ?? readTrimmedEnv("VITE_FIREBASE_API_KEY");
}

function readFirebaseServiceAccountJson(): FirebaseServiceAccountConfig | undefined {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (typeof value !== "string" || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value) as FirebaseServiceAccountConfig;
    const projectId = parsed.projectId ?? parsed.project_id;
    const clientEmail = parsed.clientEmail ?? parsed.client_email;
    const privateKey = parsed.privateKey ?? parsed.private_key;

    return {
      projectId,
      clientEmail,
      privateKey: typeof privateKey === "string"
        ? privateKey.replace(/\\n/g, "\n")
        : undefined,
    };
  } catch {
    return undefined;
  }
}

function hasServiceAccountConfig() {
  const jsonConfig = readFirebaseServiceAccountJson();
  return Boolean(
    (jsonConfig?.projectId && jsonConfig.clientEmail && jsonConfig.privateKey)
      || (process.env.FIREBASE_PROJECT_ID
        && process.env.FIREBASE_CLIENT_EMAIL
        && readFirebasePrivateKey()),
  );
}

function hasReadableGoogleCredentialsFile() {
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (typeof filePath !== "string" || !filePath.trim()) return false;

  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function clearInvalidGoogleCredentialsPath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !hasReadableGoogleCredentialsFile()) {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

export function isFirebaseAdminConfigured() {
  return hasServiceAccountConfig() || hasReadableGoogleCredentialsFile();
}

export function isFirebaseTokenVerificationConfigured() {
  return isFirebaseAdminConfigured() || Boolean(readFirebaseWebApiKey());
}

function getFirebaseAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const jsonConfig = readFirebaseServiceAccountJson();

  if (jsonConfig?.projectId && jsonConfig.clientEmail && jsonConfig.privateKey) {
    return initializeApp({
      credential: cert({
        projectId: jsonConfig.projectId,
        clientEmail: jsonConfig.clientEmail,
        privateKey: jsonConfig.privateKey,
      }),
      projectId: jsonConfig.projectId,
    });
  }

  if (hasServiceAccountConfig()) {
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: readFirebasePrivateKey(),
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }

  clearInvalidGoogleCredentialsPath();

  return initializeApp({
    credential: applicationDefault(),
    ...(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : {}),
  });
}

function decodeFirebaseJwtPayload(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length < 2 || !parts[1]) {
    throw new Error("Firebase ID token is invalid");
  }

  try {
    const normalized = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Partial<FirebaseDecodedToken>;
  } catch {
    throw new Error("Firebase ID token is invalid");
  }
}

function normalizeFirebaseLookupError(code: string) {
  switch (code) {
    case "INVALID_ID_TOKEN":
    case "USER_NOT_FOUND":
      return "Firebase session is invalid. Please sign in again.";
    case "PROJECT_NOT_FOUND":
    case "API_KEY_INVALID":
      return "Firebase verification is not configured on the server yet";
    default:
      return code.replace(/_/g, " ").toLowerCase();
  }
}

async function verifyFirebaseIdTokenWithApiKey(idToken: string): Promise<FirebaseDecodedToken> {
  const apiKey = readFirebaseWebApiKey();
  if (!apiKey) {
    throw new Error("Firebase verification is not configured on the server yet");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  const payload = await response.json().catch(() => ({})) as {
    error?: { message?: string };
    users?: FirebaseLookupUser[];
  };

  if (!response.ok) {
    throw new Error(normalizeFirebaseLookupError(payload.error?.message ?? "Firebase token lookup failed"));
  }

  const lookupUser = Array.isArray(payload.users) ? payload.users[0] : undefined;
  if (!lookupUser?.localId) {
    throw new Error("Firebase session is invalid. Please sign in again.");
  }

  const decoded = decodeFirebaseJwtPayload(idToken);
  const providerFromLookup = Array.isArray(lookupUser.providerUserInfo)
    ? lookupUser.providerUserInfo
      .map((provider) => provider.providerId)
      .find((provider): provider is string => typeof provider === "string" && provider.trim().length > 0)
    : undefined;
  const uid = typeof decoded.sub === "string" && decoded.sub.trim()
    ? decoded.sub.trim()
    : lookupUser.localId;

  return {
    ...decoded,
    uid,
    sub: uid,
    email: typeof decoded.email === "string" && decoded.email.trim()
      ? decoded.email.trim()
      : lookupUser.email,
    email_verified: typeof decoded.email_verified === "boolean"
      ? decoded.email_verified
      : lookupUser.emailVerified === true,
    name: typeof decoded.name === "string" && decoded.name.trim()
      ? decoded.name.trim()
      : lookupUser.displayName,
    picture: typeof decoded.picture === "string" && decoded.picture.trim()
      ? decoded.picture.trim()
      : lookupUser.photoUrl,
    firebase: {
      sign_in_provider:
        typeof decoded.firebase?.sign_in_provider === "string" && decoded.firebase.sign_in_provider.trim()
          ? decoded.firebase.sign_in_provider.trim()
          : providerFromLookup,
    },
  };
}

export async function verifyFirebaseIdToken(idToken: string) {
  if (!isFirebaseAdminConfigured()) {
    return verifyFirebaseIdTokenWithApiKey(idToken);
  }
  const auth = getAuth(getFirebaseAdminApp());
  return auth.verifyIdToken(idToken);
}

export async function createFirebaseEmailUser({
  email,
  password,
  fullName,
}: {
  email: string;
  password: string;
  fullName: string;
}) {
  const auth = getAuth(getFirebaseAdminApp());
  return auth.createUser({
    email,
    password,
    displayName: fullName,
    emailVerified: false,
  });
}

export async function deleteFirebaseUser(uid: string) {
  const auth = getAuth(getFirebaseAdminApp());
  await auth.deleteUser(uid);
}

export async function deleteFirebaseUserByEmail(email: string) {
  const auth = getAuth(getFirebaseAdminApp());
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.deleteUser(existing.uid);
    return true;
  } catch {
    return false;
  }
}

export async function generateFirebasePasswordResetLink(email: string) {
  const auth = getAuth(getFirebaseAdminApp());
  return auth.generatePasswordResetLink(email);
}

export async function ensureFirebaseEmailUser({
  email,
  password,
  fullName,
}: {
  email: string;
  password: string;
  fullName: string;
}) {
  const auth = getAuth(getFirebaseAdminApp());
  try {
    const existing = await auth.getUserByEmail(email);
    return auth.updateUser(existing.uid, {
      password,
      displayName: fullName,
    });
  } catch {
    return auth.createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: false,
    });
  }
}
