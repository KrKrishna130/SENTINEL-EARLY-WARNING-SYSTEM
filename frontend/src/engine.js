export const categories = [
  "Bomb threat",
  "Aerial alert",
  "Suspicious activity",
  "Cyberattack",
  "Emergency",
  "Early warning",
];
export const transitions = {
  New: ["Acknowledged", "Dismissed"],
  Acknowledged: ["Investigating", "Dismissed"],
  Investigating: ["Escalated", "Resolved", "Dismissed"],
  Escalated: ["Resolved"],
  Resolved: [],
  Dismissed: [],
};
export const sops = [
  {
    id: "SOP-01",
    title: "Reported bomb threat",
    text: "Preserve the original report. Notify the designated security operator. Record the reported location and time. Follow the approved site emergency plan; only authorised responders assess suspicious items.",
  },
  {
    id: "SOP-02",
    title: "Aerial sensor alert",
    text: "Verify source identity, timestamp and sensor status. Correlate independent authorised alerts. Clearly label simulated events and stale data. Escalate to the designated operator; this application does not identify or intercept aerial objects.",
  },
  {
    id: "SOP-03",
    title: "Unusual activity review",
    text: "Review the approved event evidence and device health. Check for maintenance or authorised activity. Avoid inferring criminal intent from appearance. Record reviewer findings and preserve relevant evidence.",
  },
  {
    id: "SOP-04",
    title: "Authentication anomaly",
    text: "Check identity-provider logs, success and failure counts, and maintenance context. Escalate suspicious account activity to the security team. Account restriction requires an authorised operator and the organisation incident procedure.",
  },
  {
    id: "SOP-05",
    title: "Emergency coordination",
    text: "Verify the incident with an authorised source. Record location, severity and response owner. Track acknowledgement and response actions. Use the established emergency communication channel.",
  },
  {
    id: "SOP-06",
    title: "Warning-sign triage",
    text: "Document observable warning signs and source reliability. Seek independent corroboration. Distinguish allegation from verified observation. Refer credible concerns for human review; do not claim to predict an attack.",
  },
];
export const templates = [
  {
    category: categories[0],
    title: "Reported package at East terminal",
    location: "East terminal",
    source: "Training email connector",
    text: "A training email reports a suspicious package near East terminal. No physical confirmation.",
    metrics: {},
    verified_source: false,
  },
  {
    category: categories[1],
    title: "Simulated aerial sensor alert",
    location: "North perimeter",
    source: "Simulated sensor feed",
    text: "Simulation: an authorised sensor gateway reports an aerial alert. Object type unverified.",
    metrics: { sensor_alert: true, age_seconds: 20, independent_reports: 2 },
    verified_source: true,
  },
  {
    category: categories[2],
    title: "Extended presence at restricted entrance",
    location: "East terminal",
    source: "Approved access-event simulator",
    text: "Synthetic access-event metadata records extended presence in a restricted zone.",
    metrics: { dwell_seconds: 420, restricted_zone: true },
    verified_source: true,
  },
  {
    category: categories[3],
    title: "Repeated failures followed by successful login",
    location: "Operations network",
    source: "Synthetic identity logs",
    text: "Account demo.operator: repeated login failures followed by successful authentication.",
    metrics: {
      failed_logins: 24,
      success_after_failures: true,
      network_anomaly: true,
    },
    verified_source: true,
  },
  {
    category: categories[4],
    title: "Confirmed smoke report in utility area",
    location: "Utility block",
    source: "Training incident desk",
    text: "Training exercise: an authorised facilities operator reports smoke; response owner required.",
    metrics: { confirmed: true },
    verified_source: true,
  },
  {
    category: categories[5],
    title: "Independent warning reports require review",
    location: "East terminal",
    source: "Training report desk",
    text: "Two synthetic reports describe an observable access-control concern. No attack is confirmed.",
    metrics: { warning_sign: true, independent_reports: 2 },
    verified_source: true,
  },
];
export function assess(e) {
  let score = 15;
  let reasons = [];
  let m = e.metrics || {};
  const add = (s, r) => {
    score += s;
    reasons.push(r);
  };
  switch (e.category) {
    case categories[0]:
      if (/\b(bomb|explosive|suspicious package|threat)\b/i.test(e.text))
        add(
          40,
          "Threat-related wording present; allegation requires verification",
        );
      if (e.location && e.location !== "Unknown")
        add(10, "Reported location supplied");
      break;
    case categories[1]:
      if (m.sensor_alert) add(40, "Structured sensor-alert flag supplied");
      if ((m.age_seconds || 0) > 300)
        add(-25, "Sensor report is stale (>5 minutes)");
      break;
    case categories[2]:
      if ((m.dwell_seconds || 0) >= 300)
        add(25, "Dwell duration exceeds demo threshold of 300 seconds");
      if (m.restricted_zone) add(20, "Event tagged in a restricted zone");
      break;
    case categories[3]:
      if ((m.failed_logins || 0) >= 10)
        add(35, "At least 10 failed logins in supplied window");
      if (m.success_after_failures)
        add(20, "Successful login follows repeated failures");
      if (m.network_anomaly) add(20, "Upstream network anomaly flag supplied");
      break;
    case categories[4]:
      add(30, "Emergency report requires operator acknowledgement");
      if (m.confirmed)
        add(20, "Source marks incident confirmed; operator must verify");
      break;
    default:
      if (m.warning_sign) add(25, "Observable warning-sign flag supplied");
  }
  if (e.verified_source) add(10, "Submitted through a trusted connector");
  if ((m.independent_reports || 0) >= 2)
    add(15, "Upstream claims multiple independent reports; review provenance");
  if (m.maintenance) {
    score = Math.max(10, score - 30);
    reasons.push("Maintenance context lowers demo priority");
  }
  score = Math.min(100, Math.max(0, score));
  return {
    score,
    severity:
      score >= 80
        ? "Critical"
        : score >= 60
          ? "High"
          : score >= 35
            ? "Medium"
            : "Low",
    reasons: reasons.length
      ? reasons
      : ["Insufficient signals; manual triage required"],
    sop: sops[categories.indexOf(e.category)].id,
  };
}
export function makeEvent(t, i = 0) {
  const date = new Date(Date.now() - i * 180000).toISOString();
  return {
    ...t,
    id: "EVT-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    source_event_id: crypto.randomUUID(),
    observed_at: date,
    created_at: date,
    status: "New",
    owner: "Unassigned",
    simulated: true,
    ...assess(t),
  };
}
const KEY = "sentinel-demo-v1";
export function readDemo() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));
    if (x?.events && x?.audit) return x;
  } catch {}
  return { events: templates.map(makeEvent), audit: {} };
}
export function saveDemo(x) {
  localStorage.setItem(KEY, JSON.stringify(x));
}
export const time = (x) =>
  new Date(x).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
export const download = (data, name) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
