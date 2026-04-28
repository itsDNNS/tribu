import { useState, useEffect } from 'react';
import { ShieldCheck, Heart, Bug, ExternalLink } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import { formatDisplayedVersion, hasNewerRelease } from '../../lib/version';
import * as api from '../../lib/api';

export default function AboutTab() {
  const { messages, isAdmin } = useApp();
  // The frontend build version is baked in by the Docker build (Next.js
  // inlines NEXT_PUBLIC_* at build time). When backend and frontend
  // images are released independently, the backend's /health version
  // can lag behind the running frontend bundle, so prefer the frontend
  // build version for both the displayed version and the update check.
  const buildVersion = process.env.NEXT_PUBLIC_APP_VERSION || null;
  const [healthVersion, setHealthVersion] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const effectiveVersion = buildVersion || healthVersion;
  const displayedVersion = formatDisplayedVersion(effectiveVersion);

  useEffect(() => {
    if (buildVersion) return undefined;
    let cancelled = false;
    api.apiGetHealth()
      .then(res => {
        if (cancelled || !res.ok || !res.data?.version) return;
        setHealthVersion(res.data.version);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [buildVersion]);

  useEffect(() => {
    if (!effectiveVersion || !isAdmin) return undefined;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;
    let cancelled = false;
    const CACHE_KEY = `tribu_update_check:${effectiveVersion}`;
    const CACHE_TTL = 60 * 60 * 1000;
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        setUpdateInfo(cached.data);
        return undefined;
      }
    } catch {}
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    fetch('https://api.github.com/repos/itsDNNS/tribu/releases/latest', { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        clearTimeout(timer);
        if (cancelled || !data.tag_name) return;
        const latest = data.tag_name.replace(/^v/, '');
        const result = hasNewerRelease(effectiveVersion, latest)
          ? { version: formatDisplayedVersion(latest), url: data.html_url }
          : 'up_to_date';
        setUpdateInfo(result);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result })); } catch {}
      })
      .catch(() => clearTimeout(timer));
    return () => { cancelled = true; };
  }, [effectiveVersion, isAdmin]);

  return (
    <div className="settings-grid">
      {/* Privacy */}
      <div className="settings-section">
        <div className="settings-section-title"><ShieldCheck size={16} /> {t(messages, 'privacy')}</div>
        <p className="set-about-desc">
          {t(messages, 'privacy_note')}
        </p>
        {effectiveVersion && (
          <div className="set-about-version">
            <span>{t(messages, 'version')}: {displayedVersion}</span>
            {isAdmin && updateInfo === 'up_to_date' && (
              <span className="set-about-uptodate">— {t(messages, 'up_to_date')}</span>
            )}
            {isAdmin && updateInfo && updateInfo !== 'up_to_date' && (
              <span className="set-about-update">
                — {t(messages, 'update_available').replace('{version}', updateInfo.version)}{' '}
                <a href={updateInfo.url} target="_blank" rel="noopener noreferrer" className="set-about-link">
                  {t(messages, 'view_release')}
                </a>
              </span>
            )}
          </div>
        )}
      </div>

      {/* About & Support */}
      <div className="settings-section">
        <div className="settings-section-title"><Heart size={16} /> {t(messages, 'about_support')}</div>
        <p className="set-about-desc-mb">
          {t(messages, 'about_support_desc')}
        </p>
        <div className="set-about-support-links">
          <a
            href="https://ko-fi.com/itsdnns"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost set-about-support-btn"
          >
            <Heart size={14} /> {t(messages, 'donate')} <ExternalLink size={12} />
          </a>
          <a
            href={`https://github.com/itsDNNS/tribu/issues/new?labels=bug&title=&body=${encodeURIComponent(`**Tribu Version:** ${displayedVersion || 'unknown'}\n**Browser:** ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}\n\n**Describe the bug:**\n\n`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost set-about-support-btn"
          >
            <Bug size={14} /> {t(messages, 'report_bug')} <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
