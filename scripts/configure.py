"""Create ignored local configuration; never overwrites existing credentials."""

from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
p = root / ".env"
if p.exists():
    raise SystemExit(".env already exists; edit it directly. Nothing changed.")
text = (root / ".env.example").read_text()
for name in [
    "POSTGRES_PASSWORD",
    "SOURCE_WEBHOOK_KEY",
    "JWT_SECRET",
    "OPERATOR_PASSWORD",
    "VIEWER_PASSWORD",
    "MINIO_SECRET_KEY",
]:
    lines = text.splitlines()
    text = (
        "\n".join(
            (
                name + "=" + secrets.token_urlsafe(36)
                if line.startswith(name + "=")
                else line
            )
            for line in lines
        )
        + "\n"
    )
p.write_text(text)
p.chmod(0o600)
print("Created .env. Find OPERATOR_PASSWORD and VIEWER_PASSWORD there for API login.")
