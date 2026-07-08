import { createClient } from "@libsql/client";
const c = createClient({ url: "file:local.db" });
for (const t of ["enrichment_runs","user_profiles","company_cache"]) {
  const r = await c.execute(`SELECT COUNT(*) n FROM ${t}`); console.log(`${t}: ${Number(r.rows[0].n)}`);
}
