# SENTINEL EARLY WARNING SYSTEM

Self-hosted AI-assisted security report triage and incident tracking with React, Vite, FastAPI, Gemma through Ollama, Temporal, PostgreSQL, MinIO, and optional Milvus semantic retrieval.

our existing  project Pipelines supplies the shared MinIO and Temporal servers. Example incident descriptions use fictional data.

## Contents

- [What the application does](#what-the-application-does)
- [Where data is stored](#where-data-is-stored)
- [Start and configure the project](#start-and-configure-the-project)
- [Open the browser interfaces](#open-the-browser-interfaces)
- [Use each Sentinel page](#use-each-sentinel-page)
- [Test scenarios from the UI](#test-scenarios-from-the-ui)
- [Verify saved data](#verify-saved-data)
- [Connect webhooks and a mailbox](#connect-webhooks-and-a-mailbox)
- [Operate and troubleshoot](#operate-and-troubleshoot)
- [Implementation boundaries](#implementation-boundaries)

## What the application does

| Feature | Input and processing |
|---|---|
| Bomb threat review | Screen submitted email, message, and report text for threat wording, then create review items. |
| Aerial alerts | Receive structured aerial alerts, assess report age, and show other reports at the same location and within the correlation window. |
| Suspicious activity | Review access events using restricted-zone flags and reported dwell duration. |
| Cyberattack warning | Count recorded login failures, flag subsequent successful logins, and process network anomaly observations. |
| Emergency tracking | Record emergency observations, source confirmation, operator actions, and incident status. |
| Early warning | Apply warning rules and optionally ask local Gemma to identify an observable warning with a supporting quote. |
| Incident assistant | Retrieve supplied procedures using Milvus cosine similarity or lexical retrieval, then generate guidance from those procedures and incident context. |

The UI's **Analyze a new observation** form sends new text through the live ingestion workflow. **Run scenario** and the category-based **New report** dialog are additional demonstration entry points. The latter two write through the existing incident endpoints directly.

## Where data is stored

| Component | Stored information | How to inspect |
|---|---|---|
| PostgreSQL | `events` records with payloads, priorities, status, owner and evidence references. The `audit` table stores actions and notes. | Adminer or Sentinel Incidents. |
| MinIO | Submitted workflow JSON under `incoming/` and incident JSON under `EVT-…/original.json`, inside `MINIO_BUCKET`. | Existing MinIO console or Download original evidence. |
| Milvus | The six supplied SOP documents and their embedding vectors. | Attu. |
| Temporal | Workflow execution state and activity history. Workflows receive a MinIO object key as input. | Existing Temporal UI. |
| Offline preview | Browser-local sample events and actions. | Offline demo mode in the frontend. |

An incident submission can create several category records. When no rule or accepted AI finding matches, the completed workflow can return an empty incident list. With Temporal enabled, its incoming JSON still resides in MinIO.

## Start and configure the project

### 1. Prerequisites

- Docker Desktop with Docker Compose v2.
- Your existing shared MinIO and Temporal containers.
- Ollama on the host, with the selected model installed.
- Python 3 for initial credential generation or the optional host mailbox connector.
- Sufficient Docker memory for PostgreSQL, Milvus, etcd and any other running applications. Milvus adds substantial resource use on an 8 GB Mac.

Pull the local models as needed.

```bash
ollama pull gemma3:4b
ollama pull nomic-embed-text
```

Gemma handles local language generation. The second model creates SOP and query embeddings when vector retrieval is enabled.

### 2. Preserve your working configuration

For your already configured installation, keep the existing `.env` and database password. Back it up privately before editing.

```bash
cp .env .env.backup
chmod 600 .env .env.backup
```

For a fresh installation without `.env`, generate it once.

```bash
python3 scripts/configure.py
```

Review the generated MinIO settings before using a shared MinIO server. Generated credentials need to be replaced with credentials accepted by that existing server.

The uploaded archive includes a private `.env`. Before publishing the repository, add the following lines to `.gitignore` and exclude private environment files from future ZIPs.

```gitignore
.env
.env.*
!.env.example
```

Keep `.env.example` free of active credentials. If an environment file was already committed, remove it from tracking and replace the exposed credentials. Updating an existing PostgreSQL password also requires updating the database role.

### 3. Start the shared services

These names match your existing PPT deployment.

```bash
docker start ppt_generation_service-temporal-1 ppt_generation_service-minio-1
docker port ppt_generation_service-temporal-1
docker port ppt_generation_service-minio-1
```

Use the published host ports when connecting through `host.docker.internal`. Temporal's gRPC port is normally 7233. MinIO's API and console have separate ports, commonly 9000 and 9001.

If you already connected MinIO directly to Sentinel's Docker network, you may keep `MINIO_ENDPOINT=ppt_generation_service-minio-1:9000`. The API, worker and Milvus must all be able to resolve that name. A recreated external container may need to be reattached to Sentinel's network.

### 4. Review the main environment settings

The following example shows configuration values to review. Preserve your existing private credentials.

```dotenv
STORAGE_MODE=minio
MINIO_ENDPOINT=host.docker.internal:9000
MINIO_BUCKET=sentinel-evidence
MINIO_SECURE=false

TEMPORAL_ENABLED=true
TEMPORAL_ADDRESS=host.docker.internal:7233
TEMPORAL_NAMESPACE=sentinel-live
TEMPORAL_TASK_QUEUE=sentinel_events
WORKER_ACTIVITY_CONCURRENCY=1

LLM_PROVIDER=ollama
LLM_MODEL=gemma3:4b
GEMMA_BASE_URL=http://host.docker.internal:11434/v1
AI_WARNING_REVIEW=true
TRIAGE_TIMEOUT_SECONDS=45

VECTOR_ENABLED=true
EMBEDDING_MODEL=nomic-embed-text
MILVUS_URI=http://milvus:19530
MILVUS_TOKEN=

SEED_DEMO=false
BIND_ADDRESS=127.0.0.1
WEB_PORT=8088
ATTU_PORT=8089
ADMINER_PORT=8090

LOGIN_WINDOW_SECONDS=300
NETWORK_DESTINATION_LIMIT=50
NETWORK_DENIAL_LIMIT=30
```

Also set `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `OPERATOR_PASSWORD`, `VIEWER_PASSWORD` and `SOURCE_WEBHOOK_KEY` in `.env`.

Compose overrides `DATABASE_URL` with the internal PostgreSQL address, `STORAGE_MODE` with `minio`, and `MILVUS_URI` with `http://milvus:19530`. A SQLite URL in `.env` is a fallback for running Python outside Compose.

`GEMMA_BASE_URL` identifies your Ollama host. This project's adapter strips the `/v1` suffix and calls Ollama's native `/api/chat` and `/api/embed` endpoints.

### 5. Register the Temporal namespace

```bash
docker exec ppt_generation_service-temporal-1 temporal operator namespace create \
  --address localhost:7233 \
  --namespace sentinel-live \
  --retention 7d
```

An already-existing namespace is acceptable. Verify it with the following command.

```bash
docker exec ppt_generation_service-temporal-1 temporal operator namespace describe \
  --address localhost:7233 \
  --namespace sentinel-live
```

Your previously shared Temporal logs show **in-memory** persistence. Restarting that server clears workflow history and custom namespaces. Register `sentinel-live` again afterward. Durable Temporal storage requires configuration in the shared Temporal deployment.

### 6. Start Sentinel

Start the full application with Milvus and its browser UI.

```bash
docker compose --profile vectors up -d --build
docker compose --profile vectors ps
docker compose logs --since=2m --tail=50 api worker milvus
```

For lexical retrieval, set `VECTOR_ENABLED=false` and use `docker compose up -d --build`. The vectors profile starts etcd, Milvus and Attu. The mail profile is enabled separately.

The shared MinIO and Temporal containers are external dependencies and are started independently. API health checks confirm that FastAPI is responding. Inspect the System page and worker status to confirm downstream readiness.

### 7. Apply future configuration changes

After changing `.env`, recreate the processes that consume it.

```bash
docker compose --profile vectors up -d --force-recreate api worker milvus
docker compose up -d --force-recreate frontend
```

Recreating the frontend refreshes Nginx's connection to a recreated API container. Use `--build` when application source or dependency files change.

## Open the browser interfaces

| UI | Default URL | Purpose |
|---|---|---|
| Sentinel | http://localhost:8088 | Submit observations, review incidents and actions. |
| Attu | http://localhost:8089 | Inspect Milvus collections and vectors. |
| Adminer | http://localhost:8090 | Inspect PostgreSQL tables and rows. |
| MinIO console | Usually http://localhost:9001 | Browse evidence objects. Confirm the existing container's console port mapping. |
| Temporal | Usually http://localhost:8233 | Inspect workflows in `sentinel-live`. Confirm its published port mapping. |

The first three ports follow your Compose configuration. MinIO and Temporal URLs depend on the shared containers. A configured port override takes precedence over this table.

### Sentinel login

1. Open Sentinel and choose **System → Connect self-hosted API** when the offline preview is shown.
2. Enter username `operator` and the value of `OPERATOR_PASSWORD` from `.env`.
3. Confirm the sidebar displays **Self-hosted API**.
4. Use `viewer` with `VIEWER_PASSWORD` for read access. API changes require the operator role.
5. Open Overview. With `SEED_DEMO=false`, a fresh database has no seeded incidents.

### PostgreSQL through Adminer

1. Open http://localhost:8090.
2. Set System to **PostgreSQL**.
3. Enter Server `postgres`, Username `sentinel`, Database `sentinel`.
4. Use `POSTGRES_PASSWORD` from `.env` as the password.
5. Select `events` and click **Select data**. Expand the JSON fields as needed.
6. Inspect `audit` to see ingestion records and status changes.

Useful queries in Adminer's **SQL command** page follow.

```sql
SELECT COUNT(*) AS incident_count FROM events;

SELECT id, status, owner, created_at, payload, assessment
FROM events
ORDER BY created_at DESC
LIMIT 20;

SELECT event_id, actor, action, note, created_at
FROM audit
ORDER BY id DESC
LIMIT 30;
```

Use the database user password that initialized the existing database. Editing `POSTGRES_PASSWORD` alone does not change an existing PostgreSQL role.

### Milvus through Attu

1. Open http://localhost:8089 after the vectors profile is running.
2. Connect to `milvus:19530`, using database `default`. The uploaded Compose file has no Milvus authentication configuration, so leave credentials empty unless you configured authentication separately.
3. In Sentinel, open **System → Index training SOPs** as operator. Wait for the indexing response.
4. Refresh Attu and open **Collections**.
5. Select the collection beginning with `sops_` and inspect its schema and data.
6. Load the collection if Attu requests it, then query its data view.

The collection name is `sops_` plus the first ten hexadecimal characters of the SHA-256 hash of `EMBEDDING_MODEL`. Fields include `id`, `sop_id`, `title`, `text` and `vector`. Indexing upserts six procedures. Reindexing the same model updates those IDs. Changing the model name selects another collection.

Submitting incidents does not insert incident embeddings into Milvus. SOPs support the incident assistant's retrieval. Inspect its retrieval label to distinguish Milvus retrieval from lexical fallback.

### MinIO evidence through its console

1. Run `docker port ppt_generation_service-minio-1` to find the console's published port.
2. Open that address, commonly http://localhost:9001.
3. Sign in with credentials valid on the existing MinIO server. The configured `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` can be used when that account has console access.
4. Open the bucket from `MINIO_BUCKET`, normally `sentinel-evidence`.
5. Inspect `incoming/` for submitted observations and `EVT-…/original.json` for incident evidence.
6. Download an object and compare its text with the submitted test observation.

The application creates the bucket during evidence writes when its account has permission. Otherwise, an administrator must create it and grant the required object permissions. The current System check also calls `list_buckets`, which requires bucket-listing permission.

### Temporal workflow UI

1. Open the shared Temporal UI, commonly http://localhost:8233.
2. Select namespace `sentinel-live`.
3. Submit an observation from Sentinel Overview.
4. Inspect the workflow beginning `sentinel-` and its `analyse_observation` activity.
5. Confirm completion, then inspect the result for `incidents`, `matched` and `ai_status`.

A submission response means the workflow was queued. Completion confirms activity processing. An idle healthy worker can produce no new log lines.

## Use each Sentinel page

| Page or action | How to use it |
|---|---|
| Overview | Review counts and submit new text using Analyze a new observation. The location map is schematic. |
| Incidents | Search and filter recorded incidents, open details, inspect reasons and related signals, and export the filtered records as JSON. |
| Threat modules | Review the six categories and launch supplied demonstration scenarios. |
| Intelligence | Read the procedure and evidence-oriented views provided by the frontend. |
| System | Refresh connection checks and index the supplied SOPs. |
| Run scenario | Add a prepared demonstration event. |
| New report | Submit an explicitly categorized demonstration incident with its own form. |
| Incident drawer | Read evidence, ask the assistant, inspect related signals and audit history, and record a status transition. |

For dynamic text analysis use **Overview → Analyze a new observation**. Select the observation type, enter location and text, keep **Interview simulation** checked for rehearsal, then click **Analyze observation**.

The form polls the workflow every two seconds for roughly three minutes. The incident list refreshes every 15 seconds. A completed response shows incident IDs or an empty-match message. If the polling period expires, inspect Temporal for the final result. Repeated clicks generate new upstream IDs and can create additional records.

To manage an incident, select its next available status, enter a note of at least three characters, and save the transition. In the API implementation, the operator performing the transition becomes its owner.

| Current status | Allowed next statuses |
|---|---|
| New | Acknowledged, Dismissed |
| Acknowledged | Investigating, Dismissed |
| Investigating | Escalated, Resolved, Dismissed |
| Escalated | Resolved |
| Resolved or Dismissed | Terminal state |

For assistant testing, open an incident and ask `Summarize the reported evidence, unknowns, and relevant SOP.` Inspect the answer, retrieval label and listed procedures. Compare the answer with the original observation. The assistant can fail independently when its model is unavailable.

## Test scenarios from the UI

Before each test, sign in as operator, open Overview, use **Analyze a new observation**, and keep **Interview simulation** checked. Use a distinctive location so your related-event results are easy to recognize. All expected priorities below assume the uploaded rules and no extra metrics.

### Test 1 — Reported bomb threat

- Select `email` and enter location `Demo Reception A`.
- Paste the following text and analyze it.

```text
INTERVIEW TEST. Reception received an email reporting a bomb threat
at Demo Reception A. The sender's claim requires verification.
```

Expected result is a Bomb threat incident. Its rule score is 65, classified High. Gemma may create an additional Early warning item when it returns a valid supporting quote. Review the original evidence and priority reasons.

### Test 2 — Aerial alert and correlation

- Select `aerial_alert` and enter `Demo Airfield North`.
- Submit `INTERVIEW TEST. An authorized monitoring feed reported aerial activity requiring operator review.`
- Submit another `aerial_alert` at exactly the same location within 30 minutes.
- Open either incident and inspect **Related signals**.

Each aerial alert has a fresh structured-alert score of 55, classified Medium. Correlation uses the location, a 30-minute window and matching simulation flags. This relationship requires human verification. Current UI observations receive their timestamp at submission. Testing a stale timestamp requires the webhook/API.

### Test 3 — Suspicious access activity

- Select `access_event` and enter `Demo Restricted Gate`.
- Check **Restricted zone**.
- Enter dwell time `420` seconds.
- Submit `INTERVIEW TEST. Access monitoring recorded prolonged presence at the restricted gate.`

Expected result is Suspicious activity with score 60, classified High. Reasons include dwell duration at least 300 seconds and the restricted-zone flag.

### Test 4 — Repeated authentication failures

- Select `login_failure`, location `Demo Login Service`, and account `demo-user-01`.
- Submit `INTERVIEW TEST. Authentication was rejected.`
- Wait for completion, then repeat until ten failures have completed within five minutes.
- Use the same account, location and simulation setting throughout.
- Select `login_success`, retain the same account, and submit `INTERVIEW TEST. Authentication was accepted after the recorded attempts.`

The tenth failure should report a count of ten and score 50, classified Medium. A following success with those ten failures should score 70, classified High. Inspect the downloaded evidence's `metrics` field. Sequential completion makes this interview test easier to verify. Concurrent or out-of-order input may affect the count.

### Test 5 — Network anomaly

- Select `network_anomaly` and enter `Demo Firewall`.
- Submit `INTERVIEW TEST. The firewall forwarded a network anomaly for operator review.`

Expected result is Cyberattack with a network-anomaly reason and score 35, classified Medium. This observation type accepts an upstream anomaly flag. To test the actual destination and denial thresholds, submit `network_sample` through the webhook, as shown later. The current UI does not expose those counters.

### Test 6 — Confirmed-source emergency

- Select `emergency` and enter `Demo Warehouse`.
- Check **Source reports confirmation**.
- Submit `INTERVIEW TEST. An emergency exercise reports smoke at Demo Warehouse and requests an operator acknowledgement.`

Expected result is Emergency with score 65, classified High. The source-confirmed checkbox is part of the supplied report. Complete New → Acknowledged → Investigating → Resolved with a note for each transition and inspect the audit entries.

### Test 7 — Early warning review

- Select `warning` and enter `Demo Gate B`.
- Submit `INTERVIEW TEST. Repeated attempts to enter a restricted zone were reported. The observation requires verification.`

Expected categories include Early warning and Suspicious activity because both trigger conditions occur. The Early warning rule scores 40, classified Medium. The Suspicious activity rule scores 35, classified Medium. Inspect each resulting incident separately.

### Test 8 — Routine message control

- Select `message` and enter `Demo Office`.
- Submit the text below.

```text
The project planning meeting is scheduled for tomorrow morning.
Please bring the updated delivery report.
```

Expected rule result is no matching category. Gemma can vary. A completed empty result displays **Analysis complete. No review rule matched.** Keyword screening can still flag benign text containing trigger terms, including quoted training material.

### Test 9 — Evidence and persistence

- Complete Test 1 and note its incident ID.
- Download original evidence from the incident drawer.
- Find the same ID in Adminer's `events` table and its path in MinIO.
- Perform a status transition with the note `Reviewed fictional interview evidence`.
- Refresh Adminer's `audit` table and inspect the matching event ID.
- Restart the Sentinel API and confirm the incident is still listed.

```bash
docker compose restart api
```

PostgreSQL and MinIO persistence depend on their existing volumes. The uploaded PostgreSQL service uses `postgres_data`.

### Test 10 — Semantic assistant

- Confirm Milvus and Ollama show Connected in System.
- Click **Index training SOPs** and inspect the six records in Attu.
- Open an incident and ask `Which approved procedure applies to this reported event? Summarize the next review steps.`
- Inspect the retrieval label for **Milvus cosine retrieval**, the source IDs and the answer.

A Connected status confirms a Milvus connection. Successful indexing and a Milvus retrieval response verify the retrieval path. A lexical warning points to a retrieval or model failure.

## Verify saved data

For a completed, matched observation, check all three relevant stores.

1. Sentinel shows an incident ID and the original input text.
2. Adminer shows that ID in `events` and its action history in `audit`.
3. MinIO contains the object's `evidence_key` recorded in PostgreSQL.
4. Temporal shows the completed workflow and returned incident IDs.
5. Attu continues showing the SOP collection. Its record count remains six after incident submissions unless you changed the indexing code.

Evidence JSON includes `metrics`, `raw_kind`, `upstream_id`, `simulated`, `ai_status` and `ai_evidence` for dynamically processed incidents. Download it when the UI does not show an internal analysis field.

## Connect webhooks and a mailbox

### Test an authenticated webhook

Run this from the project directory. It obtains the secret from the API environment without displaying it.

```bash
docker compose exec -T api python - <<'PY'
import os
import uuid
import httpx

response = httpx.post(
    'http://localhost:8000/api/live/webhook',
    headers={'X-Source-Key': os.environ['SOURCE_WEBHOOK_KEY']},
    json={
        'event_id': 'network-test-' + uuid.uuid4().hex,
        'source': 'interview-firewall',
        'kind': 'network_sample',
        'location': 'Demo Network',
        'text': 'INTERVIEW TEST. Firewall interval counters for review.',
        'destination_count': 75,
        'denied_connections': 35,
        'simulated': True,
    },
    timeout=60,
)
print(response.status_code, response.text)
response.raise_for_status()
PY
```

The counters exceed the default destination limit of 50 and denial limit of 30. Expect a Cyberattack item after workflow completion. Each sample should describe a consistent upstream observation interval. The application receives those counts from your integration.

External senders use `POST http://<reachable-host>:8088/api/live/webhook`, the same JSON structure, and the `X-Source-Key` header. The default loopback frontend binding serves local callers. Remote integrations need an intentionally configured reachable endpoint.

| Endpoint | Authentication | Purpose |
|---|---|---|
| `POST /api/auth/login` | Username and password JSON | Obtain a bearer token. |
| `POST /api/live/report` | Operator bearer token | Analyze a new observation. |
| `POST /api/live/webhook` | `X-Source-Key` | Accept an approved source observation. |
| `GET /api/live/jobs/{id}` | Operator bearer token | Read workflow status and completed result. |
| `GET /api/events` | User bearer token | Read recorded incidents. |
| `POST /api/knowledge/index` | Operator bearer token | Index the supplied procedures. |

Use a stable `source` and `event_id` when retrying the same upstream observation. Reusing them targets the same workflow ID while Temporal retains that execution. The database also deduplicates category events by source and source event ID. Source authentication does not automatically set the live payload's `verified_source` flag.

### Real email polling

The connector in `backend/app/mail.py` supports IMAP with STARTTLS. Configure a dedicated folder using `IMAP_HOST`, `IMAP_PORT`, `IMAP_FOLDER`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_POLL_SECONDS` and optional `IMAP_CA_FILE`.

For a Docker-reachable STARTTLS server, set `INGEST_URL=http://api:8000/api/live/webhook` and start the mail profile.

```bash
docker compose --profile mail up -d mail
docker compose logs -f mail
```

If your IMAP server uses a private CA, mount the trusted certificate into the mail container and set `IMAP_CA_FILE` to its container path.

For Proton Mail Bridge running locally on your Mac, use its generated IMAP password and trusted exported certificate. Running the connector on the Mac allows access to Bridge's loopback listener. Configure `.env` with its actual IMAP port, username, password, dedicated folder and an absolute certificate path, then run the following commands from the project directory.

```bash
python3 -m venv .venv-mail
.venv-mail/bin/python -m pip install httpx python-dotenv
cd backend
../.venv-mail/bin/python - <<'PY'
import os
import runpy
from dotenv import load_dotenv

load_dotenv('../.env', override=True)
os.environ['IMAP_HOST'] = '127.0.0.1'
os.environ['INGEST_URL'] = 'http://localhost:8088/api/live/webhook'
print('Polling configured mailbox. Press Control+C to stop.')
runpy.run_module('app.mail', run_name='__main__')
PY
```

Leave only one poller running for the test. Send a fictional test email, move it to the configured folder, and mark it unread. The poller forwards its subject and selected body text, then marks it read after API acceptance. Watch Sentinel for the completed incident.

The current mail connector defaults to `simulated=false` and location `Unknown`. It truncates text to 15,000 characters. It marks messages read after queue acceptance, so read status alone does not prove completed analysis. Its source identifier is `approved-mailbox`, and errors are logged by exception type. More detailed mailbox diagnostics require additional instrumentation.

## Operate and troubleshoot

### Routine commands

```bash
# Inspect application containers.
docker compose --profile vectors ps

# Inspect recent failures.
docker compose logs --since=2m --tail=100 frontend api worker milvus

# Follow workflow worker output.
docker compose logs -f worker

# Stop Sentinel while keeping its named volumes.
docker compose --profile vectors --profile mail stop

# Start services already created for this configuration.
docker compose --profile vectors up -d
```

The shared PPT MinIO and Temporal containers are managed separately. `docker compose down -v` removes this project's named volumes and deletes persisted PostgreSQL/Milvus/etcd data. Use ordinary stop/start commands for routine operation.

| Symptom | Check and corrective action |
|---|---|
| Temporal connection refused | Start the shared server, inspect its published port, and verify `TEMPORAL_ADDRESS` is reachable from the API container. |
| Namespace sentinel-live not found | Register it on the server the worker actually uses, then restart the worker. Repeat after an in-memory Temporal restart. |
| MinIO Unavailable | Inspect its running state, endpoint, loaded credentials, and bucket-listing permission. The System check hides the underlying exception. |
| Backend unavailable after API recreation | Recreate frontend to refresh its Nginx upstream connection. Inspect API and frontend logs after reproducing the request. |
| Milvus Disabled — lexical fallback | `VECTOR_ENABLED=false` is active. Enable it, start the vectors profile, recreate API and worker, then index the SOPs. |
| Milvus Unavailable | Inspect `milvus` and `etcd` logs and confirm Milvus can reach the shared MinIO endpoint with its credentials. |
| Ollama Model not pulled | Pull the exact value of `LLM_MODEL` on the configured Ollama server. |
| Indexing failed | Pull `EMBEDDING_MODEL`, confirm Ollama is reachable, and check Milvus readiness. |
| Submitted but no incident | Inspect workflow result. It may be queued, failed, or completed with no matching categories. |
| Adminer rejects password | Confirm the existing PostgreSQL user's actual password. Updating the environment alone does not update the role. |
| Mail SSL error | Check the trusted certificate, hostname, STARTTLS port and the certificate path visible to the poller. |
| Login window count differs | Use sequential events, the same account/source/simulation flag, and timestamps within the configured window. |

Check MinIO from the API and expose the underlying error privately.

```bash
docker compose exec api python -c 'from app.services import object_client; print([b.name for b in object_client().list_buckets()])'
```

Check Temporal TCP connectivity.

```bash
docker compose exec api python -c "import socket; s=socket.create_connection(('host.docker.internal',7233),5); print('Temporal TCP reachable'); s.close()"
```

Avoid posting `.env`, full container inspection output, or configuration dumps that include secrets.

## Implementation boundaries

- The system assists human triage. Operators verify allegations, source claims and response actions.
- Aerial input comes from supplied alerts or simulations. Integrating a physical detector requires an upstream system.
- The live language review is implemented for Ollama. Groq configuration applies to the incident assistant and requires explicit external-model opt-in.
- Keyword rules can flag negated, quoted or benign trigger terms. A valid AI quote supports inspection but does not establish credibility.
- Rule scores are review priorities. Current severity bands are Low below 35, Medium from 35, High from 60, and Critical from 80.
- `LOGIN_WINDOW_SECONDS`, network thresholds, AI timeout and worker activity concurrency are configurable. Several other thresholds remain in code, including ten login failures, 300-second dwell/staleness checks and the 30-minute correlation window.
- Related signals use matching reported locations, time proximity and simulation flags. They do not independently establish source corroboration.
- The UI refreshes periodically. Actual latency depends on queues, model speed and polling intervals.
- The shared webhook secret authenticates integrations collectively. Login counting scans incident records and has interview-scale concurrency and ordering limits.
- The uploaded `.gitignore` needs environment-file exclusions before repository publication. This README contains no active credentials.

## Suggested interview walkthrough

1. Show System connections and explain each store's role.
2. Submit the fictional bomb report using the live intake form.
3. Inspect the Temporal workflow and completed incident.
4. Show its original JSON in MinIO and its row in Adminer.
5. Demonstrate acknowledgement and audit history.
6. Submit two matching-location aerial alerts and inspect related signals.
7. Show six SOPs in Attu and ask the incident assistant a procedure question.
8. Submit the routine message control and discuss rule and model limitations.
