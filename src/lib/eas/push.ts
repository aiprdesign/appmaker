import type { ServiceAccountKey } from "../android-push";
import { EasError } from "./errors";
import { graphql } from "./server";

/**
 * Gives Expo the Firebase key it uses to deliver Android push notifications
 * (FCM V1), for one app's package: the same steps as `eas credentials`
 * (Android → Google Service Account → push notifications), without a person
 * at the keyboard. The key goes to Expo only; Appmaker doesn't keep it.
 */
export async function setAndroidPushKey(token: string, projectId: string, packageName: string, key: ServiceAccountKey): Promise<void> {
  const app = await graphql<{
    app: { byId: { id: string; ownerAccount: { id: string }; androidAppCredentials: { id: string }[] } | null };
  }>(
    token,
    `query AppmakerAndroidCredentials($appId: String!, $applicationIdentifier: String) {
      app { byId(appId: $appId) { id ownerAccount { id } androidAppCredentials(filter: { applicationIdentifier: $applicationIdentifier }) { id } } }
    }`,
    { appId: projectId, applicationIdentifier: packageName },
  ).then((d) => d.app.byId);
  if (!app) throw new EasError("Expo can't find this app's project. Build it once with Expo, then try again.", 404);

  const created = await graphql<{ googleServiceAccountKey: { createGoogleServiceAccountKey: { id: string } } }>(
    token,
    `mutation AppmakerCreateGoogleServiceAccountKey($input: GoogleServiceAccountKeyInput!, $accountId: ID!) {
      googleServiceAccountKey { createGoogleServiceAccountKey(googleServiceAccountKeyInput: $input, accountId: $accountId) { id } }
    }`,
    { input: { jsonKey: key }, accountId: app.ownerAccount.id },
  );
  const keyId = created.googleServiceAccountKey.createGoogleServiceAccountKey.id;

  let credentialsId = app.androidAppCredentials[0]?.id;
  if (!credentialsId) {
    const made = await graphql<{ androidAppCredentials: { createAndroidAppCredentials: { id: string } } }>(
      token,
      `mutation AppmakerCreateAndroidAppCredentials($input: AndroidAppCredentialsInput!, $appId: ID!, $applicationIdentifier: String!) {
        androidAppCredentials { createAndroidAppCredentials(androidAppCredentialsInput: $input, appId: $appId, applicationIdentifier: $applicationIdentifier) { id } }
      }`,
      { input: {}, appId: app.id, applicationIdentifier: packageName },
    );
    credentialsId = made.androidAppCredentials.createAndroidAppCredentials.id;
  }

  await graphql(
    token,
    `mutation AppmakerSetFcmV1Key($credentialsId: ID!, $keyId: ID!) {
      androidAppCredentials { setGoogleServiceAccountKeyForFcmV1(id: $credentialsId, googleServiceAccountKeyId: $keyId) { id } }
    }`,
    { credentialsId, keyId },
  );
}
