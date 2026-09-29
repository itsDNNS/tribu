import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Copy,
  HeartPulse,
  KeyRound,
  Link,
  Monitor,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../../contexts/AppContext";
import { useToast } from "../../contexts/ToastContext";
import { copyTextToClipboard, parseServerInstant } from "../../lib/helpers";
import { t, tc } from "../../lib/i18n";
import { localeForLang } from "../../lib/dates";
import * as api from "../../lib/api";
import MemberAvatar from "../MemberAvatar";
import MemberEditor from "./MemberEditor";
import AdminDialog from "./AdminDialog";
import InviteSection from "./InviteSection";
import DisplaysSection from "./DisplaysSection";
import SsoSection from "./SsoSection";
import BackupSection from "./BackupSection";
import SystemSection from "./SystemSection";
import AuditLogSection from "./AuditLogSection";
import { adminText, invitationState, auditAction } from "./adminHelpers";

const TABS = [
  ["members", "admin_tab_members", Users],
  ["invites", "invite_title", Link],
  ["displays", "display_title", Monitor],
  ["sso", "sso.title", KeyRound],
  ["backups", "backup_title", Archive],
  ["system", "system_title", HeartPulse],
  ["audit", "audit_log_title", Activity],
];

// A family switch must discard dialogs, secrets and pending family-specific state.
export default function AdminView(props) {
  const { familyId } = useApp();
  return <AdminPage key={familyId} {...props} />;
}

