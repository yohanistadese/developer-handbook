# AI Calling Agent & Sales Automation — Build Plan

A step-by-step plan for building an AI voice agent that calls leads, has a real
qualifying conversation, books appointments on a live calendar, and hands
qualified leads off to a human closer — with a Python/FastAPI backend and a
React dashboard.

---

## 1. Architecture

```text
React Dashboard  ──▶  FastAPI Backend  ──▶  PostgreSQL
                            │
                            ▼
                    Telnyx (phone call)
                            │
                            ▼
                 Pipecat pipeline (per call)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Deepgram (STT)      OpenAI (LLM)         TTS provider
   audio → text      text → response       text → audio
                            │
                            ▼
                  Google Calendar (booking)
```

Project layout:

```text
ai-calling/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   ├── voice/
│   │   └── main.py
│   └── requirements.txt
└── frontend/
```

---

## 2. Tools & services

| Tool | Purpose | Link |
| --- | --- | --- |
| Docker | Local PostgreSQL | https://www.docker.com/ |
| PostgreSQL | Primary database | https://www.postgresql.org/ |
| FastAPI | Backend API framework | https://fastapi.tiangolo.com/ |
| SQLAlchemy | ORM | https://www.sqlalchemy.org/ |
| Alembic | Database migrations | https://alembic.sqlalchemy.org/ |
| React (Vite) | Dashboard frontend | https://react.dev/ · https://vitejs.dev/ |
| Telnyx | Outbound calling, Call Control API | https://telnyx.com/ |
| Pipecat | Real-time voice pipeline orchestration | https://docs.pipecat.ai/ |
| Deepgram | Streaming speech-to-text | https://deepgram.com/ |
| OpenAI | LLM + (optionally) TTS | https://openai.com/ |
| ElevenLabs | Alternative TTS provider | https://elevenlabs.io/ |
| Cartesia | Alternative TTS provider | https://cartesia.ai/ |
| Google Calendar API | Appointment booking | https://developers.google.com/calendar/api |
| Redis + Celery/arq | Optional concurrency control for the campaign dialer | https://redis.io/ · https://docs.celeryq.org/ |

> **Security note:** all credentials (Telnyx, Deepgram, OpenAI, TTS, Google
> OAuth) live only in `.env` / secure server-side storage, are never
> committed, and are referenced here only as placeholder variable names.

---

## Step 1 — Project setup

1. Install Docker (for local PostgreSQL).
2. Create the folder structure shown above.
3. In `backend/`, create a virtual environment and install:
   `fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `psycopg2-binary`,
   `python-dotenv`, `pydantic`.
4. In `frontend/`, scaffold React with `npm create vite@latest`.
5. Create a `.env` with placeholders for:
   `DATABASE_URL`, `TELNYX_API_KEY`, `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`,
   `TTS_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

**Goal:** an empty FastAPI server and an empty React app both boot locally.

---

## Step 2 — Database

1. Add a `docker-compose.yml` with a `postgres` service, then
   `docker-compose up -d`.
2. Create SQLAlchemy models:
   - `leads` (name, phone, email, company, status)
   - `campaigns` (name, status, concurrency_limit)
   - `calls` (lead_id, telnyx_call_id, started_at, ended_at,
     duration_seconds, outcome)
   - `call_transcripts` (call_id, full_transcript)
   - `ai_results` (call_id, current_solution, pain_point, num_users,
     decision_maker, interest_level, timeline, ai_summary)
   - `appointments` (lead_id, call_id, scheduled_at, sales_rep,
     calendar_event_id, status)
   - `activity_logs` (lead_id, action, metadata, created_at)
3. `alembic init alembic`, point it at the models, then
   `alembic revision --autogenerate` and `alembic upgrade head`.
4. Seed a handful of sample leads.

**Goal:** tables exist in PostgreSQL and sample leads are queryable.

---

## Step 3 — FastAPI backend

1. Core endpoints:
   - `GET /leads`
   - `POST /leads`
   - `POST /campaigns`
   - `POST /campaigns/{id}/start`
   - `POST /calls`
   - `GET /calls/{id}`
   - `GET /appointments`
   - `GET /dashboard/summary`
2. Pydantic schemas for request/response validation.
3. A service layer — no business logic in route handlers.
4. A reusable `log_activity(lead_id, action, metadata)` called on every
   meaningful state change.
5. Centralized error handling with consistent JSON error responses.

**Goal:** create a lead, list leads, and see it reflected in
`/dashboard/summary` — no calling yet.

---

## Step 4 — Connect Telnyx (first real call, no AI)

