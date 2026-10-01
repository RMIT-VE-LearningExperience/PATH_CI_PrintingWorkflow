import { GoogleAuth } from "google-auth-library";

const PROPERTY_ID = "536345524";
const SERVICE_ACCOUNT = "ga4-analytics-reader@path-ci-printingworkflows.iam.gserviceaccount.com";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/analytics.manage.users"],
});

const client = await auth.getClient();
const tokenResponse = await client.getAccessToken();
const token = tokenResponse.token;

if (!token) {
  console.error("Failed to get access token. Run: gcloud auth application-default login");
  process.exit(1);
}

const res = await fetch(
  `https://analyticsadmin.googleapis.com/v1beta/properties/${PROPERTY_ID}/accessBindings`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: SERVICE_ACCOUNT,
      roles: ["predefinedRoles/viewer"],
    }),
  }
);

const json = await res.json();
if (!res.ok) {
  console.error("Error:", JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log("Success:", JSON.stringify(json, null, 2));
