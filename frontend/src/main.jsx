import LiveIntake from "./LiveIntake";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  Shield,
  LayoutDashboard,
  Radio,
  ScanEye,
  Server,
  BookOpen,
  Activity,
  Bell,
  Search,
  Plus,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Clock,
  MapPin,
  FileText,
  X,
  Play,
  Download,
  Send,
  RefreshCw,
  LogOut,
  Lock,
  TriangleAlert,
  ExternalLink,
  Layers,
  CheckCircle2,
  Terminal,
  Filter,
  Globe,
  Network,
  Flame,
  Eye,
  Target,
  Menu,
} from "lucide-react";
import {
  categories,
  templates,
  transitions,
  sops,
  assess,
  makeEvent,
  readDemo,
  saveDemo,
  time,
  download,
} from "./engine";
import "./styles.css";
const icons = [TriangleAlert, Radio, ScanEye, Network, Flame, Eye];
const closed = (e) => ["Resolved", "Dismissed"].includes(e.status);
function App() {
  const [page, setPage] = useState("Overview"),
    [demo, setDemo] = useState(readDemo),
    [events, setEvents] = useState(demo.events),
    [token, setToken] = useState(
      sessionStorage.getItem("sentinel-token") || "",
    ),
    [role, setRole] = useState(
      sessionStorage.getItem("sentinel-role") || "operator",
    );
  const [mode, setMode] = useState(token ? "api" : "demo"),
    [selected, setSelected] = useState(null),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [status, setStatus] = useState("All"),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [system, setSystem] = useState(null),
    [audit, setAudit] = useState([]),
    [related, setRelated] = useState([]),
    [question, setQuestion] = useState("What should the operator review next?"),
    [answer, setAnswer] = useState(null),
    [note, setNote] = useState(""),
    [targetStatus, setTargetStatus] = useState(""),
    [mobile, setMobile] = useState(false);
  const [form, setForm] = useState({
      ...templates[0],
      metrics: JSON.stringify(templates[0].metrics, null, 2),
    }),
    [credentials, setCredentials] = useState({
      username: "operator",
      password: "",
    });
  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4500);
  };
  async function api(path, method = "GET", body) {
    const r = await fetch("/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let x;
    try {
      x = await r.json();
    } catch {
      throw Error(
        "Backend unavailable. Start the API or use the offline demo.",
      );
    }
    if (!r.ok)
      throw Error(
        typeof x.detail === "string" ? x.detail : JSON.stringify(x.detail || x),
      );
    return x;
  }
  async function load() {
    if (mode === "api") {
      try {
        setEvents(await api("/events"));
      } catch (e) {
        notify(e.message);
      }
    }
  }
  useEffect(() => {
    if (mode === "demo") setEvents(demo.events);
    else {
      setEvents([]);
      load();
    }
  }, [mode, demo]);
  useEffect(() => {
    if (mode !== "api") return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [mode, token]);
  useEffect(() => {
    saveDemo(demo);
  }, [demo]);
  useEffect(() => {
    if (!selected) return;
    setAnswer(null);
    setNote("");
    setTargetStatus("");
    if (mode === "demo") {
      setAudit(
        demo.audit[selected.id] || [
          {
            actor: "demo-seeder",
            action: "Ingested",
            note: "Synthetic evidence preserved for interview demonstration",
            created_at: selected.created_at,
          },
        ],
      );
      setRelated(
        events.filter(
          (e) =>
            e.id !== selected.id &&
            e.location === selected.location &&
            Math.abs(
              new Date(e.observed_at) - new Date(selected.observed_at),
            ) <= 1800000,
        ),
      );
    } else {
      Promise.all([
        api("/events/" + selected.id + "/audit"),
        api("/events/" + selected.id + "/related"),
      ])
        .then(([a, r]) => {
          setAudit(a);
          setRelated(r);
        })
        .catch((e) => notify(e.message));
    }
  }, [selected?.id, selected?.status, mode]);
  useEffect(() => {
    if (page === "System" && mode === "api")
      api("/system")
        .then(setSystem)
        .catch((e) => notify(e.message));
  }, [page, mode]);
  const active = events.filter((e) => !closed(e)),
    critical = active.filter((e) => e.severity === "Critical").length,
    high = active.filter((e) => e.severity === "High").length,
    reviewed = events.filter((e) => e.status !== "New").length;
  const filtered = events.filter(
    (e) =>
      (category === "All" || e.category === category) &&
      (status === "All" || e.status === status) &&
      [e.title, e.location, e.id, e.source]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const sorted = [...filtered].sort(
    (a, b) => Number(closed(a)) - Number(closed(b)) || b.score - a.score,
  );
  const canEdit = mode === "demo" || role === "operator";
  async function inject(i) {
    setBusy(true);
    try {
      if (mode === "api") {
        await api("/scenarios/" + i, "POST");
        await load();
      } else {
        const e = makeEvent(templates[i]);
        setDemo((d) => ({ ...d, events: [e, ...d.events] }));
      }
      notify("Synthetic scenario injected · " + categories[i]);
      setModal(null);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const metrics = JSON.parse(form.metrics);
      const bools = [
        "sensor_alert",
        "restricted_zone",
        "success_after_failures",
        "network_anomaly",
        "confirmed",
        "warning_sign",
        "maintenance",
      ];
      const nums = [
        "age_seconds",
        "dwell_seconds",
        "failed_logins",
        "independent_reports",
      ];
      if (!metrics || Array.isArray(metrics) || typeof metrics !== "object")
        throw Error("Metrics must be a JSON object");
      for (const [k, v] of Object.entries(metrics)) {
        if (bools.includes(k) && typeof v === "boolean") continue;
        if (
          nums.includes(k) &&
          typeof v === "number" &&
          Number.isFinite(v) &&
          v >= 0 &&
          v <= 1e9
        )
          continue;
        throw Error("Invalid metric: " + k);
      }
      const payload = {
        ...form,
        metrics,
        source_event_id: crypto.randomUUID(),
        observed_at: new Date().toISOString(),
        verified_source: false,
        simulated: true,
      };
      if (mode === "api") {
        await api("/events", "POST", payload);
        await load();
      } else {
        const event = makeEvent(payload);
        setDemo((d) => ({ ...d, events: [event, ...d.events] }));
      }
      setModal(null);
      notify("Report accepted and assessed");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function transition(e) {
    e.preventDefault();
    if (!targetStatus) return;
    setBusy(true);
    try {
      let updated;
      if (mode === "api") {
        updated = await api("/events/" + selected.id, "PATCH", {
          status: targetStatus,
          note,
        });
        await load();
      } else {
        updated = { ...selected, status: targetStatus, owner: "demo.operator" };
        const a = {
          actor: "demo.operator",
          action: targetStatus,
          note,
          created_at: new Date().toISOString(),
        };
        setDemo((d) => ({
          ...d,
          events: d.events.map((x) => (x.id === selected.id ? updated : x)),
          audit: {
            ...d.audit,
            [selected.id]: [...(d.audit[selected.id] || audit), a],
          },
        }));
      }
      setSelected(updated);
      notify("Incident " + targetStatus.toLowerCase());
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "api") {
        setAnswer(
          await api("/assistant", "POST", { question, event_id: selected.id }),
        );
      } else {
        const doc = sops[categories.indexOf(selected.category)];
        setAnswer({
          answer: "Demo extractive guidance: " + doc.text,
          provider: "Rules / extractive demo",
          retrieval: "Category-linked SOP",
          sources: [doc],
        });
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function evidence() {
    try {
      const x =
        mode === "api"
          ? await api("/events/" + selected.id + "/evidence")
          : {
              ...templates[categories.indexOf(selected.category)],
              ...selected,
            };
      download(x, selected.id + "-evidence.json");
    } catch (e) {
      notify(e.message);
    }
  }
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const x = await r.json();
      if (!r.ok) throw Error(x.detail || "Login failed");
      sessionStorage.setItem("sentinel-token", x.token);
      sessionStorage.setItem("sentinel-role", x.role);
      setToken(x.token);
      setRole(x.role);
      setMode("api");
      setModal(null);
      setSelected(null);
      notify("Connected to self-hosted API");
    } catch (e) {
      notify(e.message === "Unexpected token" ? "API unavailable" : e.message);
    } finally {
      setBusy(false);
    }
  }
  function go(p) {
    setPage(p);
    setCategory("All");
    setStatus("All");
    setSearch("");
    setMobile(false);
  }
  const Badge = ({ e }) => (
    <span className={"badge " + e.severity.toLowerCase()}>
      <i />
      {e.severity}
    </span>
  );
  const Table = ({ compact = false }) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>INCIDENT / SOURCE</th>
            <th>SEVERITY</th>
            <th>LOCATION</th>
            <th>STATUS</th>
            <th>REPORTED (IST)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(compact ? sorted.filter((e) => !closed(e)) : sorted)
            .slice(0, compact ? 5 : undefined)
            .map((e) => (
              <tr
                key={e.id}
                onClick={() => setSelected(e)}
                tabIndex={0}
                onKeyDown={(x) => {
                  if (x.key === "Enter") setSelected(e);
                }}
              >
                <td>
                  <div className="incident-title">{e.title}</div>
                  <div className="subline">
                    <span className="tiny-dot" />
                    {e.id} <span>·</span> {e.category}
                  </div>
                </td>
                <td>
                  <Badge e={e} />
                </td>
                <td className="location">{e.location}</td>
                <td>
                  <span className={"status " + e.status.toLowerCase()}>
                    {e.status === "New" && <i />}
                    {e.status}
                  </span>
                </td>
                <td className="muted mono">{time(e.observed_at)}</td>
                <td>
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {!(compact ? sorted.filter((e) => !closed(e)) : sorted).length && (
        <div className="empty">
          <Search />
          <h3>No matching incidents</h3>
          <p>Try another search or inject a training scenario.</p>
        </div>
      )}
    </div>
  );
  return (
    <div className="app">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("Overview");
          }}
        >
          <div className="brand-symbol">
            <Shield size={24} />
          </div>
          <span>
            SENTINEL EARLY WARNING SYSTEM<small>THREAT OPERATIONS</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            Security workspace<small>Self-hosted environment</small>
          </div>
          <Lock size={13} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ["Overview", LayoutDashboard],
            ["Incidents", Layers],
            ["Threat modules", ScanEye],
            ["Intelligence", BookOpen],
            ["System", Server],
          ].map(([p, I]) => (
            <button
              key={p}
              className={page === p ? "active" : ""}
              onClick={() => go(p)}
            >
              <I size={18} />
              {p}
              {p === "Incidents" && <b>{active.length}</b>}
            </button>
          ))}
        </nav>
        <div className="nav-label nav-second">OPERATIONS</div>
        <div className="side-metric">
          <span className="online" />
          Human review enabled
        </div>
        <div className="side-metric">
          <Lock size={13} />
          No autonomous response
        </div>
        <div className="sidebar-bottom">
          <div className="environment">
            <span className="online" />
            <div>
              {mode === "demo" ? "Offline demo" : "Self-hosted API"}
              <small>
                {mode === "demo"
                  ? "Synthetic data · local browser"
                  : "Authenticated · 15s refresh"}
              </small>
            </div>
          </div>
          <button
            className="profile"
            onClick={() =>
              mode === "demo"
                ? setModal("login")
                : (sessionStorage.clear(),
                  setToken(""),
                  setMode("demo"),
                  setSelected(null))
            }
          >
            <span className="avatar">KK</span>
            <div>
              Krishna Kumar
              <small>{mode === "demo" ? "Demo operator" : role}</small>
            </div>
            {mode === "demo" ? (
              <ExternalLink size={15} />
            ) : (
              <LogOut size={15} />
            )}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-tag">
              <i />
              {mode === "demo" ? "INTERVIEW DEMO" : "SELF-HOSTED DEMO"}
            </span>
            <button
              className="icon"
              title="Show pending incidents"
              onClick={() => {
                go("Incidents");
                setStatus("New");
              }}
            >
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
            <span className="avatar small">KK</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div className="eyebrow">
              <span className="online" /> SECURITY OPERATIONS CENTER
            </div>
            <div className="heading-row">
              <div>
                <h1>
                  {page === "Overview"
                    ? "Operational overview"
                    : page === "Incidents"
                      ? "Incident workspace"
                      : page === "Threat modules"
                        ? "Six signals. One workspace."
                        : page === "Intelligence"
                          ? "Evidence-led intelligence"
                          : "Your infrastructure. Your control."}
                </h1>
                <p>
                  {page === "Overview"
                    ? "A unified picture of your security environment. Every signal, connected."
                    : page === "Incidents"
                      ? "Review evidence, connect events, and coordinate the next action."
                      : page === "Threat modules"
                        ? "Transparent detection rules with an operator in every decision."
                        : page === "Intelligence"
                          ? "Approved procedures and explainable incident correlation."
                          : "Self-hosted services with explicit model and storage boundaries."}
                </p>
              </div>
              <div className="heading-buttons">
                <button
                  className="btn"
                  disabled={!canEdit}
                  onClick={() => setModal("simulate")}
                >
                  <Play size={15} />
                  Run scenario
                </button>
                <button
                  className="btn primary"
                  disabled={!canEdit}
                  onClick={() => setModal("report")}
                >
                  <Plus size={16} />
                  New report
                </button>
              </div>
            </div>
{page==="Overview" && mode==="api" && canEdit && <LiveIntake api={api} refresh={load}/>}

          </div>
          <div className="demo-notice">
            <Shield size={16} />
            <span>
              <b>{mode==="api" ? "Operator workspace" : "Training environment"}</b> {mode==="api" ? "Check the source and simulation label before taking action." : "Sample events are synthetic."} Scores indicate review priority.
            </span>
            <span className="notice-tail">HUMAN IN THE LOOP</span>
          </div>
          {page === "Overview" && (
            <>
              <section className="stats-grid">
                {[
                  [
                    active.length,
                    "Active incidents",
                    `${events.length} total signals`,
                    Activity,
                    "blue",
                  ],
                  [
                    critical,
                    "Critical priority",
                    "Immediate operator review",
                    TriangleAlert,
                    "red",
                  ],
                  [
                    high,
                    "High priority",
                    "Awaiting investigation",
                    Shield,
                    "amber",
                  ],
                  [
                    reviewed,
                    "Reviewed incidents",
                    `${events.filter((e) => closed(e)).length} resolved or dismissed`,
                    CheckCircle2,
                    "green",
                  ],
                ].map(([n, l, h, I, c]) => (
                  <div className={"stat " + c} key={l}>
                    <div className="stat-top">
                      <span>{l}</span>
                      <I size={18} />
                    </div>
                    <strong>{String(n).padStart(2, "0")}</strong>
                    <div className="stat-bottom">
                      <span className="stat-indicator" />
                      {h}
                    </div>
                  </div>
                ))}
              </section>
              <div className="overview-grid">
                <section className="panel situation">
                  <div className="panel-heading">
                    <div>
                      <h2>Security landscape</h2>
                      <p>Simulated campus · schematic event locations</p>
                    </div>
                    <span className="live-label">
                      <i />
                      LIVE WORKSPACE
                    </span>
                  </div>
                  <div className="map">
                    <svg
                      className="campus"
                      viewBox="0 0 820 320"
                      role="img"
                      aria-label="Schematic campus showing four event zones, not geographic coordinates"
                    >
                      <defs>
                        <pattern
                          id="grid"
                          width="26"
                          height="26"
                          patternUnits="userSpaceOnUse"
                        >
                          <path
                            d="M 26 0 L 0 0 0 26"
                            fill="none"
                            stroke="#24303c"
                            strokeWidth=".6"
                          />
                        </pattern>
                        <linearGradient id="road">
                          <stop stopColor="#263441" />
                          <stop offset="1" stopColor="#1e2a35" />
                        </linearGradient>
                      </defs>
                      <rect width="820" height="320" fill="url(#grid)" />
                      <path
                        d="M0 230H820 M185 0V320 M510 0V320 M0 85H820"
                        stroke="url(#road)"
                        strokeWidth="22"
                      />
                      <path
                        d="M0 230H820 M185 0V320 M510 0V320 M0 85H820"
                        stroke="#3b4a56"
                        strokeWidth="1"
                        strokeDasharray="8 8"
                      />
                      {[
                        [230, 115, 100, 75],
                        [350, 115, 115, 75],
                        [550, 115, 75, 80],
                        [650, 115, 110, 40],
                        [40, 115, 100, 75],
                        [230, 265, 230, 40],
                        [560, 260, 170, 45],
                        [40, 20, 100, 40],
                        [250, 20, 210, 40],
                      ].map(([x, y, w, h], i) => (
                        <g key={i}>
                          <rect
                            x={x}
                            y={y}
                            width={w}
                            height={h}
                            rx="3"
                            fill="#1e2b36"
                            stroke="#34434f"
                          />
                          <path
                            d={`M${x + 8} ${y + 8}h${w - 16}v${h - 16}h-${w - 16}z`}
                            fill="none"
                            stroke="#293945"
                          />
                        </g>
                      ))}
                      <text
                        x="20"
                        y="310"
                        fill="#60717f"
                        fontSize="11"
                        fontFamily="monospace"
                      >
                        SCHEMATIC / NOT A GEOGRAPHIC MAP
                      </text>
                    </svg>
                    {[
                      { name: "North perimeter", x: 53, y: 17 },
                      { name: "East terminal", x: 78, y: 60 },
                      { name: "Operations network", x: 38, y: 53 },
                      { name: "Utility block", x: 20, y: 77 },
                    ].map((z) => {
                      const es = active.filter((e) => e.location === z.name);
                      return (
                        <button
                          key={z.name}
                          className={
                            "map-point " +
                            (es.some((e) => e.severity === "Critical")
                              ? "red"
                              : "")
                          }
                          style={{ left: z.x + "%", top: z.y + "%" }}
                          onClick={() => {
                            go("Incidents");
                            setSearch(z.name);
                          }}
                          title={"Filter " + z.name}
                        >
                          <span className="map-ping">
                            <i />
                            {es.length > 0 && <b>{es.length}</b>}
                          </span>
                          <span className="map-label">{z.name}</span>
                        </button>
                      );
                    })}
                    <div className="map-compass">
                      N<ArrowUpRight size={17} />
                    </div>
                  </div>
                  <div className="map-footer">
                    <span>
                      <i className="legend-dot red" />
                      Critical
                    </span>
                    <span>
                      <i className="legend-dot amber" />
                      Review required
                    </span>
                    <span className="right">
                      <Lock size={12} />
                      Authorised sources only
                    </span>
                  </div>
                </section>
                <section className="panel feed">
                  <div className="panel-heading">
                    <div>
                      <h2>Signal distribution</h2>
                      <p>All ingested events by module</p>
                    </div>
                    <Activity size={18} />
                  </div>
                  <div className="distribution">
                    {categories.map((c, i) => {
                      const I = icons[i],
                        n = events.filter((e) => e.category === c).length;
                      return (
                        <button
                          key={c}
                          onClick={() => {
                            go("Incidents");
                            setCategory(c);
                          }}
                        >
                          <I size={16} />
                          <div>
                            <span>{c}</span>
                            <div className="bar-track">
                              <i
                                style={{
                                  width:
                                    Math.max(
                                      3,
                                      (n / Math.max(1, events.length)) * 100,
                                    ) + "%",
                                  background: [
                                    "#f4b167",
                                    "#829df6",
                                    "#55c4b0",
                                    "#b39af4",
                                    "#ee8d94",
                                    "#70baf2",
                                  ][i],
                                }}
                              />
                            </div>
                          </div>
                          <strong>{String(n).padStart(2, "0")}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="feed-footer">
                    <span className="online" />
                    All 6 modules available
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Priority queue{" "}
                      <span className="count">{active.length}</span>
                    </h2>
                    <p>Highest-priority signals awaiting operator review</p>
                  </div>
                  <button className="text-btn" onClick={() => go("Incidents")}>
                    View all incidents <ArrowUpRight size={15} />
                  </button>
                </div>
                <Table compact />
              </section>
              <div className="bottom-strip">
                <div className="strip-icon">
                  <Shield size={22} />
                </div>
                <div>
                  <h3>Intelligence supports the decision. You make it.</h3>
                  <p>
                    Review sources, validate context, and record every response
                    action.
                  </p>
                </div>
                <button className="text-btn" onClick={() => go("Intelligence")}>
                  Explore procedures <ArrowUpRight size={16} />
                </button>
              </div>
            </>
          )}
          {page === "Incidents" && (
            <section className="panel">
              <div className="filterbar">
                <label className="search">
                  <Search size={16} />
                  <input
                    placeholder="Search incidents, locations, sources…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>All</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option>All</option>
                  {Object.keys(transitions).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  className="btn"
                  onClick={() => download(filtered, "sentinel-incidents.json")}
                >
                  <Download size={15} />
                  Export
                </button>
              </div>
              <div className="result-count">
                {filtered.length} incidents · select a row to review
              </div>
              <Table />
            </section>
          )}
          {page === "Threat modules" && (
            <div className="module-grid">
              {categories.map((c, i) => {
                const I = icons[i],
                  count = events.filter((e) => e.category === c).length;
                return (
                  <section className="panel module" key={c}>
                    <div className="module-top">
                      <span className={"module-icon color-" + i}>
                        <I size={24} />
                      </span>
                      <span className="enabled">
                        <i />
                        ENABLED
                      </span>
                    </div>
                    <h2>{c}</h2>
                    <p>
                      {
                        [
                          "Reported threats in email, messages, and incident reports. Allegations remain unverified.",
                          "Authorised or simulated sensor events. No radar processing or missile identification.",
                          "Approved event metadata: dwell time, zone flags, and maintenance context. No identity profiling.",
                          "Failed logins, success-after-failures, and upstream network-anomaly signals.",
                          "Confirmed-report flags, ownership, response status, and auditable actions.",
                          "Observable warning signs and reported corroboration, referred for human review.",
                        ][i]
                      }
                    </p>
                    <div className="module-rule">
                      <Terminal size={14} />
                      {
                        [
                          "Threat wording + reported location",
                          "Sensor flag + freshness + provenance",
                          "Dwell ≥ 300s + restricted-zone flag",
                          "Failures ≥ 10 + success/anomaly flags",
                          "Emergency report + confirmation flag",
                          "Warning flag + source corroboration",
                        ][i]
                      }
                    </div>
                    <div className="module-bottom">
                      <span>
                        <b>{count}</b> signals ingested
                      </span>
                      <button
                        className="text-btn"
                        disabled={!canEdit || busy}
                        onClick={() => inject(i)}
                      >
                        Simulate <Play size={14} />
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {page === "Intelligence" && (
            <>
              <div className="intelligence-banner">
                <div>
                  <span className="eyebrow">EVIDENCE BEFORE INFERENCE</span>
                  <h2>
                    A second pair of eyes.
                    <br />
                    An accountable human decision.
                  </h2>
                  <p>
                    Retrieve procedures, review source material, and trace
                    related reports. Open an incident to use the assistant with
                    its evidence.
                  </p>
                  <button
                    className="btn primary"
                    onClick={() => go("Incidents")}
                  >
                    Open incident workspace <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="intel-orbit">
                  <Shield size={58} />
                  <span className="orbit-tag one">
                    <FileText size={14} />
                    Evidence
                  </span>
                  <span className="orbit-tag two">
                    <BookOpen size={14} />
                    Procedures
                  </span>
                  <span className="orbit-tag three">
                    <Eye size={14} />
                    Human review
                  </span>
                </div>
              </div>
              <div className="section-label">
                <h2>Procedure library</h2>
                <span>
                  6 bundled training SOPs · replace with approved site
                  procedures
                </span>
              </div>
              <div className="sop-grid">
                {sops.map((s) => (
                  <section className="panel sop" key={s.id}>
                    <span className="sop-id">
                      <BookOpen size={15} />
                      {s.id}
                    </span>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </section>
                ))}
              </div>
            </>
          )}
          {page === "System" && (
            <>
              <div className="system-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Service connections</h2>
                      <p>
                        {mode === "demo"
                          ? "Offline preview — no infrastructure connections claimed"
                          : "Live backend health probes"}
                      </p>
                    </div>
                    <button
                      className="icon"
                      aria-label="Refresh service checks"
                      onClick={() =>
                        mode === "api"
                          ? api("/system")
                              .then(setSystem)
                              .catch((e) => notify(e.message))
                          : notify("Offline demo: services are not connected")
                      }
                    >
                      <RefreshCw size={17} />
                    </button>
                  </div>
                  {(mode === "demo"
                    ? [
                        {
                          name: "PostgreSQL",
                          status: "Not connected — browser demo",
                        },
                        {
                          name: "MinIO evidence",
                          status: "Not connected — browser demo",
                        },
                        {
                          name: "Milvus vectors",
                          status: "Not connected — browser demo",
                        },
                        {
                          name: "Qwen / Gemma",
                          status: "Not connected — extractive demo",
                        },
                      ]
                    : system?.checks || []
                  ).map((x) => (
                    <div className="service-row" key={x.name}>
                      <Server size={18} />
                      <strong>{x.name}</strong>
                      <span
                        className={
                          "service-state " +
                          (x.status === "Connected" ? "connected" : "")
                        }
                      >
                        {x.status}
                      </span>
                    </div>
                  ))}
                  <div className="system-foot">
                    {mode === "demo" ? (
                      <button
                        className="btn primary"
                        onClick={() => setModal("login")}
                      >
                        <Lock size={15} />
                        Connect self-hosted API
                      </button>
                    ) : (
                      <button
                        className="btn"
                        disabled={!canEdit || busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const x = await api("/knowledge/index", "POST");
                            notify("Indexed " + x.indexed + " SOPs in Milvus");
                          } catch (e) {
                            notify(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <RefreshCw size={15} />
                        Index training SOPs
                      </button>
                    )}
                  </div>
                </section>
                <section className="panel controls">
                  <h2>Deployment boundaries</h2>
                  {[
                    ["Storage", "MinIO evidence + PostgreSQL records"],
                    ["Semantic search", "Milvus + local embedding model"],
                    ["Inference", "Local Ollama: Qwen or Gemma"],
                    [
                      "Optional external provider",
                      "Groq; server-side opt-in required",
                    ],
                    ["Decision boundary", "Operator approves response actions"],
                    [
                      "Demo persistence",
                      "Browser localStorage; not server storage",
                    ],
                  ].map(([a, b]) => (
                    <div key={a}>
                      <small>{a}</small>
                      <p>{b}</p>
                    </div>
                  ))}
                </section>
              </div>
              <section className="panel architecture">
                <h2>Data flow</h2>
                <p>
                  Ingest → preserve original evidence → assess rules → correlate
                  by location and time → retrieve SOPs → human review → record
                  response.
                </p>
                <span className="muted">
                  The downloadable project includes the API, Docker
                  configuration, local model adapters, tests, and an interview
                  walkthrough.
                </span>
              </section>
              {mode === "demo" && (
                <button
                  className="btn danger"
                  onClick={() => setModal("reset")}
                >
                  Reset local demo data
                </button>
              )}
            </>
          )}
          <footer>
            <span>
              <Shield size={12} /> SENTINEL · SECURITY OPERATIONS
            </span>
            <span>
              Demo build 1.0 <i /> Designed for human judgement
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span className="eyebrow">INCIDENT REVIEW</span>
              <button
                className="icon"
                aria-label="Close incident"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-content">
              <div className="detail-id">
                {selected.id} <span>{selected.simulated ? "SIMULATED" : "LIVE REPORT"}</span>
              </div>
              <h2>{selected.title}</h2>
              <div className="detail-badges">
                <Badge e={selected} />
                <span className="status">{selected.status}</span>
              </div>
              <div className="detail-meta">
                <span>
                  <MapPin size={14} />
                  {selected.location}
                </span>
                <span>
                  <Clock size={14} />
                  {time(selected.observed_at)}
                </span>
              </div>
              <div className="score-box">
                <div>
                  <span>Rule priority</span>
                  <b>
                    {selected.score}
                    <small>/100</small>
                  </b>
                </div>
                <p>Review ordering only. Not a probability of an attack.</p>
                <div className="score-track">
                  <i style={{ width: selected.score + "%" }} />
                </div>
              </div>
              <section className="detail-section">
                <h3>
                  <FileText size={16} />
                  Source evidence
                </h3>
                <p className="quote">{selected.text}</p>
                <div className="source-meta">
                  {selected.source}
                  <br />
                  {selected.verified_source
                    ? "Trusted simulator connector"
                    : "Unverified report source"}{" "}
                  · {selected.owner}
                </div>
                <button className="text-btn" onClick={evidence}>
                  Download original evidence <Download size={14} />
                </button>
                {selected.evidence_hash && (
                  <p className="hash">SHA-256: {selected.evidence_hash}</p>
                )}
              </section>
              <section className="detail-section">
                <h3>
                  <ScanEye size={16} />
                  Why this was flagged
                </h3>
                {selected.reasons.map((r) => (
                  <div className="reason" key={r}>
                    <Check size={14} />
                    <span>{r}</span>
                  </div>
                ))}
                <details>
                  <summary>Structured event metrics</summary>
                  <pre>{JSON.stringify(selected.metrics, null, 2)}</pre>
                </details>
              </section>
              <section className="detail-section">
                <h3>
                  <Network size={16} />
                  Related signals{" "}
                  <span className="count">{related.length}</span>
                </h3>
                <p className="muted">
                  Same reported location within 30 minutes. A match does not
                  establish a shared cause.
                </p>
                {related.map((r) => (
                  <button
                    className="related"
                    key={r.id}
                    onClick={() => setSelected(r)}
                  >
                    <span>
                      {r.title}
                      <small>
                        {r.category} · {time(r.observed_at)}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </section>
              <section className="detail-section">
                <h3>
                  <BookOpen size={16} />
                  Procedure assistant
                </h3>
                <p className="muted">
                  {mode === "demo"
                    ? "Extractive demo; no LLM is connected."
                    : "Uses the provider configured on your server."}
                </p>
                <form onSubmit={ask} className="assistant-form">
                  <input
                    aria-label="Assistant question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                  <button
                    className="icon"
                    disabled={busy}
                    aria-label="Ask assistant"
                  >
                    <Send size={17} />
                  </button>
                </form>
                {answer && (
                  <div className="answer">
                    <span className="sop-id">{answer.provider}</span>
                    <p>{answer.answer}</p>
                    <small>{answer.retrieval}</small>
                    {answer.warning && (
                      <p className="warning">{answer.warning}</p>
                    )}
                    <div>
                      {answer.sources.map((s) => (
                        <details key={s.id}>
                          <summary>
                            {s.id} · {s.title}
                          </summary>
                          <p>{s.text}</p>
                        </details>
                      ))}
                    </div>
                    <p className="muted">
                      Validate generated statements against these source
                      excerpts.
                    </p>
                  </div>
                )}
              </section>
              <section className="detail-section">
                <h3>
                  <Activity size={16} />
                  Response actions
                </h3>
                {transitions[selected.status]?.length ? (
                  <form onSubmit={transition}>
                    <select
                      required
                      value={targetStatus}
                      onChange={(e) => setTargetStatus(e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">Choose next status…</option>
                      {transitions[selected.status].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <textarea
                      placeholder="Record your review or response action…"
                      required
                      minLength={3}
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={!canEdit}
                    />
                    <button
                      className="btn primary full"
                      disabled={!canEdit || busy}
                    >
                      Save response action <Check size={15} />
                    </button>
                  </form>
                ) : (
                  <p className="muted">
                    This incident is closed. Its history remains available.
                  </p>
                )}
              </section>
              <section className="detail-section">
                <h3>
                  <Clock size={16} />
                  Audit trail
                </h3>
                <div className="timeline">
                  {audit.map((a, i) => (
                    <div key={i}>
                      <i />
                      <b>{a.action}</b>
                      <small>
                        {a.actor} · {time(a.created_at)}
                      </small>
                      <p>{a.note}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className={"modal " + (modal === "simulate" ? "wide" : "")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">TRAINING WORKSPACE</span>
                <h2>
                  {modal === "simulate"
                    ? "Choose a scenario"
                    : modal === "report"
                      ? "Create a training report"
                      : modal === "login"
                        ? "Connect your server"
                        : "Reset demo workspace?"}
                </h2>
              </div>
              <button
                className="icon"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <X size={20} />
              </button>
            </div>
            {modal === "simulate" ? (
              <>
                <p className="muted">
                  Inject a synthetic event to demonstrate detection, triage, and
                  response.
                </p>
                <div className="scenario-list">
                  {templates.map((t, i) => {
                    const I = icons[i];
                    return (
                      <button
                        disabled={busy}
                        key={t.category}
                        onClick={() => inject(i)}
                      >
                        <span className={"module-icon color-" + i}>
                          <I size={22} />
                        </span>
                        <div>
                          <b>{t.category}</b>
                          <small>{t.title}</small>
                        </div>
                        <Play size={17} />
                      </button>
                    );
                  })}
                </div>
              </>
            ) : modal === "report" ? (
              <form onSubmit={create}>
                <label>
                  Threat module
                  <select
                    value={form.category}
                    onChange={(e) => {
                      const t = templates[categories.indexOf(e.target.value)];
                      setForm({
                        ...t,
                        metrics: JSON.stringify(t.metrics, null, 2),
                      });
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Report title
                  <input
                    required
                    minLength={3}
                    maxLength={180}
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                  />
                </label>
                <div className="form-row">
                  <label>
                    Reported location
                    <input
                      required
                      maxLength={160}
                      value={form.location}
                      onChange={(e) =>
                        setForm({ ...form, location: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Source
                    <input
                      required
                      maxLength={160}
                      value={form.source}
                      onChange={(e) =>
                        setForm({ ...form, source: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Original report
                  <textarea
                    required
                    minLength={5}
                    maxLength={15000}
                    value={form.text}
                    onChange={(e) => setForm({ ...form, text: e.target.value })}
                  />
                </label>
                <label>
                  Structured metrics (JSON)
                  <textarea
                    className="mono"
                    value={form.metrics}
                    onChange={(e) =>
                      setForm({ ...form, metrics: e.target.value })
                    }
                  />
                </label>
                <p className="muted">
                  Manual reports are unverified. All data in this demo is
                  labelled synthetic.
                </p>
                <button disabled={busy} className="btn primary full">
                  {busy ? "Processing…" : "Preserve evidence & assess report"}
                  <ArrowUpRight size={16} />
                </button>
              </form>
            ) : modal === "login" ? (
              <form onSubmit={login}>
                <p className="muted">
                  Start the included backend, then connect through the same
                  host. Credentials stay in this browser session.
                </p>
                <label>
                  Role
                  <select
                    value={credentials.username}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        username: e.target.value,
                      })
                    }
                  >
                    <option>operator</option>
                    <option>viewer</option>
                  </select>
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    required
                    value={credentials.password}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        password: e.target.value,
                      })
                    }
                  />
                </label>
                <button className="btn primary full" disabled={busy}>
                  Connect API <Lock size={15} />
                </button>
              </form>
            ) : (
              <>
                <p>
                  This clears only offline browser incidents and response
                  history. Server records are unaffected.
                </p>
                <button
                  className="btn danger full"
                  onClick={() => {
                    localStorage.removeItem("sentinel-demo-v1");
                    setDemo(readDemo());
                    setSelected(null);
                    setModal(null);
                    notify("Local demo reset");
                  }}
                >
                  Reset offline demo
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Activity size={16} />
          {toast}
          <button
            className="icon"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