**Setup** ([telnyx.com](https://telnyx.com/)):
1. Create a Telnyx account, buy a phone number, enable Voice API on it.
2. Create a Telnyx Call Control application.
3. Point its webhook at your backend, e.g.
   `https://yourdomain.com/webhooks/telnyx/status`.
4. Store the API key as `TELNYX_API_KEY`.

**Implementation:**
1. `POST /calls` places an outbound call via the Telnyx API.
2. Create a `calls` row with `started_at = now` and the `telnyx_call_id`.
3. `POST /webhooks/telnyx/status` receives status events (answered,
   no-answer, busy, failed, completed) and updates `ended_at`,
   `duration_seconds`, `outcome`.
4. Verify the Telnyx webhook signature.

**Goal:** the system calls one real phone number and logs the call
accurately — no AI involved yet.

---

## Step 5 — Pipecat + Deepgram (speech-to-text)

**Setup** ([deepgram.com](https://deepgram.com/), [Pipecat docs](https://docs.pipecat.ai/)):
1. Get a Deepgram API key → `DEEPGRAM_API_KEY`.
2. `pip install pipecat-ai`.

**Implementation:**
1. Pipeline: Telnyx audio → Deepgram (streaming STT) → text.
2. Wire the pipeline into the live Telnyx call.
3. Log transcribed text to confirm accuracy.

**Goal:** speaking on a test call produces correct transcribed text in the
backend.

---

## Step 6 — Connect the LLM (AI brain)

**Setup** ([openai.com](https://openai.com/)):
1. Get an OpenAI API key → `OPENAI_API_KEY`.

**Implementation:**
1. Extend the pipeline: Deepgram text → OpenAI LLM → response text.
2. Write a focused sales system prompt: introduce itself → identify
   decision maker → understand needs → ask qualification questions →
   determine interest → offer an appointment.
3. Don't try to close the sale in V1 — qualify and hand off only.
4. Log the LLM's text response (no voice yet) to confirm it's sensible.

**Goal:** the AI generates on-script responses to real transcribed speech.

---

## Step 7 — Add TTS (complete the conversation loop)

**Setup** — pick one: [OpenAI TTS](https://openai.com/), [ElevenLabs](https://elevenlabs.io/), Deepgram Aura ([deepgram.com](https://deepgram.com/)), or [Cartesia](https://cartesia.ai/).

**Implementation:**
1. Extend the pipeline: LLM response text → TTS → audio → back through
   Telnyx to the customer.
2. Handle interruptions (barge-in), silence/timeouts, background noise.

**Test explicitly:**
- [ ] Normal conversation
- [ ] Customer interrupts the AI
- [ ] Silence
- [ ] Background noise
- [ ] Unexpected/off-topic questions

**Goal:** a real, complete AI phone conversation, start to finish.

---

## Step 8 — Connect calendar + AI tool calls

**Setup** ([Google Calendar API](https://developers.google.com/calendar/api)):
1. Create a Google Cloud project, enable the Calendar API.
2. Set up OAuth2 credentials for the sales calendar account.
3. Run a one-time auth flow to get a refresh token; store it server-side.
4. Add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / refresh token to secure
   storage.

**Implementation:**
1. Give the LLM these callable tools (Pipecat/OpenAI function calling):
   `check_calendar()`, `book_appointment(lead_id, call_id, scheduled_at)`,
   `save_qualification(call_id, ...)`, `save_call_result(call_id, outcome)`,
   `mark_do_not_call(lead_id)`.
2. Never let the AI tell the customer an appointment is booked until
   `book_appointment()` actually confirms it against the calendar.
3. If the calendar is unavailable, offer the next open slot instead of
   failing silently.
4. Log every tool call (success or failure) via `log_activity()`.

**Goal:** a qualified, interested lead gets a real appointment booked on the
real calendar, live, during the call.

---

## Step 9 — Campaign engine + React dashboard

**Implementation:**
1. Campaign dialer loop: get next lead → check Do Not Call → call → AI
   conversation → save result → next lead.
2. Start at concurrency = 1, confirm stability, then raise it.
3. React dashboard ([react.dev](https://react.dev/)):
   - Leads (list, filter, search)
   - Campaigns (create, Start/Stop, concurrency setting)
   - Call History (outcome, duration, timestamp)
   - Call Transcript + AI Summary (per call)
   - Qualified Leads (filtered view)
   - Appointments (list)
   - Dashboard summary (totals: leads, calls, answered, interested,
     qualified, appointments)
   - Lead detail view with full activity log

**Goal:** start a real campaign from the dashboard and watch results
populate live.

---

## Step 10 — Production testing → handoff → scale

Test the full flow end to end:

```text
Lead → AI calls → Customer answers → AI conversation → Qualification →
Appointment → Sales rep → Final sales call → Sale
```

Also explicitly test:

- [ ] No answer
- [ ] Voicemail
- [ ] Wrong number
- [ ] Not interested
- [ ] Appointment booking
- [ ] Do not call
- [ ] Customer interrupts AI
- [ ] Calendar unavailable
- [ ] Call disconnects mid-conversation
- [ ] Call recording/transcript
- [ ] AI summary accuracy

Confirm the sales rep can open `/leads/{id}/handoff` and immediately
understand the lead's context (transcript summary, qualification data,
appointment) with zero extra explanation needed.

Scale concurrency gradually — 1 call → 3 → 5 → 10 → more — only after each
level is stable.

**Goal:** a stable, fully logged, production-ready V1 ready for real leads.

---

## Key takeaway

* Each pipeline stage (Telnyx → Deepgram → OpenAI → TTS) is added and
  verified one at a time — never wire the whole voice loop together before
  each piece works in isolation.
* The AI qualifies and books; it does not close the sale in V1.
* All API keys and tokens live in `.env` / secure server-side storage only —
  never in code, logs, or version control.
