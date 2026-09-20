const { mockResponsivePlanner } = require("./responsive-planner");

// Synthetic fixtures only. The fallback also mocks every API route, so these
// screenshots never use a signed-in person's data or a live backend.
async function mockAdmin(page, { failSave = false, child = false } = {}) {
  await mockResponsivePlanner(page, { child });
  let members = ["Demo A", "Demo B", "Demo C", "Demo D"].map(
    (display_name, i) => ({
      user_id: i + 1,
      display_name,
      email: `demo-${i + 1}@example.test`,
      is_adult: i < 2,
      role: i < 2 ? "admin" : "member",
      color: ["#75518e", "#71a4dc", "#d8a245", "#d67e70"][i],
      profile_image: null,
      date_of_birth: null,
    }),
  );
  let invites = [
    {
      id: 1,
      role_preset: "member",
      is_adult_preset: true,
      expires_at: "2026-12-31T23:59:00Z",
      max_uses: 1,
      use_count: 0,
      revoked: false,
    },
  ];
  let devices = [
    {
      id: 1,
      name: "Demo-Display",
      display_mode: "tablet",
      layout_preset: "hearth",
      refresh_interval_seconds: 60,
      created_at: "2026-09-19T10:00:00Z",
      last_used_at: null,
      revoked_at: null,
    },
  ];
  const audit = [
    {
      id: 1,
      action: "member_created",
      admin_display_name: "Demo A",
      target_display_name: "Demo B",
      created_at: "2026-09-19T10:00:00Z",
      details: {},
    },
  ];
  const writes = [];
  let timeFormat = "24h";
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, "");
    const method = req.method();
    const body = req.postDataJSON();
    if (method !== "GET") writes.push({ path, method, body });
    if (failSave && method !== "GET")
      return route.fulfill({
        status: 500,
        json: { detail: "Demo save failed" },
      });
    let data;
    if (path === "/auth/me")
      data = {
        user_id: 1,
        id: 1,
        display_name: "Demo Person",
        email: "demo@example.test",
        has_completed_onboarding: true,
      };
    else if (path === "/families/7/members") {
      if (method === "POST") {
        const member = { ...body, user_id: 8 };
        members.push(member);
        data = { ...member, temporary_password: "DEMO-NOT-A-REAL-PASSWORD" };
      } else data = members;
    } else if (path.match(/^\/families\/7\/members\/\d+/)) {
      const id = Number(path.split("/")[4]);
      const member = members.find((m) => m.user_id === id);
      if (method === "DELETE")
        members = members.filter((m) => m.user_id !== id);
      else if (path.endsWith("/reset-password"))
        data = { temporary_password: "DEMO-NOT-A-REAL-PASSWORD" };
      else {
        Object.assign(member, body);
        if (!member.is_adult) member.role = "member";
        data = member;
      }
      data ||= {};
    } else if (path === "/families/7/invitations") {
      if (method === "POST") {
        invites.push({
          ...body,
          id: 2,
          expires_at: "2026-12-31T23:59:00Z",
          revoked: false,
          use_count: 0,
        });
        data = { invite_url: "https://example.test/invite/DEMO" };
      } else data = invites;
    } else if (path.startsWith("/families/7/invitations/")) {
      invites[0].revoked = true;
      data = {};
    } else if (path === "/families/7/display-devices") {
      if (method === "POST") {
        const device = { ...body, id: 2, created_at: "2026-09-19T10:00:00Z" };
        devices.push(device);
        data = { device, token: "DEMO-NOT-A-REAL-TOKEN" };
      } else data = devices;
    } else if (path.startsWith("/families/7/display-devices/")) {
      Object.assign(
        devices[0],
        method === "DELETE" ? { revoked_at: "2026-09-19T10:00:00Z" } : body,
      );
      data = devices[0];
    } else if (path === "/families/7/audit-log")
      data = { items: audit, total: audit.length };
    else if (path === "/admin/settings/time-format") {
      if (body) timeFormat = body.time_format;
      data = { time_format: timeFormat };
    } else if (path === "/admin/settings/base-url")
      data = {
        saved: "https://example.test",
        effective: "https://example.test",
        env: "",
      };
    else if (path === "/admin/oidc/presets")
      data = [{ id: "custom", name: "Custom" }];
    else if (path === "/admin/oidc")
      data = {
        enabled: false,
        preset: "custom",
        issuer: "https://identity.example.test",
        client_id: "DEMO",
        client_secret_set: false,
        scopes: "openid profile email",
        effective_callback_url: "https://example.test/auth/oidc/callback",
        ...body,
      };
    else if (path === "/admin/backup/config")
      data = { schedule: "off", retention: 7, ...body };
    else if (path === "/admin/backup/list") data = [];
    else if (path === "/admin/backup/status")
      data = {
        database_backend: "sqlite",
        has_backups: false,
        included_domains: ["calendar", "tasks"],
        excluded_domains: ["oidc_client_secrets"],
        restore_supported: "setup_wizard",
        restore_runbook: "self_hosting_backup_restore",
      };
    else return route.fallback();
    return route.fulfill({ status: 200, json: data });
  });
  return {
    writes,
    get members() {
      return members;
    },
  };
}
module.exports = { mockAdmin };
