import { useState, useEffect, useCallback } from "react";
import { Check, Copy, X, Link, Trash2 } from "lucide-react";
import { useApp } from "../../contexts/AppContext";
import { useToast } from "../../contexts/ToastContext";
import {
  copyTextToClipboard,
  errorText,
  parseServerInstant,
} from "../../lib/helpers";
import { t } from "../../lib/i18n";
import * as api from "../../lib/api";
import ConfirmDialog from "../ConfirmDialog";
import AdminDialog from "./AdminDialog";
import { adminText, invitationState } from "./adminHelpers";

export default function InviteSection({
  createRequest = 0,
  onCreateConsumed,
  onChanged,
} = {}) {
  const { familyId, messages, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const copy = (key) => adminText(messages, key);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (createRequest) {
      setShowCreate(true);
      onCreateConsumed?.();
    }
  }, [createRequest]);
  const [invites, setInvites] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rolePreset, setRolePreset] = useState("member");
  const [isAdultPreset, setIsAdultPreset] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [maxUses, setMaxUses] = useState("");
  const [createdUrl, setCreatedUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Base URL settings
  const [baseUrl, setBaseUrl] = useState("");
  const [baseUrlEnv, setBaseUrlEnv] = useState("");
  const [baseUrlEffective, setBaseUrlEffective] = useState("");

  const loadInvites = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetInvitations(familyId);
    if (ok) setInvites(data);
    else toastError(t(messages, "toast.error"));
  }, [familyId, demoMode]);

  const loadBaseUrl = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetBaseUrl();
    if (ok) {
      setBaseUrl(data.saved || "");
      setBaseUrlEnv(data.env || "");
      setBaseUrlEffective(data.effective || "");
    }
  }, [demoMode]);

  useEffect(() => {
    loadInvites();
    loadBaseUrl();
  }, [loadInvites, loadBaseUrl]);

  async function handleCreate(e) {
    e.preventDefault();
    if (busy || (rolePreset === "admin" && !confirmed)) return;
    setBusy(true);
    setFormError("");
    const payload = {
      role_preset: rolePreset,
      is_adult_preset: isAdultPreset,
      expires_in_days: expiryDays,
    };
    if (maxUses) payload.max_uses = parseInt(maxUses);
    try {
      const { ok, data } = await api.apiCreateInvitation(familyId, payload);
      if (!ok) {
        setFormError(
          errorText(data?.detail, t(messages, "toast.error"), messages),
        );
        return;
      }
      setCreatedUrl(data.invite_url);
      setShowCreate(false);
      setRolePreset("member");
      setIsAdultPreset(false);
      setExpiryDays(7);
      setMaxUses("");
      await loadInvites();
      onChanged?.();
    } catch {
      setFormError(t(messages, "toast.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(inviteId) {
    setConfirmAction({
      title: t(messages, "invite_revoke"),
      message: t(messages, "invite_revoke_confirm"),
      danger: true,
      action: async () => {
        const { ok, data } = await api.apiRevokeInvitation(familyId, inviteId);
        if (!ok) {
          toastError(
            errorText(data?.detail, t(messages, "toast.error"), messages),
          );
        } else {
          await loadInvites();
          onChanged?.();
        }
        setConfirmAction(null);
      },
    });
  }

  async function handleSaveBaseUrl() {
    const { ok } = await api.apiSetBaseUrl(baseUrl);
    if (ok) {
      toastSuccess(t(messages, "toast.saved"));
      await loadBaseUrl();
    } else toastError(t(messages, "toast.error"));
  }

  async function handleCopyUrl() {
    if (!createdUrl) return;
    if (!(await copyTextToClipboard(createdUrl))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="admin-subpage admin-subpage-invites">
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmDanger={confirmAction.danger}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
          messages={messages}
        />
      )}
      <div className="ad-invite-heading">
        <div>
          <h2>
            <span className="admin-subpage-icon">
              <Link size={20} />
            </span>{" "}
            {t(messages, "invite_title")}
          </h2>
          <p>{copy("invitations_subtitle")}</p>
        </div>
        <button
          className="ad-button primary"
          disabled={demoMode}
          onClick={() => {
            setFormError("");
            setShowCreate(true);
          }}
        >
          <Link size={15} />
          {t(messages, "invite_create")}
        </button>
      </div>
      {createdUrl && (
        <div className="adm-success-banner">
          <strong>
            <Check size={16} /> {t(messages, "invite_link_created")}
          </strong>
          <p>{t(messages, "invite_link_hint")}</p>
          <p>{t(messages, "invite_link_share_hint")}</p>
          <div className="adm-banner-row">
            <code className="token-display">{createdUrl}</code>
            <button className="ad-button" onClick={handleCopyUrl}>
              <Copy size={14} />
              {t(messages, copied ? "invite_copied" : "invite_copy")}
            </button>
            <button
              className="ad-button"
              aria-label={t(messages, "dismiss")}
              onClick={() => {
                setCreatedUrl(null);
                setCopied(false);
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="ad-invite-layout">
        <section className="settings-section ad-invite-list">
          <header className="ad-panel-head">
            <h2>{copy("invitations_list")}</h2>
            <span className="ad-soft-count">{invites.length}</span>
          </header>
          <div className="ad-filters">
            <div className="ad-segmented">
              {["all", "active", "used", "revoked", "expired"].map((key) => (
                <button
                  key={key}
                  className={filter === key ? "active" : ""}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {copy(key)}
                </button>
              ))}
            </div>
          </div>
          {invites.filter(
            (inv) => filter === "all" || invitationState(inv) === filter,
          ).length === 0 && (
            <p className="adm-empty">{t(messages, "invite_no_invites")}</p>
          )}
          {invites
            .filter(
              (inv) => filter === "all" || invitationState(inv) === filter,
            )
            .map((inv) => (
              <article className="adm-list-item" key={inv.id}>
                <span className="ad-badge blue">
                  <Link size={18} />
                </span>
                <div className="ad-invite-record">
                  <div className="adm-list-item-header">
                    <strong>
                      {t(
                        messages,
                        inv.role_preset === "admin" ? "admin" : "member",
                      )}
                    </strong>
                    <span className="ad-role member">
                      {copy(invitationState(inv))}
                    </span>
                  </div>
                  <p className="adm-list-item-meta">
                    {t(
                      messages,
                      inv.is_adult_preset ? "member_is_adult" : "child",
                    )}{" "}
                    ·{" "}
                    {inv.max_uses
                      ? t(messages, "invite_uses")
                          .replace("{count}", inv.use_count)
                          .replace("{max}", inv.max_uses)
                      : t(messages, "invite_uses_unlimited").replace(
                          "{count}",
                          inv.use_count,
                        )}
                    <br />
                    {parseServerInstant(inv.expires_at)?.toLocaleDateString()}
                  </p>
                </div>
                {invitationState(inv) === "active" && (
                  <button
                    className="ad-button"
                    onClick={() => handleRevoke(inv.id)}
                  >
                    <Trash2 size={14} />
                    {t(messages, "invite_revoke")}
                  </button>
                )}
              </article>
            ))}
        </section>
        <aside className="ad-invite-aside">
          <section className="settings-section ad-access-card">
            <span className="ad-badge blue">
              <Link size={20} />
            </span>
            <h3>{copy("invitations_guide")}</h3>
            <p>{copy("invitations_help")}</p>
            <p>{copy("role_help")}</p>
          </section>
          {!demoMode && (
            <section className="settings-section">
              <h3>{t(messages, "base_url_title")}</h3>
              <p>{t(messages, "base_url_hint")}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveBaseUrl();
                }}
              >
                <label className="ad-base-field">
                  <span>{t(messages, "base_url_title")}</span>
                  <input
                    className="form-input"
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://tribu.example.com"
                  />
                </label>
                {baseUrlEnv && (
                  <p>
                    {t(messages, "base_url_env")}: {baseUrlEnv}
                  </p>
                )}
                <p>
                  {t(messages, "base_url_effective")}: {baseUrlEffective}
                </p>
                <button className="ad-button" type="submit">
                  {t(messages, "base_url_save")}
                </button>
              </form>
            </section>
          )}
        </aside>
      </div>
      {showCreate && (
        <AdminDialog
          title={t(messages, "invite_create")}
          messages={messages}
          onClose={() => setShowCreate(false)}
          busy={busy}
          actions={
            <>
              <button
                className="ad-button"
                disabled={busy}
                onClick={() => setShowCreate(false)}
              >
                {t(messages, "cancel")}
              </button>
              <button
                type="submit"
                form="admin-invite-form"
                className="ad-button primary"
                disabled={busy || (rolePreset === "admin" && !confirmed)}
              >
                {t(messages, "invite_create")}
              </button>
            </>
          }
        >
          <form
            id="admin-invite-form"
            onSubmit={handleCreate}
            className="ad-editor"
          >
            <fieldset disabled={busy}>
              <div className="ad-form-grid">
                <label>
                  {copy("profile_type")}
                  <select
                    value={isAdultPreset ? "adult" : "child"}
                    onChange={(e) => {
                      const adult = e.target.value === "adult";
                      setIsAdultPreset(adult);
                      if (!adult) setRolePreset("member");
                      setConfirmed(false);
                    }}
                  >
                    <option value="adult">
                      {t(messages, "member_is_adult")}
                    </option>
                    <option value="child">{t(messages, "child")}</option>
                  </select>
                </label>
                <label>
                  {t(messages, "invite_role")}
                  <select
                    value={rolePreset}
                    disabled={!isAdultPreset}
                    onChange={(e) => {
                      setRolePreset(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="member">{t(messages, "member")}</option>
                    <option value="admin">{t(messages, "admin")}</option>
                  </select>
                </label>
                <label>
                  {t(messages, "invite_expiry_days")}
                  <input
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={expiryDays}
                    onChange={(e) =>
                      setExpiryDays(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  {t(messages, "invite_max_uses")}
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="—"
                  />
                </label>
              </div>
              <p className="ad-help">{copy("role_help")}</p>
              {rolePreset === "admin" && (
                <label className="ad-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {copy("confirm_permissions")}
                </label>
              )}
            </fieldset>
            {formError && (
              <p className="ad-error" role="alert">
                {formError}
              </p>
            )}
          </form>
        </AdminDialog>
      )}
    </div>
  );
}
