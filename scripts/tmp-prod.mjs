import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const p = await c.query("select s.name as boutique, count(pr.id)::int as n, min(pr.synced_at) as first_sync from shops s left join products pr on pr.shop_id=s.id group by s.name");
console.log("PRODUITS", JSON.stringify(p.rows));
const j = await c.query("select type,status,created_at from jobs order by created_at desc limit 6");
console.log("JOBS", JSON.stringify(j.rows));
await c.end();