function AdminPage(props) {
  const {
    familyId,
    members,
    messages,
    loadMembers,
    me,
    demoMode,
    timeFormat,
    setTimeFormat,
    lang,
    setActiveView,
  } = useApp();
  const { error: toastError } = useToast();
  const copy = (key) => adminText(messages, key);
  // Settings › Family opens a section directly.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "members";
    const requested = sessionStorage.getItem("tribu_admin_tab");
    return TABS.some(([key]) => key === requested) ? requested : "members";
  });
  useEffect(() => sessionStorage.removeItem("tribu_admin_tab"), []);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(undefined);
  const [help, setHelp] = useState(false);
  const [inviteRequest, setInviteRequest] = useState(0);
  const [password, setPassword] = useState(null);
  const [copied, setCopied] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [summary, setSummary] = useState({
    invites: null,
    displays: null,
    latest: null,
  });
  const [summaryError, setSummaryError] = useState(false);
  const [timeBusy, setTimeBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (demoMode) return;
    async function load() {
      const results = await Promise.allSettled([
        api.apiGetInvitations(familyId),
        api.apiListDisplayDevices(familyId),
        api.apiGetAuditLog(familyId, 1, 0),
      ]);
      if (!alive) return;
      const data = results.map((r) =>
        r.status === "fulfilled" && r.value?.ok ? r.value.data : null,
      );
      setSummary({
        invites: Array.isArray(data[0])
          ? data[0].filter((i) => invitationState(i) === "active").length
          : null,
        displays: Array.isArray(data[1])
          ? data[1].filter((d) => !d.revoked_at).length
          : null,
        latest: data[2]?.items?.[0] || null,
      });
      setSummaryError(data.some((d) => d === null));
    }
    load();
    return () => {
      alive = false;
    };
  }, [familyId, demoMode, refresh, activeTab]);

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const visible = members.filter((m) =>
      `${m.display_name} ${m.email || ""}`.toLocaleLowerCase().includes(needle),
    );
    const rank = (m) => (m.role === "owner" ? 0 : m.role === "admin" ? 1 : 2);
    visible.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.display_name || "").localeCompare(b.display_name || ""),
    );
    return [
      ["adults", "member_group_adults", visible.filter((m) => m.is_adult)],
      ["children", "member_group_children", visible.filter((m) => !m.is_adult)],
    ].filter(([key]) => filter === "all" || filter === key);
  }, [members, query, filter]);
  const count = groups.reduce((n, group) => n + group[2].length, 0);
  const metrics = [
    [members.length, "members_count", Users, "", "members"],
    [
      members.filter((m) => ["admin", "owner"].includes(m.role)).length,
      "admins_count",
      ShieldCheck,
      "",
      "members",
    ],
    [summary.invites, "invites_count", Link, "blue", "invites"],
    [summary.displays, "displays_count", Monitor, "green", "displays"],
  ];
  async function changed() {
    await loadMembers();
    setRefresh((n) => n + 1);
  }
  async function changeTime(value) {
    if (timeBusy) return;
    setTimeBusy(true);
    try {
      const { ok } = await api.apiSetTimeFormat(value);
      if (ok) setTimeFormat(value);
      else toastError(t(messages, "toast.error"));
    } catch {
      toastError(t(messages, "toast.error"));
    } finally {
      setTimeBusy(false);
    }
  }
  function invite() {
    setActiveTab("invites");
    setInviteRequest((n) => n + 1);
  }

  return (
    <div className="admin-page dashboard-today-page mockup-admin-page">
      <section className="fam-page" aria-label={copy("title")}>
        {/* Family administration is part of Settings › Family (Tribu 2.0, X3). */}
        <button
          type="button"
          className="fam-button admin-back"
          onClick={() => setActiveView("settings")}
        >
          <ArrowLeft size={14} />
          {t(messages, "settings_mockup_overview")}
        </button>
        <header className="fam-header">
          <div className="fam-title">
            <span className="fam-badge admin-page-icon">
              <ShieldCheck size={25} />
            </span>
            <div>
              <h1>{copy("title")}</h1>
              <p>{copy("subtitle")}</p>
            </div>
          </div>
          <div className="fam-header-actions">
            <button className="fam-button" disabled={demoMode} onClick={invite}>
              <Link size={16} />
              {copy("invite")}
            </button>
            <button
              className="fam-button primary"
              disabled={demoMode}
              onClick={() => setEditor(null)}
            >
              <Plus size={16} />
              {t(messages, "add_member")}
            </button>
          </div>
        </header>
        <nav className="fam-tabs" aria-label={t(messages, "admin_sections")}>
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              className={`fam-tab${activeTab === key ? " active" : ""}`}
              aria-current={activeTab === key ? "page" : undefined}
              onClick={() => setActiveTab(key)}
            >
              <Icon size={18} />
              <span>{t(messages, label)}</span>
              {key === "invites" && summary.invites > 0 && (
                <em aria-hidden="true">{summary.invites}</em>
              )}
            </button>
          ))}
        </nav>
        {password && (
          <div className="adm-success-banner" role="status">
            <strong>
              <Check size={16} />{" "}
              {t(
                messages,
                password.type === "reset"
                  ? "password_was_reset"
                  : "member_created",
              )}
            </strong>
            <p>{t(messages, "member_created_warning")}</p>
            <div className="adm-banner-row">
              <code className="token-display">{password.value}</code>
              <button
                className="fam-button"
                onClick={async () => {
                  if (await copyTextToClipboard(password.value))
                    setCopied(true);
                }}
              >
                <Copy size={14} />
                {t(messages, copied ? "token_copied" : "token_copy")}
              </button>
              <button
                className="fam-button"
                aria-label={t(messages, "dismiss")}
                onClick={() => {
                  setPassword(null);
                  setCopied(false);
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {activeTab === "members" && (
          <>
            <div className="fam-metrics">
              {metrics.map(([value, label, Icon, tone, tab]) => (
                <button
                  className="fam-metric"
                  key={label}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === "members") {
                      setQuery("");
                      setFilter("all");
                    }
                  }}
                >
                  <span className={`fam-badge ${tone}`}>
                    <Icon size={19} />
                  </span>
                  <span>
                    <strong>{value ?? "—"}</strong>
                    <small>
                      {copy(
                        value === 1 &&
                          ["invites_count", "displays_count"].includes(label)
                          ? `${label}_one`
                          : label,
                      )}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {summaryError && (
              <p className="fam-help" role="status">
                {copy("summary_unavailable")}{" "}
                <button
                  className="fam-link"
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  {copy("retry")}
                </button>
              </p>
            )}
            <div className="fam-members-layout">
              <section className="fam-panel fam-family-panel">
                <header className="fam-panel-head">
                  <div>
                    <h2>{copy("family_circle")}</h2>
                    <p>{copy("profiles_hint")}</p>
                  </div>
                  <span className="fam-soft-count">
                    {tc(messages, 'admin_layout_member_count', count)}
                  </span>
                </header>
                <div className="fam-filters">
                  <label className="fam-search">
                    <Search size={16} />
                    <input
                      type="search"
                      placeholder={copy("search")}
                      aria-label={copy("search")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="fam-segmented" aria-label={copy("filter")}>
                    {[
                      ["all", "all"],
                      ["adults", "adults"],
                      ["children", "children"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={filter === key ? "active" : ""}
                        aria-pressed={filter === key}
                        onClick={() => setFilter(key)}
                      >
                        {copy(label)}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className={`fam-member-groups${groups.length === 1 ? " single" : ""}`}
                >
                  {groups.map(([key, label, rows]) => (
                    <section
                      className="fam-member-group"
                      key={key}
                      aria-label={t(messages, label)}
                    >
                      <h3 className="fam-group-label">
                        {t(messages, label)} <span>{rows.length}</span>
                      </h3>
                      {rows.length ? (
                        rows.map((member) => (
                          <article className="fam-member" key={member.user_id}>
                            <MemberAvatar member={member} size={40} />
                            <div className="fam-member-copy">
                              <div className="fam-member-name profile-name">
                                {member.display_name}
                                {member.user_id === me?.user_id && (
                                  <span className="fam-you">{copy("you")}</span>
                                )}
                              </div>
                              <p className="profile-email">
                                {member.user_id === me?.user_id
                                  ? copy("self_hint")
                                  : !member.is_adult
                                    ? copy("child_hint")
                                    : member.email || copy("adult_hint")}
                              </p>
                            </div>
                            <div className="fam-member-actions">
                              <span
                                className={`fam-role${["owner", "admin"].includes(member.role) ? "" : " member"}`}
                              >
                                {["owner", "admin"].includes(member.role) ? (
                                  <Shield size={12} />
                                ) : (
                                  <UserRound size={12} />
                                )}
                                {member.role === "owner"
                                  ? copy("owner")
                                  : t(
                                      messages,
                                      member.role === "admin"
                                        ? "admin"
                                        : "member",
                                    )}
                              </span>
                              <button
                                className="fam-button"
                                disabled={demoMode}
                                aria-label={copy("edit_named").replace(
                                  "{name}",
                                  member.display_name,
                                )}
                                onClick={() => setEditor(member.user_id)}
                              >
                                <Pencil size={15} />
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="fam-empty">{copy("no_members")}</p>
                      )}
                    </section>
                  ))}
                </div>
                <footer className="fam-member-footer">
                  <button
                    className="fam-link"
                    disabled={demoMode}
                    onClick={() => setEditor(null)}
                  >
                    <Plus size={14} />
                    {t(messages, "add_member")}
                  </button>
                  <span>
                    <ShieldCheck size={14} />
                    {copy("protected")}
                  </span>
                </footer>
              </section>
              <div className="fam-support-grid">
                <section className="fam-panel fam-support-card fam-time-card">
                  <h3>
                    <Clock size={16} />
                    {copy("time_title")}
                  </h3>
                  <div className="fam-time-example">
                    {timeFormat === "12h" ? "2:30 PM" : "14:30"}{" "}
                    <small>{copy("example")}</small>
                  </div>
                  <div className="fam-segmented">
                    {["24h", "12h"].map((value) => (
                      <button
                        key={value}
                        className={timeFormat === value ? "active" : ""}
                        aria-pressed={timeFormat === value}
                        disabled={timeBusy || demoMode}
                        onClick={() => changeTime(value)}
                      >
                        {copy(value)}
                      </button>
                    ))}
                  </div>
                  <p>{copy("time_hint")}</p>
                </section>
                <section className="fam-panel fam-support-card fam-access-card">
                  <h3>
                    <ShieldCheck size={16} />
                    {copy("roles_title")}
                  </h3>
                  <p>{copy("roles_hint")}</p>
                  <button className="fam-link" onClick={() => setHelp(true)}>
                    <ArrowRight size={15} />
                    {copy("roles_link")}
                  </button>
                </section>
                <section className="fam-panel fam-support-card">
                  <h3>
                    <Activity size={16} />
                    {copy("recent")}
                  </h3>
                  {summary.latest ? (
                    <div className="fam-latest">
                      <ShieldCheck size={14} />
                      <div>
                        <strong>
                          {auditAction(messages, summary.latest.action)}
                        </strong>
                        <small>
                          {summary.latest.admin_display_name} ·{" "}
                          {parseServerInstant(
                            summary.latest.created_at,
                          )?.toLocaleDateString(localeForLang(lang))}
                        </small>
                      </div>
                    </div>
                  ) : (
                    <p>
                      {summaryError
                        ? copy("summary_unavailable")
                        : t(messages, "audit_log_empty")}
                    </p>
                  )}
                  <button
                    className="fam-link"
                    onClick={() => setActiveTab("audit")}
                  >
                    <ArrowRight size={15} />
                    {copy("audit_link")}
                  </button>
                </section>
              </div>
            </div>
          </>
        )}
        <div className="fam-tab-content">
          {activeTab === "invites" && (
            <InviteSection
              onCreateConsumed={() => setInviteRequest(0)}
              createRequest={inviteRequest}
              onChanged={() => setRefresh((n) => n + 1)}
            />
          )}
          {activeTab === "displays" && <DisplaysSection />}
          {activeTab === "sso" && <SsoSection />}
          {activeTab === "backups" && <BackupSection />}
          {activeTab === "system" && <SystemSection />}
          {activeTab === "audit" && <AuditLogSection />}
        </div>
        <footer className="fam-footnote">
          <ShieldCheck size={14} />
          {copy("server_hint")}
        </footer>
      </section>
      {editor !== undefined && (
        <MemberEditor
          key={editor ?? "new"}
          memberId={editor}
          onClose={() => setEditor(undefined)}
          onChanged={changed}
          onPassword={(value, type) => {
            setPassword({ value, type });
            setCopied(false);
          }}
        />
      )}
      {help && (
        <AdminDialog
          title={copy("roles_title")}
          messages={messages}
          onClose={() => setHelp(false)}
          actions={
            <button
              className="fam-button primary"
              onClick={() => setHelp(false)}
            >
              {t(messages, "close")}
            </button>
          }
        >
          <div className="fam-role-guide">
            {["admin", "member", "child"].map((role) => (
              <section key={role}>
                <h3>{copy(`guide_${role}_title`)}</h3>
                <p>{copy(`guide_${role}`)}</p>
              </section>
            ))}
            <p>{copy("protected")}</p>
          </div>
        </AdminDialog>
      )}
    </div>
  );
}
