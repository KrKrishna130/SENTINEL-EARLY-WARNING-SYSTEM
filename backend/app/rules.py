"""Transparent demonstration rules; scores are priorities, never probabilities."""

import re

CATEGORIES = [
    "Bomb threat",
    "Aerial alert",
    "Suspicious activity",
    "Cyberattack",
    "Emergency",
    "Early warning",
]
SOPS = [
    {
        "id": "SOP-01",
        "title": "Reported bomb threat",
        "text": "Preserve the original report. Notify the designated security operator. Record the reported location and time. Follow the approved site emergency plan; only authorised responders assess suspicious items.",
    },
    {
        "id": "SOP-02",
        "title": "Aerial sensor alert",
        "text": "Verify source identity, timestamp and sensor status. Correlate independent authorised alerts. Clearly label simulated events and stale data. Escalate to the designated operator; this application does not identify or intercept aerial objects.",
    },
    {
        "id": "SOP-03",
        "title": "Unusual activity review",
        "text": "Review the approved event evidence and device health. Check for maintenance or authorised activity. Avoid inferring criminal intent from appearance. Record reviewer findings and preserve relevant evidence.",
    },
    {
        "id": "SOP-04",
        "title": "Authentication anomaly",
        "text": "Check identity-provider logs, success and failure counts, and maintenance context. Escalate suspicious account activity to the security team. Account restriction requires an authorised operator and the organisation incident procedure.",
    },
    {
        "id": "SOP-05",
        "title": "Emergency coordination",
        "text": "Verify the incident with an authorised source. Record location, severity and response owner. Track acknowledgement and response actions. Use the established emergency communication channel.",
    },
    {
        "id": "SOP-06",
        "title": "Warning-sign triage",
        "text": "Document observable warning signs and source reliability. Seek independent corroboration. Distinguish allegation from verified observation. Refer credible concerns for human review; do not claim to predict an attack.",
    },
]


def assess(event):
    cat = event["category"]
    text = event.get("text", "").lower()
    metrics = event.get("metrics", {})
    score = 15
    reasons = []
    if cat == "Bomb threat":
        if re.search(r"\b(bomb|explosive|suspicious package|threat)\b", text):
            score += 40
            reasons.append(
                "Threat-related wording present; allegation requires verification"
            )
        if event.get("location") and event["location"] != "Unknown":
            score += 10
            reasons.append("Reported location supplied")
    elif cat == "Aerial alert":
        if metrics.get("sensor_alert"):
            score += 40
            reasons.append("Structured sensor-alert flag supplied")
        if metrics.get("age_seconds", 0) > 300:
            score -= 25
            reasons.append("Sensor report is stale (>5 minutes)")
    elif cat == "Suspicious activity":
        if metrics.get("dwell_seconds", 0) >= 300:
            score += 25
            reasons.append("Dwell duration exceeds demo threshold of 300 seconds")
        if metrics.get("restricted_zone"):
            score += 20
            reasons.append("Event tagged in a restricted zone")
    elif cat == "Cyberattack":
        if metrics.get("failed_logins", 0) >= 10:
            score += 35
            reasons.append("At least 10 failed logins in supplied window")
        if metrics.get("success_after_failures"):
            score += 20
            reasons.append("Successful login follows repeated failures")
        if metrics.get("network_anomaly"):
            score += 20
            reasons.append("Upstream network anomaly flag supplied")
    elif cat == "Emergency":
        score += 30
        reasons.append("Emergency report requires operator acknowledgement")
        if metrics.get("confirmed"):
            score += 20
            reasons.append("Source marks incident confirmed; operator must verify")
    else:
        if metrics.get("warning_sign"):
            score += 25
            reasons.append("Observable warning-sign flag supplied")
    if event.get("verified_source"):
        score += 10
        reasons.append("Submitted through a trusted connector")
    if metrics.get("independent_reports", 0) >= 2:
        score += 15
        reasons.append(
            "Upstream claims multiple independent reports; review provenance"
        )
    if metrics.get("maintenance"):
        score = max(10, score - 30)
        reasons.append("Maintenance context lowers demo priority")
    score = min(100, max(0, score))
    severity = (
        "Critical"
        if score >= 80
        else "High" if score >= 60 else "Medium" if score >= 35 else "Low"
    )
    return {
        "score": score,
        "severity": severity,
        "reasons": reasons or ["Insufficient signals; manual triage required"],
        "sop": SOPS[CATEGORIES.index(cat)]["id"],
        "label": "Rule priority, not attack probability",
    }


TRANSITIONS = {
    "New": ["Acknowledged", "Dismissed"],
    "Acknowledged": ["Investigating", "Dismissed"],
    "Investigating": ["Escalated", "Resolved", "Dismissed"],
    "Escalated": ["Resolved"],
    "Resolved": [],
    "Dismissed": [],
}
