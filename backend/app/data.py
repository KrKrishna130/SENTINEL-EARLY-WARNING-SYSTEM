from datetime import datetime, timezone, timedelta
from .rules import CATEGORIES


def scenarios():
    raw = [
        (
            "Bomb threat",
            "Reported package at East terminal",
            "East terminal",
            "Training email connector",
            "A training email reports a suspicious package near East terminal. No physical confirmation.",
            {},
            False,
        ),
        (
            "Aerial alert",
            "Simulated aerial sensor alert",
            "North perimeter",
            "Simulated sensor feed",
            "Simulation: an authorised sensor gateway reports an aerial alert. Object type unverified.",
            {"sensor_alert": True, "age_seconds": 20, "independent_reports": 2},
            True,
        ),
        (
            "Suspicious activity",
            "Extended presence at restricted entrance",
            "East terminal",
            "Approved access-event simulator",
            "Synthetic access-event metadata records extended presence in a restricted zone.",
            {"dwell_seconds": 420, "restricted_zone": True},
            True,
        ),
        (
            "Cyberattack",
            "Repeated failures followed by successful login",
            "Operations network",
            "Synthetic identity logs",
            "Account demo.operator: repeated login failures followed by successful authentication.",
            {
                "failed_logins": 24,
                "success_after_failures": True,
                "network_anomaly": True,
            },
            True,
        ),
        (
            "Emergency",
            "Confirmed smoke report in utility area",
            "Utility block",
            "Training incident desk",
            "Training exercise: an authorised facilities operator reports smoke; response owner required.",
            {"confirmed": True},
            True,
        ),
        (
            "Early warning",
            "Independent warning reports require review",
            "East terminal",
            "Training report desk",
            "Two synthetic reports describe an observable access-control concern. No attack is confirmed.",
            {"warning_sign": True, "independent_reports": 2},
            True,
        ),
    ]
    return [
        dict(
            category=c,
            title=t,
            location=l,
            source=s,
            text=x,
            metrics=m,
            verified_source=v,
            simulated=True,
            source_event_id=f"seed-{i}",
            observed_at=(
                datetime.now(timezone.utc) - timedelta(minutes=i * 3)
            ).isoformat(),
        )
        for i, (c, t, l, s, x, m, v) in enumerate(raw)
    ]
