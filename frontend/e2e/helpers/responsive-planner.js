async function mockResponsivePlanner(page, { child = false } = {}) {
  const members = ["Demo A", "Demo B", "Demo C", "Demo D"].map(
    (display_name, i) => ({
      id: i + 1,
      user_id: i + 1,
      display_name,
      color: ["#71a4dc", "#79529e", "#d8a245", "#d67e70"][i],
    }),
  );
  let events = [
    [
      "Demo-Termin A",
      19,
      "09:00",
      "10:00",
      "Demo-Ort E",
      "all",
      "#759c5d",
    ],
    ["Demo-Termin B", 19, "16:00", "17:00", "", "all", "#d8a245"],
    ["Demo-Termin C", 21, "14:30", "15:00", "Demo-Ort A", [2], null],
    ["Demo-Termin D", 21, "17:15", "18:45", "Demo-Ort B", [4, 1], null],
    ["Demo-Termin E", 22, "08:30", "09:00", "Demo-Ort C", [1], null],
    ["Demo-Termin F", 23, "18:00", "19:00", "Demo-Ort D", [3], null],
  ].map(([title, day, start, end, location, assigned_to, color], i) => ({
    id: i + 1,
    family_id: 7,
    title,
    starts_at: `2026-09-${day}T${start}:00`,
    ends_at: `2026-09-${day}T${end}:00`,
    location,
    assigned_to,
    color,
    all_day: false,
    source_type: "manual",
  }));
  let meals = [
    {
      id: 1,
      family_id: 7,
      plan_date: "2026-09-19",
      slot: "noon",
      meal_name: "Demo-Mahlzeit",
      ingredients: [],
    },
  ];
  const requests = [];
  await page.clock.setFixedTime(new Date("2026-09-19T20:48:00Z"));
  await page.addInitScript(() => {
    sessionStorage.setItem("tribu_calendar_focus", "2026-09-21T12:00:00");
  });
  await page.route("**/api/**", (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace(/^\/api/, ""),
      method = req.method(),
      body = req.postDataJSON();
    requests.push({ path, method, body, query: url.search });
    let data = [];
    if (path === "/auth/me")
      data = {
        id: 1,
        user_id: 1,
        display_name: "Demo Person",
        email: "demo@example.com",
        has_completed_onboarding: true,
      };
    else if (path === "/families/me")
      data = [
        {
          family_id: 7,
          family_name: "Demo-Familie",
          role: child ? "member" : "admin",
          is_adult: !child,
        },
      ];
    else if (path === "/families/7/members") data = members;
    else if (path === "/setup/status") data = { needs_setup: false };
    else if (path === "/auth/config") data = {};
    else if (path === "/dashboard/summary")
      data = {
        upcoming_events: events,
        upcoming_birthdays: [],
        tasks_open: 0,
        shopping_open: 0,
      };
    else if (path === "/calendar/events") {
      if (method === "POST") {
        data = { id: Date.now(), family_id: 7, ...body };
        events.push(data);
      } else {
        const start = url.searchParams.get("range_start"),
          end = url.searchParams.get("range_end");
        data = {
          items: events.filter(
            (e) =>
              (!start || new Date(e.ends_at) >= new Date(start)) &&
              (!end || new Date(e.starts_at) < new Date(end)),
          ),
        };
      }
    } else if (/^\/calendar\/events\/\d+$/.test(path)) {
      const id = Number(path.split("/").at(-1));
      if (method === "DELETE") events = events.filter((e) => e.id !== id);
      else {
        data = events.find((e) => e.id === id);
        Object.assign(data, body);
      }
    } else if (path === "/meal-plans") {
      if (method === "POST") {
        data = { id: Date.now(), family_id: 7, ...body };
        meals.push(data);
      } else data = meals;
    } else if (/^\/meal-plans\/\d+$/.test(path)) {
      data = meals.find((m) => m.id === Number(path.split("/").at(-1)));
      Object.assign(data, body);
    } else if (path === "/tasks") data = { items: [{id:1,family_id:7,title:"Demo-Aufgabe",status:"open",priority:"normal",assigned_to_user_id:1,created_at:"2026-09-19T10:00:00"}] };
    else if (path === "/nav/order")
      data = {
        nav_order: [
          "dashboard",
          "calendar",
          "weekly_plan",
          "tasks",
          "shopping",
          "meal_plans",
          "recipes",
          "contacts",
          "settings",
        ],
      };
    else if (path === "/admin/settings/time-format")
      data = { time_format: "24h" };
    else if (path === "/shopping/lists") data = [{ id: 1, family_id: 7, name: "Demo-Liste", item_count: 2, checked_count: 0 }];
    else if (path === "/notifications/unread-count") data = { count: 3 };
    else if (path === "/notifications/stream")
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "",
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return {
    requests,
    members,
    get events() {
      return events;
    },
    get meals() {
      return meals;
    },
  };
}
module.exports = { mockResponsivePlanner };
