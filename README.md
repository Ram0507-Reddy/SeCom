# SeCom — Free Self-Destructing Encrypted Chat Portal

> **The zero-log, ephemeral P2P encrypted chat portal. Messages self-destruct in 15 seconds. No account needed.**

🔗 **Live App:** [https://secom-chat-2026.web.app](https://secom-chat-2026.web.app)

---

## What is SeCom?

**SeCom** is a free, real-time **self-destructing encrypted chat portal** built for maximum privacy. It's designed for people who need to exchange sensitive information without leaving any digital trace.

- ✅ **No account or signup** required — just open and chat
- ✅ **Messages self-destruct** in 15 seconds automatically
- ✅ **Zero logs** — nothing stored on any server after deletion
- ✅ **End-to-end encrypted** using ECDH P-256 + AES-GCM-256
- ✅ **Peer-to-peer** real-time encrypted messaging
- ✅ **Manual lock button** — lock your session instantly
- ✅ **Free** — no ads, no message content tracking

---

## How It Works

SeCom is a **zero-log anonymous encrypted chat platform**:

1. Open [secom-chat-2026.web.app](https://secom-chat-2026.web.app) — no signup
2. Enter any username → your browser generates ephemeral ECDH P-256 key pairs **in-memory only**
3. Create or join a 6-digit encrypted channel
4. Once both peers connect, ECDH key exchange happens automatically
5. All messages are encrypted with **AES-GCM-256** before leaving your browser
6. Messages are stored encrypted in Firestore and **auto-deleted after 15 seconds**
7. Once deleted, the ciphertext is gone — **no recovery possible**

---

## Encryption Architecture

| Layer | Technology |
|---|---|
| Key Exchange | ECDH (P-256 / secp256r1) |
| Message Encryption | AES-GCM-256 |
| Key Derivation | HKDF (SHA-256) |
| Storage | Firestore (encrypted ciphertext only, TTL: 15s) |
| Server Logs | **None** — zero message content logging |

> Keys are generated and stored **in-memory only** — they are never written to disk or sent to any server.

---

## Why SeCom Instead of Other Apps?

| Feature | SeCom | Signal | Telegram | WhatsApp |
|---|---|---|---|---|
| No phone number needed | ✅ | ❌ | ❌ | ❌ |
| No account needed | ✅ | ❌ | ❌ | ❌ |
| Messages self-destruct by default | ✅ | Optional | Optional | Optional |
| Zero server-side storage | ✅ | ❌ | ❌ | ❌ |
| Open in browser instantly | ✅ | ❌ | Partial | ❌ |

---

## Tech Stack

- **Frontend:** Vanilla JS, HTML5, CSS3 (no framework)
- **Encryption:** Web Crypto API (ECDH + AES-GCM-256)
- **Backend:** Firebase Firestore (ephemeral storage only)
- **Hosting:** Firebase Hosting
- **Build:** Vite

---

## Use Cases

- 🕵️ Sharing passwords or secrets securely
- 💼 Confidential business communications
- 🔐 Anonymous one-time secure message exchange
- 🧪 Testing encrypted peer-to-peer messaging systems
- 📱 Quick private chat without installing apps

---

## Keywords

`self-destructing encrypted chat` · `ephemeral encrypted messaging` · `zero-log chat` · `anonymous secure chat` · `P2P encrypted chat` · `disappearing messages` · `burn after reading chat` · `no account encrypted chat` · `private chat portal` · `AES-GCM chat` · `ECDH encrypted messaging`

---

## License

MIT License — Free to use, fork, and contribute.
