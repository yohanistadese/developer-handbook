# How to Connect Fastmail to a Custom Domain

A simple guide for connecting a domain to Fastmail for sending and receiving email.

This guide works with domains managed through **GoDaddy, Dynadot, Hostinger, Namecheap, Cloudflare**, or other DNS providers.

> **Important:** This setup only changes email-related DNS records. Do not change your website's existing A, AAAA, CNAME, or other unrelated DNS records.

## Setup Overview

```mermaid
flowchart LR
    A[Add Domain to Fastmail] --> B[Open DNS Management]
    B --> C[Configure Email DNS Records]
    C --> D[Verify Domain]
    D --> E[Test Email]
```

---

## 1. Requirements

Before starting, make sure you have:

* A domain you own
* Access to the domain's DNS management
* A Fastmail account that supports custom domains
* Access to the Fastmail domain setup page

You do not need to transfer your domain to Fastmail. The domain can remain with your current registrar.

---

## 2. Add Your Domain to Fastmail

1. Sign in to **Fastmail**.
2. Open **Settings → Domains**.
3. Select **Add or buy domain**.
4. Choose **I already own this domain**.
5. Enter your domain name.
6. Continue through the setup.

Fastmail will display the DNS records required for your domain.

Keep this page open because you will use these values when configuring your DNS.

---

## 3. Open Your DNS Management

Open the DNS management page for your domain.

The location depends on your provider. It may be called:

* DNS
* DNS Management
* DNS Records
* DNS Zone
* Advanced DNS

Make sure you are editing DNS at the provider that is actually authoritative for your domain.

For example, if your domain was purchased from GoDaddy but its nameservers point to Cloudflare, you must add the DNS records in **Cloudflare**, not GoDaddy.

---

## 4. Configure MX Records

**MX (Mail Exchange)** records tell the internet which mail servers receive email for your domain.

### Steps

1. Find the MX records displayed in Fastmail.
2. Add them to your DNS provider.
3. Use the exact **host, value, and priority** shown by Fastmail.
4. Remove old MX records that point to another email provider.

Your DNS should contain the MX records required by Fastmail and should not contain conflicting MX records from another mail provider.

| Type | Host |      Priority | Value         |
| ---- | ---- | ------------: | ------------- |
| MX   | `@`  | From Fastmail | From Fastmail |
| MX   | `@`  | From Fastmail | From Fastmail |

> **Do not copy MX values from this document.** Always use the current values displayed in your Fastmail account.

---

## 5. Configure SPF

**SPF (Sender Policy Framework)** identifies which servers are authorized to send email for your domain.

Fastmail will provide the SPF value that should be used.

### Steps

1. Find the SPF record provided by Fastmail.
2. Check whether your domain already has an SPF TXT record.
3. If there is no existing SPF record, add the Fastmail record.
4. If an SPF record already exists, update it instead of creating another one.

> **Important:** A domain should have only one SPF record. Multiple SPF records can cause SPF authentication to fail.

If you use other services to send email from your domain, such as a website, CRM, or marketing platform, make sure their SPF requirements are included in the same SPF record.

---

## 6. Configure DKIM

**DKIM (DomainKeys Identified Mail)** authenticates outgoing email using cryptographic signatures.

Fastmail normally provides DKIM records that you need to add to your DNS.

### Steps

1. Copy the DKIM record details from Fastmail.
2. Add each record to your DNS provider.
3. Use the exact **record type, host/name, and value** provided by Fastmail.
4. Do not modify or shorten the values.

DKIM records are commonly provided as **CNAME records**, but always follow what Fastmail currently displays.

---

## 7. Configure DMARC

**DMARC (Domain-based Message Authentication, Reporting and Conformance)** helps protect your domain from unauthorized email and defines how receiving mail servers should handle authentication failures.

If Fastmail provides a recommended DMARC record, follow its current instructions.

A DMARC record is normally added as a TXT record using:

```text
_dmarc
```

### Common policies

