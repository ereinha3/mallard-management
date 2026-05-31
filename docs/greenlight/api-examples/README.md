# Greenlight API Examples

Pretty-printed response payloads captured from a seeded offline TestClient run.

| File | Endpoint |
| --- | --- |
| `config.json` | `GET /api/v1/config` |
| `onboard-greenlight.json` | `POST /api/v1/onboard?user_email={email}` with `persona_greenlight.json` |
| `onboard-halt.json` | `POST /api/v1/onboard` with `persona_halt.json` |
| `portfolio.json` | `POST /api/v1/portfolio` with `persona_greenlight.json` |
| `projection.json` | `POST /api/v1/projection` with greenlight weights |
| `rebalance.json` | `POST /api/v1/rebalance` with `positions_demo.json` |
| `tax-report.json` | `POST /api/v1/tax/report` with `positions_demo.json` and its `cost_basis` |
| `profile.json` | `GET /api/v1/profile/{email}` after onboarding |
| `user-record.json` | `GET /api/v1/users/{email}/record` after onboarding |

Regenerate with: `python scripts/capture_api_examples.py`
