# How to Register a HubSpot App for OAuth (Connect HubSpot)

A guide for registering your product as an official HubSpot app so your customers can click **Connect HubSpot** and let your app read and add contacts in their HubSpot accounts.

Example used throughout: **ProPhone CRM**, which syncs contacts with its customers' HubSpot accounts.

---

## 1. Why You Need This

HubSpot does not let any random app read or change a customer's data. The app must be registered with HubSpot first.

Registering gives you two values:

| Value         | What it is                                       | Who can see it   |
| ------------- | ------------------------------------------------ | ---------------- |
| Client ID     | Your app's public name tag with HubSpot.         | Safe to be public |
| Client Secret | Your app's private password with HubSpot.        | **Server only**  |

Never put the Client Secret in frontend code, mobile apps, or Git. Store it in environment variables or a secrets manager.

---

## 2. How the Connect Flow Works

When a customer clicks **Connect HubSpot**:

1. Your app sends them to HubSpot using the **Client ID**.
2. HubSpot shows a screen: *"ProPhone CRM wants to read and edit your contacts. Allow?"*
3. The customer clicks **Connect**.
4. HubSpot sends them back to your app through the **redirect URL**.
5. Your server uses the **Client Secret** to prove it's really your app and gets a key (access token) to that customer's HubSpot.

After that, your app can sync contacts between itself and the customer's HubSpot automatically.

```text
Customer ──▶ Your App ──(Client ID)──▶ HubSpot consent screen
                                              │ Allow
                                              ▼
Your Server ◀──(redirect URL + code)── HubSpot
     │
     └──(Client ID + Client Secret + code)──▶ HubSpot ──▶ access token
```

---

## 3. What You Need

* A HubSpot developer account.
* Node.js installed (for the HubSpot CLI).
* The redirect URL your app will use (for example `https://app.example.com/integrations/hubspot/callback`).
* The list of permissions (scopes) your app needs.

---

## 4. Why It Uses the CLI

HubSpot removed the simple **Create app** button. Apps are now created with the **HubSpot CLI** and a config file named `app-hsmeta.json`.

That config file is where the app's settings live:

* App name
* Redirect URL(s)
* Permissions (scopes)

Any future change means editing that file and uploading the project again.

---

## 5. Install and Connect the CLI

```bash
npm install -g @hubspot/cli
hs init
```

`hs init` opens HubSpot in the browser so you can create a personal access key and link the CLI to your developer account.

---

## 6. Create the Project

```bash
hs project create
```

Choose the option to create an **app** when prompted. This creates a project folder that contains `app-hsmeta.json`.

---

## 7. Edit `app-hsmeta.json`

Set the app name, redirect URL, and scopes. Example for contact read/write:

```json
{
  "uid": "prophone_crm_app",
  "type": "app",
  "config": {
    "name": "ProPhone CRM",
    "distribution": "marketplace",
    "auth": {
      "type": "oauth",
      "redirectUrls": [
        "https://app.example.com/integrations/hubspot/callback"
      ],
      "requiredScopes": [
        "oauth",
        "crm.objects.contacts.read",
        "crm.objects.contacts.write"
      ],
      "optionalScopes": []
    }
  }
}
```

Notes:

* The redirect URL must match **exactly** what your code sends later (protocol, domain, path).
* Only request the scopes you actually need. Customers see them on the consent screen.
* Add a local URL (for example `http://localhost:3000/...`) only if you need it for development.

---

## 8. Upload the Project

```bash
hs project upload
```

Run this again every time you change `app-hsmeta.json`.

---

## 9. Get the Client ID and Client Secret

1. Open your HubSpot developer account.
2. Go to the project you uploaded and open the app.
3. Open the **Auth** tab.
4. Copy the **Client ID** and **Client Secret**.

Store them as environment variables on the server, for example:

```bash
HUBSPOT_CLIENT_ID=your-client-id
HUBSPOT_CLIENT_SECRET=your-client-secret
HUBSPOT_REDIRECT_URI=https://app.example.com/integrations/hubspot/callback
```

Never commit these values.

---

## 10. Next Step: Make the Connect Button Work

This part is done in the app's code (for ProPhone, handled by the backend developer).

**1. Send the customer to HubSpot:**

```text
https://app.hubspot.com/oauth/authorize
  ?client_id=HUBSPOT_CLIENT_ID
  &redirect_uri=HUBSPOT_REDIRECT_URI
  &scope=oauth%20crm.objects.contacts.read%20crm.objects.contacts.write
  &state=RANDOM_VALUE
```

Use a random `state` value and check it on return to protect against forged requests.

**2. Handle the redirect:** HubSpot returns to your redirect URL with `?code=...&state=...`.

**3. Exchange the code for tokens (server side):**

```text
POST https://api.hubapi.com/oauth/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=HUBSPOT_CLIENT_ID
&client_secret=HUBSPOT_CLIENT_SECRET
&redirect_uri=HUBSPOT_REDIRECT_URI
&code=CODE_FROM_REDIRECT
```

The response includes an `access_token` (short-lived) and a `refresh_token`. Store them securely per customer.

**4. Refresh when the access token expires:** call the same endpoint with `grant_type=refresh_token` and the stored `refresh_token`.

---

## 11. Common Problems

| Problem                               | Fix                                                                |
| ------------------------------------- | ------------------------------------------------------------------ |
| `redirect_uri` mismatch error         | Make the URL in code match `app-hsmeta.json` exactly, then re-upload. |
| Scope error on the consent screen     | The `scope` in the URL must match the scopes in `app-hsmeta.json`.  |
| Changes not showing in HubSpot        | Run `hs project upload` again.                                      |
| CLI not linked to the right account   | Run `hs init` again or check `hs accounts list`.                    |

---

## 12. Summary

* Registering the app gives you a **Client ID** (public) and **Client Secret** (server only).
* The app's settings live in `app-hsmeta.json`; edit it and run `hs project upload` to change them.
* Customers click **Connect HubSpot**, approve access, and your server exchanges the code for tokens.
* With those tokens, your app can sync contacts with the customer's HubSpot automatically.