| Policy         | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `p=none`       | Monitor authentication results without blocking mail |
| `p=quarantine` | Treat failing messages as suspicious or spam         |
| `p=reject`     | Reject messages that fail DMARC                      |

If you are setting up DMARC for the first time, `p=none` is generally the safest starting point while you verify that legitimate email is authenticating correctly.

---

## 8. Verify the Domain in Fastmail

After adding the DNS records:

1. Return to **Fastmail → Settings → Domains**.
2. Open your domain.
3. Select **Verify**, **Check**, or **Recheck DNS**.
4. Wait for Fastmail to detect the DNS records.
5. Fix any records Fastmail reports as missing or incorrect.

DNS changes may not appear immediately.

If verification fails, compare the DNS records in your provider with the values shown by Fastmail.

---

## 9. Test Email

Once Fastmail verifies the domain, test both directions.

### Test Incoming Email

Send an email from another provider, such as Gmail, to your Fastmail address.

Confirm that the message arrives successfully.

### Test Outgoing Email

Send an email from your Fastmail address to an external address, such as Gmail.

Confirm that:

* The message is delivered.
* The message is not incorrectly marked as spam.
* The sender address is correct.

### Check Authentication

If needed, inspect the received email headers and confirm that:

```text
SPF: PASS
DKIM: PASS
DMARC: PASS
```

---

## 10. DNS Rules to Remember

### Do

* Copy DNS values directly from Fastmail.
* Remove conflicting MX records.
* Keep only one SPF record.
* Leave existing website DNS records unchanged.
* Make DNS changes at the authoritative DNS provider.
* Allow time for DNS changes to propagate.

### Don't

* Do not guess Fastmail DNS values.
* Do not create multiple SPF records.
* Do not remove website A or CNAME records unnecessarily.
* Do not modify unrelated DNS records.
* Do not reuse DNS values from another domain.

---

## 11. DNS Propagation

DNS changes are not always visible immediately.

Depending on the DNS provider and record TTL, changes may take:

* A few minutes in many cases
* Several hours in some cases
* Up to 24–48 hours in some situations

You do not normally need to make the DNS changes again while waiting for propagation.

---

## 12. Common DNS Provider Locations

| Provider       | DNS Management                          |
| -------------- | --------------------------------------- |
| **GoDaddy**    | My Products → Domain → DNS → Manage DNS |
| **Dynadot**    | My Domains → Domain → DNS Settings      |
| **Hostinger**  | Domains → Manage → DNS / DNS Zone       |
| **Namecheap**  | Domain List → Manage → Advanced DNS     |
| **Cloudflare** | Select Domain → DNS → Records           |

Provider interfaces can change. If you cannot find the DNS settings, search the provider dashboard for **DNS**, **DNS Records**, **DNS Zone**, or **Advanced DNS**.

---

## 13. Troubleshooting

### Fastmail cannot verify the domain

Check:

* The record type is correct.
* The host/name is correct.
* The value is copied exactly.
* There are no conflicting records.
* The DNS change has had enough time to propagate.

### Email is not arriving

Check:

* MX records are correct.
* Old MX records have been removed.
* The domain is verified in Fastmail.
* DNS changes have propagated.

### Emails are going to spam

Check:

* SPF is configured correctly.
* DKIM is configured correctly.
* DMARC is configured correctly.
* SPF and DKIM authentication pass on received messages.

### Website stopped working after DNS changes

Do not remove or modify website DNS records unless they are specifically related to email.

Check that the existing **A, AAAA, and CNAME** records are still present.

---

## 14. Setup Complete

The Fastmail domain setup is complete when:

* The domain is verified in Fastmail.
* Fastmail's MX records are active.
* SPF is configured.
* DKIM is configured.
* DMARC is reviewed/configured.
* Incoming email works.
* Outgoing email works.
* SPF/DKIM authentication passes.

**Your domain can now use Fastmail for email while continuing to use your existing hosting provider for the website.**
