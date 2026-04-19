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

function readFirebasePrivateKey() {
  const value = process.env.FIREBASE_PRIVATE_KEY;
  return typeof value === "string" && value.trim() ? value.replace(/\\n/g, "\n") : undefined;
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

export function isFirebaseAdminConfigured() {
  return hasServiceAccountConfig() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
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

  return initializeApp({
    credential: applicationDefault(),
    ...(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : {}),
  });
}

export async function verifyFirebaseIdToken(idToken: string) {
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
