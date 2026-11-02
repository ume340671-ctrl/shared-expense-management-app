import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import type { PGlite } from "@electric-sql/pglite";
import { createFriendsTestDatabase, friendsTestQuery } from "../../src/test/friendsDatabase";

// Network endpoints are redirected ONLY in this test to real local PostgreSQL.
// No credentials, test records or fake services are added to the application.
let db: PGlite;
let server: ChildProcess;
let base: string;

test.beforeAll(async () => {
  db = await createFriendsTestDatabase();
  const portProbe = createServer();
  await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>((resolve) => portProbe.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: "https://friends-test.supabase.co", VITE_SUPABASE_ANON_KEY: "public-browser-test-key" },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(base)).ok) break; } catch { /* Wait for the test-only Vite server. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mkdir("artifacts", { recursive: true });
});

test.afterAll(async () => {
  server?.kill();
  if (server && server.exitCode === null && server.signalCode === null) {
    await new Promise<void>((resolve) => {
      server.once("exit", () => resolve());
      setTimeout(resolve, 1000).unref();
    });
  }
  await db?.close();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`friends ledger, reimbursements and archive at ${viewport.width}px`, async ({ page, context }) => {
    await db.exec("truncate public.friend_expenses, public.friend_settlements, public.friend_periods, public.friend_members cascade; truncate public.audit_logs, public.audit_history_purges, public.audit_history_clear_requests, public.purchases, storage.objects; insert into public.friend_periods(number) values(1);");
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const user = { id: "00000000-0000-4000-8000-000000000001", email: "admin-2026@gmail.com", aud: "authenticated", role: "authenticated", created_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {} };
    const encoded = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", exp: expiry })).toString("base64url");
    const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${encoded}.dGVzdA`;
    await context.addInitScript(({ session }) => {
      localStorage.setItem("sb-friends-test-auth-token", JSON.stringify(session));
    }, { session: { access_token: token, refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: expiry, user } });
    await context.routeWebSocket("**/realtime/**", (socket) => socket.close());
    await context.route("https://friends-test.supabase.co/**", async (route) => {
      const url = new URL(route.request().url());
      const body = route.request().postDataJSON() ?? {};
      try {
        if (url.pathname.endsWith("/rpc/friends_snapshot")) {
          const result = await friendsTestQuery<{ data: unknown }>(db, "select public.friends_snapshot($1::uuid) as data", [body.p_period_id]);
          await route.fulfill({ json: result.rows[0].data });
        } else if (url.pathname.endsWith("/rpc/friends_mutate")) {
          const result = await friendsTestQuery<{ id: string }>(db, "select public.friends_mutate($1::uuid,$2,$3::jsonb) as id", [body.p_period_id, body.p_action, JSON.stringify(body.p_data)]);
          await route.fulfill({ json: result.rows[0].id });
        } else if (url.pathname.endsWith("/rpc/preview_audit_history_clear")) {
          const result = await friendsTestQuery<{ data: unknown }>(db, "select public.preview_audit_history_clear() as data");
          await route.fulfill({ json: result.rows[0].data });
        } else if (url.pathname.endsWith("/rpc/clear_audit_history")) {
          const result = await friendsTestQuery<{ count: string }>(db, "select public.clear_audit_history($1::uuid,$2::timestamptz,$3) as count", [body.p_request_id, body.p_cutoff, body.p_confirmation]);
          await route.fulfill({ json: Number(result.rows[0].count) });
        } else if (url.pathname.endsWith("/audit_logs")) {
          if (url.searchParams.get("select") === "actor_email") {
            const result = await friendsTestQuery(db, "select actor_email from public.audit_logs where actor_email is not null order by created_at desc limit 1000");
            await route.fulfill({ json: result.rows });
          } else {
            const conditions: string[] = [];
            const params: unknown[] = [];
            for (const column of ["action", "actor_email"]) {
              const filter = url.searchParams.get(column);
              if (filter?.startsWith("eq.")) { params.push(filter.slice(3)); conditions.push(`${column}=$${params.length}`); }
            }
            for (const filter of url.searchParams.getAll("created_at")) {
              if (filter.startsWith("gte.") || filter.startsWith("lt.")) {
                params.push(filter.slice(filter.indexOf(".") + 1));
                conditions.push(`created_at ${filter.startsWith("gte.") ? ">=" : "<"} $${params.length}::timestamptz`);
              }
            }
            const search = url.searchParams.get("or")?.match(/actor_email\.ilike\.%([^%]*)%/)?.[1];
            if (search) { params.push(`%${search}%`); conditions.push(`concat_ws(' ',actor_email,entity_label,summary) ilike $${params.length}`); }
            const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
            const total = (await friendsTestQuery<{ count: number }>(db, `select count(*)::int as count from public.audit_logs ${where}`, params)).rows[0].count;
            const offset = Number(url.searchParams.get("offset") ?? 0);
            const limit = Number(url.searchParams.get("limit") ?? 1000);
            const result = await friendsTestQuery(db, `select * from public.audit_logs ${where} order by created_at desc,id desc limit $${params.length + 1} offset $${params.length + 2}`, [...params, limit, offset]);
            await route.fulfill({ json: result.rows, headers: { "content-range": `${offset}-${Math.max(offset, offset + result.rows.length - 1)}/${total}`, "access-control-expose-headers": "content-range" } });
          }
        } else if (url.pathname.includes("/auth/")) {
          await route.fulfill({ json: user });
        } else if (url.pathname.endsWith("/housemates")) {
          const result = await friendsTestQuery(db, "select * from public.housemates order by full_name");
          await route.fulfill({ json: result.rows });
        } else if (url.pathname.endsWith("/purchases")) {
          if (route.request().method() === "POST") {
            const inserted = await friendsTestQuery<{ id: string }>(db, "insert into public.purchases(item_name,unit_price,quantity,buyer_id,purchase_date,notes) values($1,$2,$3,$4::uuid,$5::date,$6) returning id", [body.item_name, body.unit_price, body.quantity, body.buyer_id, body.purchase_date, body.notes]);
            const result = await friendsTestQuery(db, "select p.*, jsonb_build_object('full_name',h.full_name) as housemates from public.purchases p join public.housemates h on h.id=p.buyer_id where p.id=$1::uuid", [inserted.rows[0].id]);
            await route.fulfill({ json: result.rows[0] });
          } else {
            const result = await friendsTestQuery(db, "select p.*, jsonb_build_object('full_name',h.full_name) as housemates from public.purchases p join public.housemates h on h.id=p.buyer_id");
            await route.fulfill({ json: result.rows });
          }
        } else {
          await route.fulfill({ status: 404, json: { message: "Unexpected test endpoint" } });
        }
      } catch (error) {
        await route.fulfill({ status: 400, json: { code: "P0001", message: error instanceof Error ? error.message : String(error) } });
      }
    });

    await page.goto(base);
    await page.getByRole("button", { name: viewport.width < 768 ? "Amis" : "Dépenses entre amis", exact: true }).click();
    await expect(page.getByText("La prochaine sortie commence ici")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter un achat", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Ajouter un ami" }).click();
    for (const name of ["Alice navigateur", "Bob navigateur"]) {
      await page.getByLabel("Nom du participant").fill(name);
      await page.getByRole("button", { name: "Ajouter", exact: true }).click();
      await expect(page.getByLabel("Nom du participant")).toHaveValue("");
      await expect(page.getByRole("dialog").getByText(name)).toBeVisible();
    }
    await page.getByRole("button", { name: "Terminer" }).click();
    await page.getByRole("button", { name: "Nouvelle dépense", exact: true }).click();
    await page.getByLabel("Nom de la dépense").fill("Restaurant - test navigateur");
    await page.getByLabel("Montant total (DH)").fill("120");
    await page.getByLabel("Payé par").selectOption({ label: "Alice navigateur" });
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Enregistrer la dépense", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Restaurant - test navigateur/ }).first()).toBeVisible();
    while (await page.getByLabel("Fermer la notification").count()) await page.getByLabel("Fermer la notification").first().click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `artifacts/friends-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (viewport.width < 768) {
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole("button", { name: "Nouvelle dépense", exact: true }).click();
      expect(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.getByRole("button", { name: "Annuler", exact: true }).click();
      await page.setViewportSize(viewport);
    }

    await page.getByRole("button", { name: "Réinitialiser les dépenses", exact: true }).click();
    await expect(page.getByText("Des remboursements restent à effectuer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Archiver et recommencer" })).toBeDisabled();
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByRole("tab", { name: "Soldes & remboursements" }).click();
    await page.getByRole("button", { name: "Noter le remboursement" }).click();
    await expect(page.getByLabel("Montant remboursé (DH)")).toHaveValue("60.00");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Enregistrer le remboursement", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Réinitialiser les dépenses", exact: true }).click();
    await expect(page.getByText("Tous les soldes sont à zéro.")).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Archiver et recommencer" }).click();
    await expect(page.getByText("Total de la période 2")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: viewport.width < 768 ? "Amis" : "Dépenses entre amis", exact: true }).click();
    await expect(page.getByText("Total de la période 2")).toBeVisible();
    await page.getByRole("tab", { name: "Historique" }).click();
    await page.getByRole("button", { name: /Période 1/ }).click();
    await expect(page.getByText(/Consultation uniquement/)).toBeVisible();
    await expect(page.getByLabel("Modifier la dépense Restaurant - test navigateur")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Réinitialiser les dépenses", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Accueil", exact: true }).click();
    await page.getByRole("button", { name: "Ajouter un achat", exact: true }).first().click();
    await expect(page.getByLabel("Quantité", { exact: true })).toHaveCount(0);
    await page.getByLabel("Nom de l'article").fill("Achat sans quantité - test navigateur");
    await page.getByLabel("Prix (DH)").fill("18");
    await page.getByLabel("Achat effectué par").selectOption({ label: "RACHID FERHAOUI" });
    expect(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/purchase-no-quantity-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "+ Enregistrer l'achat", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const purchase = await db.query<{ quantity: number; unit_price: string }>("select quantity,unit_price from public.purchases");
    expect(purchase.rows).toHaveLength(1);
    expect(purchase.rows[0].quantity).toBe(1);
    expect(Number(purchase.rows[0].unit_price)).toBe(18);

    await page.getByRole("button", { name: "Audit", exact: true }).click();
    const clearButton = page.getByRole("button", { name: "Supprimer l'historique", exact: true });
    await expect(clearButton).toBeEnabled();
    await clearButton.click();
    await expect(page.getByRole("button", { name: "Supprimer définitivement", exact: true })).toBeDisabled();
    await expect(page.getByLabel(/Saisissez SUPPRIMER/)).toBeVisible();
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    const beforePurge = (await db.query<{ count: number }>("select count(*)::int as count from public.audit_logs")).rows[0].count;
    expect(beforePurge).toBeGreaterThan(0);
    await clearButton.click();
    await page.getByLabel(/Saisissez SUPPRIMER/).fill("SUPPRIMER");
    expect(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/audit-clear-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Supprimer définitivement", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Aucun événement enregistré", { exact: true })).toBeVisible();
    expect((await db.query("select * from public.purchases")).rows).toHaveLength(1);
    expect((await db.query("select * from public.friend_expenses")).rows).toHaveLength(1);
    expect((await db.query("select * from public.friend_settlements")).rows).toHaveLength(1);
    expect((await db.query("select * from public.audit_history_purges")).rows).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}