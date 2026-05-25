// =============================================================
// Firebase Admin SDK — Server-side Firebase Admin Initialization
// =============================================================
// Uses the service account JSON to authenticate server-side
// operations (Firestore, Auth, FCM, etc.).
//
// The service account file path is read from:
//   FIREBASE_SERVICE_ACCOUNT_PATH env var
//
// If the env var is not set, it defaults to looking for:
//   for-commissions-firebase-adminsdk-fbsvc-*.json in project root
// =============================================================

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let adminApp: any = null;

/**
 * Lazy-load and return the Firebase Admin app instance.
 * Uses the service account credentials for authentication.
 */
export function getAdminApp() {
  if (adminApp) return adminApp;

  // Only initialize on the server side
  if (typeof window !== 'undefined') {
    throw new Error('Firebase Admin SDK can only be used on the server side.');
  }

  try {
    const firebaseAdmin = require('firebase-admin');

    // If already initialized, return the existing app
    if (firebaseAdmin.apps.length > 0) {
      adminApp = firebaseAdmin.apps[0];
      return adminApp;
    }

    // Resolve service account file
    const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    let serviceAccountPath: string;

    if (envPath) {
      serviceAccountPath = envPath;
    } else {
      // Default: look for the service account JSON in the project root
      const projectRoot = process.cwd();
      const fs = require('fs');
      const files = fs.readdirSync(projectRoot);
      const saFile = files.find(
        (f: string) =>
          f.startsWith('for-commissions-firebase-adminsdk-fbsvc') && f.endsWith('.json')
      );
      if (!saFile) {
        throw new Error(
          'Firebase service account file not found. ' +
          'Set FIREBASE_SERVICE_ACCOUNT_PATH env var or place the ' +
          'service account JSON in the project root.'
        );
      }
      serviceAccountPath = join(projectRoot, saFile);
    }

    // Read and parse the service account JSON
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

    adminApp = firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    console.log(`[Firebase Admin] ✅ Initialized (project: ${serviceAccount.project_id})`);
  } catch (error) {
    console.error('[Firebase Admin] ❌ Failed to initialize:', error);
    throw error;
  }

  return adminApp;
}

/**
 * Get a Firestore instance via the Admin SDK.
 */
export function getAdminFirestore() {
  const app = getAdminApp();
  return app.firestore();
}

/**
 * Get an Auth instance via the Admin SDK.
 */
export function getAdminAuth() {
  const app = getAdminApp();
  return app.auth();
}

/**
 * Generate an OAuth2 access token from the service account
 * for use with Firestore REST API calls.
 * This is more secure than using an API key.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { GoogleAuth } = require('google-auth-library');
    const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectRoot = process.cwd();

    let serviceAccountPath: string;
    if (envPath) {
      serviceAccountPath = envPath;
    } else {
      const fs = require('fs');
      const files = fs.readdirSync(projectRoot);
      const saFile = files.find(
        (f: string) =>
          f.startsWith('for-commissions-firebase-adminsdk-fbsvc') && f.endsWith('.json')
      );
      if (!saFile) return null;
      serviceAccountPath = join(projectRoot, saFile);
    }

    const auth = new GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token?.token || null;
  } catch (error) {
    console.error('[Firebase Admin] ❌ Failed to get access token:', error);
    return null;
  }
}

// Re-export firebase-admin for convenience
import admin from 'firebase-admin';
export { admin };
export default admin;
