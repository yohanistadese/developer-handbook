# How to Deploy a Fullstack App to a VPS (Hostinger or similar)

A straightforward guide for deploying a typical fullstack project — React/Vite client, Node/Express API, PostgreSQL — to a VPS using Git, PM2, and Nginx.

---

## 1. Architecture

```text
Browser
   │
   ▼
 Nginx
   │
   ├── yourdomain.com       → serves client/dist (static files)
   └── api.yourdomain.com   → proxies to Node API (via PM2)
                                   │
                                   ▼
                              PostgreSQL
```

Project layout on the server:

```text
/root/myproject/
├── client/    (React/Vite — built to dist/)
└── server/    (Node/Express — run by PM2)
```

---

## 2. Connect to the VPS

```bash
ssh root@YOUR_SERVER_IP
```

---

## 3. Update the server and install basics

```bash
apt update && apt upgrade -y
apt install -y git curl nginx
```

---

## 4. Install Node.js (via NVM)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 20
nvm alias default 20
node -v
```

---

## 5. Connect GitHub via SSH

Generate a key on the VPS and add it to GitHub (**Settings → SSH and GPG keys**):

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

When prompted, press **Enter** to accept the default file location, then enter a passphrase (and confirm it) when asked — don't leave it blank.

```bash
cat ~/.ssh/id_ed25519.pub
```

Test it:

```bash
ssh -T git@github.com
```

---

## 6. Clone the project

```bash
mkdir -p /root/myproject
cd /root/myproject
git clone git@github.com:USERNAME/REPOSITORY.git .
```

---

## 7. Set up the backend

```bash
cd /root/myproject/server
npm install
nano .env
```

Example `.env` (never commit this file):

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/mydatabase
```

If using Prisma:

```bash
npx prisma generate
npx prisma migrate deploy
```

Test it runs before wiring up PM2:

```bash
npm start
curl http://localhost:5000
```

---

## 8. Run the backend with PM2

```bash
npm install -g pm2
cd /root/myproject/server
pm2 start npm --name "myproject-api" -- start
pm2 save
pm2 startup
```

`pm2 startup` prints a command — copy and run it exactly, then run `pm2 save` again. This makes the API restart automatically if the VPS reboots.

Useful commands:

```bash
pm2 list
pm2 logs myproject-api
pm2 restart myproject-api
```

---

## 9. Build the client

Set the API URL before building, so it's baked into the static files:

```bash
cd /root/myproject/client
echo "VITE_API_URL=https://api.yourdomain.com" > .env
npm install
npm run build
```

This creates `client/dist/`.

---

## 10. Point your domain to the VPS

At your DNS provider, add:

| Type | Name | Value        |
| ---- | ---- | ------------ |
| A    | @    | YOUR_VPS_IP  |
| A    | www  | YOUR_VPS_IP  |
| A    | api  | YOUR_VPS_IP  |

---

## 11. Configure Nginx — API

```bash
nano /etc/nginx/sites-available/myproject-api
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 12. Configure Nginx — Client

```bash
nano /etc/nginx/sites-available/myproject-client
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /root/myproject/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 13. Enable both sites

```bash
ln -s /etc/nginx/sites-available/myproject-api /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/myproject-client /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 14. Add HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
certbot --nginx -d api.yourdomain.com
```

---

## 15. Verify everything works

```bash
systemctl status nginx      # should be "active (running)"
pm2 list                    # myproject-api should be "online"
curl https://api.yourdomain.com
```

Then open `https://yourdomain.com` in a browser.

---

## 16. Deploying updates

Whenever you push new code:

```bash
cd /root/myproject
git pull origin main

# backend
cd server
npm install
npx prisma migrate deploy   # if using Prisma
pm2 restart myproject-api

# frontend
cd ../client
npm install
npm run build
```

Nginx serves `client/dist` directly, so no restart is needed for the frontend — the new build is live as soon as it finishes.

---

## 17. One script to do all of it (restart.sh)

Instead of typing the update steps every time, put them in one script.

```bash
cd /root/myproject
nano restart.sh
```

```bash
#!/bin/bash
set -e

cd /root/myproject
git pull origin main

# backend
cd server
npm install
npx prisma migrate deploy   # remove this line if you don't use Prisma
pm2 restart myproject-api

# frontend
cd ../client
npm install
npm run build

echo "Deploy done."
```

Make it executable:

```bash
chmod +x restart.sh
```

From now on, deploying a new version is just:

```bash
bash restart.sh
```

---

## Key takeaway

* **PM2** runs the Node/Express API.
* **Nginx** serves the built React/Vite files and proxies API requests to PM2.
* Never expose the API's port (e.g. `5000`) directly to the internet — always go through Nginx.
