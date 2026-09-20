import { useState } from "react";
import { ImagePlus, KeyRound, Trash2 } from "lucide-react";
import { useApp } from "../../contexts/AppContext";
import * as api from "../../lib/api";
import { errorText } from "../../lib/helpers";
import { t } from "../../lib/i18n";
import MemberAvatar from "../MemberAvatar";
import AdminDialog from "./AdminDialog";
import { adminText } from "./adminHelpers";

export default function MemberEditor({
  memberId,
  onClose,
  onChanged,
  onPassword,
}) {
  const { familyId, members, me, messages, demoMode } = useApp();
  const member = members.find((m) => m.user_id === memberId);
  const creating = memberId === null;
  const own = memberId === me?.user_id;
  const protectedRole = own || member?.role === "owner";
  const copy = (key) => adminText(messages, key);
  const [name, setName] = useState(member?.display_name || "");
  const [email, setEmail] = useState(member?.email || "");
  const [adult, setAdult] = useState(member?.is_adult ?? false);
  const [role, setRole] = useState(member?.role || "member");
  const [birthday, setBirthday] = useState(member?.date_of_birth || "");
  const [avatar, setAvatar] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [dangerAction, setDangerAction] = useState(null);
  const permissionChange = creating
    ? role === "admin"
    : member && (adult !== member.is_adult || role !== member.role);

  async function request(promise) {
    const { ok, data } = await promise;
    if (!ok)
      throw new Error(
        errorText(data?.detail, t(messages, "toast.error"), messages),
      );
    return data;
  }

  async function save(event) {
    event.preventDefault();
    if (busy || demoMode || (permissionChange && !confirmed)) return;
    setBusy(true);
    setError("");
    try {
      if (creating) {
        const data = await request(
          api.apiCreateMember(familyId, {
            email: email.trim(),
            display_name: name.trim(),
            role: adult ? role : "member",
            is_adult: adult,
          }),
        );
        onPassword(data.temporary_password, "created");
      } else {
        // Keep the existing endpoints and their server-side self/instance-admin
        // protections. Refresh after partial failure before the next attempt.
        let savedRole = member.role;
        if (!protectedRole && adult !== member.is_adult) {
          const data = await request(
            api.apiSetAdult(familyId, memberId, adult),
          );
          savedRole = data.role || (adult ? savedRole : "member");
        }
        if (!protectedRole && role !== savedRole)
          await request(api.apiSetRole(familyId, memberId, role));
        if (birthday !== (member.date_of_birth || ""))
          await request(
            api.apiSetMemberBirthdate(familyId, memberId, birthday || null),
          );
        if (avatar !== undefined)
          await request(api.apiSetMemberAvatar(familyId, memberId, avatar));
      }
      await onChanged();
      onClose();
    } catch (err) {
      setError(err.message || t(messages, "toast.error"));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function runDangerAction() {
    if (busy || demoMode || own) return;
    setBusy(true);
    setError("");
    try {
      if (dangerAction === "remove")
        await request(api.apiRemoveMember(familyId, memberId));
      else {
        const data = await request(
          api.apiResetMemberPassword(familyId, memberId),
        );
        onPassword(data.temporary_password, "reset");
      }
      await onChanged();
      onClose();
    } catch (err) {
      setError(err.message || t(messages, "toast.error"));
    } finally {
      setBusy(false);
    }
  }

  function readAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(t(messages, "avatar_too_large"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError(copy("image_only"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result);
      setError("");
    };
    reader.onerror = () => setError(t(messages, "toast.error"));
    reader.readAsDataURL(file);
  }

  return (
    <AdminDialog
      title={creating ? t(messages, "add_member") : copy("edit_member")}
      messages={messages}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <button className="ad-button" disabled={busy} onClick={onClose}>
            {t(messages, "cancel")}
          </button>
          <button
            className="ad-button primary"
            type="submit"
            form="admin-member-form"
            disabled={busy || demoMode || (permissionChange && !confirmed)}
          >
            {creating ? t(messages, "add_member") : t(messages, "save")}
          </button>
        </>
      }
    >
      <form id="admin-member-form" onSubmit={save} className="ad-editor">
        <fieldset disabled={busy || demoMode}>
          {!creating && (
            <div className="ad-editor-person">
              <MemberAvatar
                member={{
                  ...member,
                  ...(avatar !== undefined ? { profile_image: avatar } : {}),
                }}
                size={56}
              />
              <div>
                <strong>{member?.display_name}</strong>
                <p>{member?.email}</p>
              </div>
            </div>
          )}
          <div className="ad-form-grid">
            <label>
              {t(messages, "member_name")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                readOnly={!creating}
                maxLength={120}
              />
            </label>
            <label>
              {t(messages, "member_email")}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                readOnly={!creating}
              />
            </label>
            <label>
              {copy("profile_type")}
              <select
                value={adult ? "adult" : "child"}
                disabled={protectedRole}
                onChange={(e) => {
                  const next = e.target.value === "adult";
                  setAdult(next);
                  if (!next) setRole("member");
                  setConfirmed(false);
                }}
              >
                <option value="adult">{t(messages, "member_is_adult")}</option>
                <option value="child">{t(messages, "child")}</option>
              </select>
            </label>
            <label>
              {t(messages, "member_role")}
              <select
                value={role}
                disabled={protectedRole || !adult}
                onChange={(e) => {
                  setRole(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="member">{t(messages, "member")}</option>
                <option value="admin">{t(messages, "admin")}</option>
                {role === "owner" && (
                  <option value="owner">{copy("owner")}</option>
                )}
              </select>
            </label>
            {!creating && (
              <>
                <label>
                  {t(messages, "birthdate")}
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                  />
                </label>
                <label>
                  {t(messages, "set_avatar")}
                  <span className="ad-upload">
                    <ImagePlus size={16} />
                    <input type="file" accept="image/*" onChange={readAvatar} />
                  </span>
                </label>
              </>
            )}
          </div>
          <p className="ad-help">
            {protectedRole ? t(messages, "admin_self_hint") : copy("role_help")}
          </p>
          {!creating && <p className="ad-help">{copy("account_fields")}</p>}
          {permissionChange && (
            <label className="ad-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {copy("confirm_permissions")}
            </label>
          )}
          {!creating && !protectedRole && (
            <div className="ad-danger-zone">
              <button
                type="button"
                className="ad-button"
                onClick={() => setDangerAction("reset")}
              >
                <KeyRound size={14} />
                {t(messages, "reset_password")}
              </button>
              <button
                type="button"
                className="ad-button danger"
                onClick={() => setDangerAction("remove")}
              >
                <Trash2 size={14} />
                {t(messages, "remove_member")}
              </button>
            </div>
          )}
          {dangerAction && (
            <div
              className="ad-confirm"
              role="group"
              aria-label={copy("confirm_action")}
            >
              <p>
                {dangerAction === "remove"
                  ? t(messages, "remove_member_confirm")
                  : copy("reset_confirm")}
              </p>
              <button
                type="button"
                className="ad-button danger"
                onClick={runDangerAction}
              >
                {copy("confirm_action")}
              </button>
              <button
                type="button"
                className="ad-button"
                onClick={() => setDangerAction(null)}
              >
                {t(messages, "cancel")}
              </button>
            </div>
          )}
        </fieldset>
        {error && (
          <p className="ad-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </AdminDialog>
  );
}
