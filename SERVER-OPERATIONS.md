# Production Server — Operations & Hardening Guide

> **Last Updated:** 2026-10-23
> **Server:** Linode VPS, Ubuntu 24.04 — 4 vCPU / 8 GB RAM / 157 GB disk
> **Who this is for:** anyone with root SSH access to production
> **Golden rule:** read a whole section before running any of it. Every step has **Check → Do → Verify → Undo**.

⚠️ **Never write secrets or the server's IP address in this repo.** The site is behind Cloudflare; a leaked origin IP lets attackers bypass it. Use `<server-ip>` in docs.

---

## Contents

1. [What runs on the server](#1-what-runs-on-the-server)
2. [Never do this](#2-never-do-this)
3. [Before any change — safety checklist](#3-before-any-change--safety-checklist)
4. [Practice 1 — Firewall](#4-practice-1--firewall)
5. [Practice 2 — Key-only SSH](#5-practice-2--key-only-ssh)
6. [Practice 3 — Nightly database backups](#6-practice-3--nightly-database-backups)
7. [Practice 4 — System & Node.js updates](#7-practice-4--system--nodejs-updates)
8. [Practice 5 — Log rotation & uptime monitoring](#8-practice-5--log-rotation--uptime-monitoring)
9. [Disk cleanup — what is safe to delete](#9-disk-cleanup--what-is-safe-to-delete)
10. [Health check & emergency recovery](#10-health-check--emergency-recovery)
11. [Editing the server from a Mac (Zed)](#11-editing-the-server-from-a-mac-zed)

---

## 1. What runs on the server

| Component | Where | Port | Managed by |
|-----------|-------|------|------------|
| Frontend (Next.js) | `/var/www/nyelizabeth/client` | 3000 | PM2 `nyeliz-client` |
| API (Express) | `/var/www/nyelizabeth/server` | 4000 | PM2 `nyeliz-server` |
| Reverse proxy + SSL | `/etc/nginx/sites-enabled/` | 80, 443 | systemd `nginx` |
| PostgreSQL 16 — db `nyelizabeth_phase2` | localhost only | 5432 | systemd `postgresql@16-main` |
| MongoDB | localhost only (auth on) | 27017 | systemd `mongod` |
| Redis | localhost only | 6379 | systemd `redis-server` |
| Brute-force protection | — | — | systemd `fail2ban` |
| SSL renewal | `/etc/cron.d/certbot` | — | certbot |

**Domains (all via Cloudflare):** `nyelizabeth.com`, `www.nyelizabeth.com`, `bid.nyelizabeth.com` → frontend. `api.nyelizabeth.com` → API.

**The API uses all three databases** (PostgreSQL, MongoDB, Redis). Never stop or remove any of them.

PM2 restarts both apps automatically after a reboot (`pm2-root.service`).

---

## 2. Never do this

These break production or lose data **permanently**:

| ❌ Never | Why |
|---------|-----|
| `npm run prisma:reset` / `prisma migrate reset` on the server | **Wipes the whole PostgreSQL database.** |
| `npm run db:push` / `prisma migrate dev` on the server | Can drop columns/data. Production uses `npm run prisma:migrate:deploy` only. |
| Delete `/var/www/nyelizabeth/build/` | It is the **deploy workspace** — `build/server/deploy/remote-build-client.sh` builds there. Next deploy fails without it. |
| Delete `client/.next` or `client/.next.bak` | `.next` is the live site. `.next.bak` is the automatic rollback the deploy script uses. |
| Delete or edit `server/.env` without a copy | Holds all passwords & API keys. Always `cp server/.env server/.env.bak.$(date +%s)` first. |
| `pm2 delete …` / `pm2 kill` | Removes the apps from PM2. Use `pm2 restart nyeliz-server` instead. |
| `ufw enable` before `ufw allow 22/tcp` | Locks everyone out of SSH. |
| Turn off password SSH before testing key login | Locks everyone out of SSH. |
| `git reset --hard` / `git clean` in `/var/www/nyelizabeth` | Deletes untracked files including `.env`, uploads and the build workspace. |
| Commit `logins.md`, `.env`, keys or the server IP | Secrets leak via GitHub. (`logins.md` is already in `.gitignore` — keep it there.) |
| Run big jobs during live auctions | Builds and upgrades use CPU/RAM and can slow bidding. Work at quiet times. |

---

## 3. Before any change — safety checklist

Run through this **every time**, in this order:

1. **Quiet time?** No live auction running or starting in the next hour.
2. **Keep one SSH session open** the whole time. Do the work in a second one. If you lock yourself out, fix it from the first.
3. **Know the backdoor:** Linode dashboard → your Linode → **Launch LISH Console** works even if SSH or the firewall is broken.
4. **Fresh backup:** `/usr/local/bin/nyeliz-backup.sh` (after Practice 3 is set up).
5. **Baseline health:** run the [health check](#10-health-check--emergency-recovery) and note the results.
6. After the change, run the health check again and compare.

---

## 4. Practice 1 — Firewall

**Why:** with no firewall, ports 3000 and 4000 are reachable directly from the internet, bypassing Cloudflare and nginx.

**Check**
```bash
ufw status          # expect: Status: inactive (first time)
```

**Do** — the order matters, SSH first:
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw status verbose  # confirm 22, 80, 443 are listed BEFORE enabling
ufw enable
```

**Verify**
- From a **new** terminal on your laptop: `ssh root@<server-ip>` still works.
- Site opens in a browser: https://nyelizabeth.com and https://api.nyelizabeth.com
- From your laptop, `curl -m 5 http://<server-ip>:4000` must **time out** (port is now closed).

**Undo:** `ufw disable` (from the open session or LISH).

---

## 5. Practice 2 — Key-only SSH

**Why:** root can currently log in with a password, which bots guess all day.

**Check — on your laptop, first.** Key login must work **without a password prompt**:
```bash
ssh-copy-id root@<server-ip>    # only if you don't already have a key installed
ssh root@<server-ip>            # must NOT ask for the server password
```
Every person who needs access must have their key in `/root/.ssh/authorized_keys` **before** continuing.

**Do — on the server.** Uses a separate drop-in file so it is easy to undo:
```bash
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl reload ssh     # sshd -t validates; reload only runs if valid
```

**Verify** — keep the current session open, open a **new** one from your laptop: `ssh root@<server-ip>` → logs in. Then confirm passwords are refused:
```bash
ssh -o PubkeyAuthentication=no root@<server-ip>   # expect: Permission denied (publickey)
```

**Undo:** `rm /etc/ssh/sshd_config.d/00-hardening.conf && systemctl reload ssh`

---

## 6. Practice 3 — Nightly database backups

**Why:** GitHub has the code, but **users, bids, auctions and orders live only in the databases**. Without backups, a disk failure or bad command loses them forever.

**Do — create the backup script:**
```bash
cat > /usr/local/bin/nyeliz-backup.sh <<'EOF'
#!/usr/bin/env bash
# Nightly dump of PostgreSQL + MongoDB + server .env. Keeps 7 days.
set -euo pipefail
umask 077
D=/var/backups/nyeliz
T=$(date +%F)
mkdir -p "$D"
MONGO_URI=$(grep '^MONGO_URI=' /var/www/nyelizabeth/server/.env | cut -d= -f2- | tr -d '"')
sudo -u postgres pg_dump -Fc nyelizabeth_phase2 > "$D/pg-$T.dump"
mongodump --uri="$MONGO_URI" --gzip --archive="$D/mongo-$T.archive.gz" --quiet
cp /var/www/nyelizabeth/server/.env "$D/env-$T"
find "$D" -type f -mtime +7 -delete
echo "$(date -Is) backup OK"
EOF
chmod 700 /usr/local/bin/nyeliz-backup.sh
```

**Verify — run it once by hand:**
```bash
/usr/local/bin/nyeliz-backup.sh        # expect: "... backup OK"
ls -lh /var/backups/nyeliz             # pg-*.dump (~a few MB), mongo-*.archive.gz (hundreds of MB), env-*
```

**Schedule it** (03:30 every night, output logged):
```bash
echo "30 3 * * * root /usr/local/bin/nyeliz-backup.sh >> /var/log/nyeliz-backup.log 2>&1" > /etc/cron.d/nyeliz-backup
```
Next morning: `tail /var/log/nyeliz-backup.log` → should say `backup OK`.

**Off-server copy (strongly recommended):** Linode dashboard → your Linode → **Backups → Enable** (a few $/month). Server backups don't help if the whole server is lost.

### Restoring (only in an emergency)

⚠️ Restoring **overwrites live data**. Stop the API first and take a fresh backup of the current state before restoring anything.

```bash
pm2 stop nyeliz-server
/usr/local/bin/nyeliz-backup.sh                                  # snapshot current state first
# PostgreSQL
sudo -u postgres pg_restore --clean --if-exists -d nyelizabeth_phase2 /var/backups/nyeliz/pg-YYYY-MM-DD.dump
# MongoDB
MONGO_URI=$(grep '^MONGO_URI=' /var/www/nyelizabeth/server/.env | cut -d= -f2- | tr -d '"')
mongorestore --uri="$MONGO_URI" --gzip --archive=/var/backups/nyeliz/mongo-YYYY-MM-DD.archive.gz --drop
pm2 start nyeliz-server
```

---

## 7. Practice 4 — System & Node.js updates

### Ubuntu packages (monthly)

`apt upgrade` may briefly restart PostgreSQL / MongoDB / Redis / nginx — do it at a quiet time.

```bash
/usr/local/bin/nyeliz-backup.sh         # backup first
apt update
apt list --upgradable                   # read what will change
apt upgrade -y
[ -f /var/run/reboot-required ] && echo "REBOOT NEEDED"
```
If a reboot is needed: `reboot`, wait ~1 minute, then run the [health check](#10-health-check--emergency-recovery). PM2 brings both apps back by itself.

Security patches already install automatically (`unattended-upgrades` is running).

### Node.js (planned upgrade — not urgent-today, but do it)

The server runs **Node 20, which stopped receiving security fixes in April 2026**. Upgrade to **Node 22 LTS** — but **never on the live server first**:

1. On a laptop/dev machine: switch to Node 22, `npm ci` in `client/` and `server/`, `npm run build` in `client/`, run the app and click through login, bidding and checkout.
2. Only if everything works: on the server, at a quiet time, take a backup, install Node 22, run `npm ci` in both `client/` and `server/` (native modules such as `bcrypt` must be rebuilt), then `pm2 restart all` and run the health check.
3. If anything fails: reinstall Node 20, `npm ci` again, `pm2 restart all`.

---

## 8. Practice 5 — Log rotation & uptime monitoring

**Log rotation** — stops PM2 logs from growing without limit:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 save
```
Verify: `pm2 ls` shows `pm2-logrotate` as `online` and both `nyeliz-*` apps still `online`.

**Uptime monitoring** — free at https://uptimerobot.com. Add HTTP(s) monitors for:
- `https://nyelizabeth.com`
- `https://api.nyelizabeth.com`

You get an email within ~5 minutes if either goes down.

---

## 9. Disk cleanup — what is safe to delete

Reviewed 2026-10-23 by checking nginx, PM2, cron, systemd and the deploy scripts.

**✅ Safe to delete** (nothing references them):

| Path | What it was |
|------|-------------|
| `/root/Auctions-main` | Old version of the project. Not running; code is on GitHub. |
| `/root/nyeliz-backups/` | June 2026 pre-migration snapshots (old app + old database). Outdated. |
| `/root/backups/` | Sep 2026 pre-phase code snapshots. Code is in git. |
| `client/.next.apex` | Staging copy from the finished apex-domain cutover. |
| `client/public/*.bak.*` | Old robots/sitemap copies — **publicly downloadable**, delete them. |
| Old PM2 logs: `auction-*`, `backend-api-*`, `next-frontend-*`, `nextjs-frontend-*`, `nyeliz-server-test-*` in `/root/.pm2/logs` | Logs of processes that no longer exist. |
| `/root/.npm` (via `npm cache clean --force`) | Download cache; rebuilds itself. |
| `/root/.vscode-server` | Only if nobody uses VS Code Remote-SSH any more. |

**❌ Never delete:** `build/`, `client/.next`, `client/.next.bak`, `client/node_modules`, `server/node_modules`, `server/.env`, `/var/backups/nyeliz`, anything in `/var/lib/` (database files).

```bash
df -h /                                   # before
rm -rf /root/Auctions-main /root/nyeliz-backups /root/backups
rm -rf /var/www/nyelizabeth/client/.next.apex
rm -f  /var/www/nyelizabeth/client/public/{robots.txt,sitemap.xml,sitemap-0.xml}.bak.*
cd /root/.pm2/logs && rm -f auction-* backend-api-* next-frontend-* nextjs-frontend-* nyeliz-server-test-*
npm cache clean --force
df -h /                                   # after
```
Then run the health check.

---

## 10. Health check & emergency recovery

### Health check (run before and after every change)
```bash
pm2 ls                                                              # nyeliz-client + nyeliz-server: online
nginx -t                                                            # syntax is ok
systemctl is-active nginx postgresql@16-main mongod redis-server    # all: active
curl -s -o /dev/null -w 'frontend %{http_code}\n' localhost:3000    # 200
curl -s -o /dev/null -w 'api %{http_code}\n' localhost:4000/v1/api  # any response (not "000")
df -h /                                                             # disk below 80%
```
Note: `curl https://nyelizabeth.com` from the server returns **403** — that is Cloudflare's bot check, not an outage. Check the public site in a browser.

### If something breaks

| Symptom | Fix |
|---------|-----|
| App shows `errored` / `stopped` in `pm2 ls` | `pm2 logs nyeliz-server --lines 100` to see why, then `pm2 restart nyeliz-server` |
| Site broken right after a client deploy | `cd /var/www/nyelizabeth/client && mv .next .next.failed && mv .next.bak .next && pm2 restart nyeliz-client` |
| nginx won't start | `nginx -t` shows the bad line; fix it, then `systemctl reload nginx` |
| Locked out of SSH | Linode dashboard → **LISH Console** → `ufw disable` and/or `rm /etc/ssh/sshd_config.d/00-hardening.conf && systemctl reload ssh` |
| Data lost / corrupted | [Restore from backup](#restoring-only-in-an-emergency) |
| Disk full | `du -sh /root/.pm2/logs /var/backups/nyeliz /root/.npm` — see [cleanup](#9-disk-cleanup--what-is-safe-to-delete) |

---

## 11. Editing the server from a Mac (Zed)

[Zed](https://zed.dev) is a native editor that opens server folders over SSH and is much lighter than VS Code Remote-SSH.

1. Install: `brew install --cask zed`
2. In `~/.ssh/config` **on your Mac**:
   ```
   Host nyeliz
     HostName <server-ip>
     User root
   ```
3. In Zed press **⌃⌘⇧O** → *Connect New Server* → `ssh nyeliz` → open `/var/www/nyelizabeth`.
4. Built-in terminal: **⌃`**.

Remember: you are editing **production files directly**. Save carefully, and prefer making code changes locally + deploying via git.
