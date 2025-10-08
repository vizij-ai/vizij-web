# Vizij Website Functions

> **Firebase Cloud Functions that power the Vizij website demos.**

---

## Overview

- Provides API endpoints consumed by the website (e.g., text-to-speech demos).
- Runs as Firebase Cloud Functions with a small Python runtime.
- Intended for local emulation during development and deployment via Firebase.

---

## Requirements

- Python 3.10+
- `pip`
- Firebase CLI (`npm install -g firebase-tools`)

---

## Local Development

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .\.venv\Scripts\activate
pip install -r requirements.txt

# From apps/website/ (parent directory)
firebase emulators:start
```

The emulator serves the functions locally so the website can call the same endpoints during development.

---

## Deployment

Deployment is handled by the main Vizij infrastructure. If you need to push changes, ensure they are coordinated with the platform team.

---

Questions? Reach out to the Vizij web platform maintainers. 🚀
