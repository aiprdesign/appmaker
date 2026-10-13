/**
 * Android push notifications: Google only delivers them to apps registered in
 * Firebase. The owner makes a free Firebase project and gives Appmaker two files:
 *  - google-services.json: goes into the app (it isn't secret: it ships inside every Android app);
 *  - a service account key: sent straight to Expo, which uses it to deliver the
 *    notifications. Appmaker never stores it.
 */

export class AndroidPushError extends Error {}

export const GOOGLE_SERVICES_FILE = "google-services.json";

/** Android package names can't have dashes (app.json turns them into underscores). */
export const androidPackage = (bundleId: string) => bundleId.replace(/-/g, "_");

interface GoogleServices {
  project_info?: { project_id?: string; project_number?: string };
  client?: { client_info?: { android_client_info?: { package_name?: string } } }[];
}

/** Checks google-services.json is a real Firebase file for this app's package; returns it tidied. */
export function parseGoogleServices(text: string, packageName: string): { json: string; firebaseProject: string } {
  let data: GoogleServices;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AndroidPushError("That isn't google-services.json: it should be a JSON file downloaded from Firebase.");
  }
  if (text.length > 100_000) throw new AndroidPushError("That file is too large to be google-services.json.");
  const project = data.project_info?.project_id;
  const packages = (data.client ?? []).map((c) => c.client_info?.android_client_info?.package_name).filter((p): p is string => !!p);
  if (!project || !packages.length) throw new AndroidPushError("That isn't google-services.json: download it from Firebase → Project settings → Your apps → Android app.");
  if (!packages.includes(packageName)) {
    throw new AndroidPushError(
      `This google-services.json is for ${packages.join(", ")}, but the app's package is ${packageName}. In Firebase, add an Android app with the package ${packageName} and download its file.`,
    );
  }
  return { json: JSON.stringify(data, null, 2), firebaseProject: project };
}

export interface ServiceAccountKey {
  type: "service_account";
  project_id: string;
  private_key: string;
  client_email: string;
  [field: string]: unknown;
}

/** Checks a Firebase service account key (the private key Expo needs to send notifications). */
export function parseServiceAccount(text: string, firebaseProject?: string): ServiceAccountKey {
  let data: Partial<ServiceAccountKey>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AndroidPushError("That isn't a service account key: it should be the JSON file from Firebase → Project settings → Service accounts → Generate new private key.");
  }
  if (data.type !== "service_account" || !data.private_key?.includes("PRIVATE KEY") || !data.client_email || !data.project_id) {
    throw new AndroidPushError("That isn't a service account key: generate one in Firebase → Project settings → Service accounts → Generate new private key.");
  }
  if (firebaseProject && data.project_id !== firebaseProject) {
    throw new AndroidPushError(`This key is for the Firebase project "${data.project_id}", but google-services.json is for "${firebaseProject}". Use files from the same Firebase project.`);
  }
  return data as ServiceAccountKey;
}

/** Whether the app sends notifications (so Android needs this set up). */
export const usesNotifications = (files: Record<string, string>) => Object.values(files).some((code) => /['"]expo-notifications['"]/.test(code));
