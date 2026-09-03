# How to Connect Fastmail to a Custom Domain

A simple guide for connecting a domain you own to Fastmail, for domains managed by GoDaddy, Dynadot, Hostinger, Cloudflare, Namecheap, or any other provider.

This guide only changes **email-related** DNS records. Do not touch your website's existing A, CNAME, or other unrelated records.

---

## 1. What You Need

* A domain you own.
* Access to the domain's DNS settings.
* A Fastmail account that supports custom domains.

You do not need to transfer or move your domain. It can stay with your current registrar.

---

## 2. Add the Domain to Fastmail

1. Sign in to Fastmail.
2. Go to **Settings → Domains**.
3. Click **Add or buy domain**.
4. Choose **I already own this domain** and enter your domain name.
5. Fastmail will show the DNS records you need to add.

Keep this page open — you'll copy values from it in the next steps.

---

## 3. Open DNS Settings

Go to your domain's DNS management page. It may be called **DNS**, **DNS Management**, **DNS Zone**, or **Advanced DNS**.

Make sure you edit DNS at the provider that is actually authoritative for the domain. For example, if the domain was bought at GoDaddy but its nameservers point to Cloudflare, make changes in Cloudflare.

---

## 4. Add MX Records

**MX (Mail Exchange)** records tell the internet which servers handle email for your domain.

1. Copy the MX records shown in Fastmail (host, priority, value).
2. Add them to your DNS provider exactly as shown.
3. Remove any old MX records pointing to a different mail provider.

| Type | Host | Priority      | Value         |
| ---- | ---- | ------------- | ------------- |
| MX   | @    | From Fastmail | From Fastmail |

Do not guess these values — always copy them from your Fastmail domain setup page.

---

## 5. Add SPF

**SPF (Sender Policy Framework)** is a TXT record that lists which servers may send email for your domain.

1. Copy the SPF value shown in Fastmail.
2. Check if a TXT record starting with `v=spf1` already exists.
   * If yes, merge Fastmail's part into it — do not add a second one.
   * If no, add it as a new TXT record.

A domain should only ever have **one** SPF record.

---

## 6. Add DKIM

**DKIM (DomainKeys Identified Mail)** signs your outgoing mail so receivers can verify it really came from your domain.

1. Copy the DKIM records shown in Fastmail (usually CNAME records).
2. Add each one exactly as shown — host/name and value must match exactly.

---

## 7. Add DMARC

**DMARC** tells receiving servers what to do with mail that fails SPF/DKIM, and where to send reports.

1. Copy the DMARC TXT record Fastmail recommends (usually on `_dmarc`).
2. Add it to your DNS provider.

| Policy         | Effect                        |
| -------------- | ----------------------------- |
| `p=none`       | Monitor only, safest to start |
| `p=quarantine` | Failing mail goes to spam     |
| `p=reject`     | Failing mail is blocked       |

Start with `p=none` if unsure, then tighten later.

---

## 8. Verify the Domain

1. Go back to Fastmail's domain setup page.
2. Click **Verify** / **Recheck DNS**.
3. Fastmail checks MX, SPF, and DKIM and shows a checkmark when each passes.
4. If something fails, compare your DNS records to Fastmail's values again — check for typos.

---

## 9. Test Email

1. **Incoming:** send a test email from another provider (e.g. Gmail) to your Fastmail address.
2. **Outgoing:** send a test email from Fastmail to an external address and confirm it isn't marked as spam.

---

## 10. Important DNS Rules

* Copy values directly from Fastmail — don't guess or reuse values from another domain.
* Remove conflicting old MX records before adding new ones.
* Keep only one SPF record per domain.
* Don't change unrelated website DNS records.
* DNS propagation can take from a few minutes up to 24–48 hours.

---

## 11. Common DNS Provider Locations

| Provider   | Where to find DNS settings                      |
| ---------- | ------------------------------------------------ |
| GoDaddy    | My Products → Domain → DNS → Manage DNS Records |
| Namecheap  | Domain List → Manage → Advanced DNS             |
| Cloudflare | Select domain → DNS → Records                   |
| Hostinger  | Domains → Manage → DNS / Name Servers           |
| Dynadot    | My Domains → select domain → DNS settings       |

If you can't find it, search the dashboard for "DNS" or "Advanced DNS".

---

## 12. Final Checklist

- [ ] Domain added to Fastmail
- [ ] MX configured
- [ ] SPF configured
- [ ] DKIM configured
- [ ] DMARC reviewed
- [ ] Domain verified
- [ ] Incoming email tested
- [ ] Outgoing email tested
