import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local","utf8").split("\n")){const t=line.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,"");if(process.env[k]===undefined)process.env[k]=v;}
const { eq } = await import("drizzle-orm");
const { getDb, schema } = await import("../src/db/index.ts");
const db = getDb();
const shops = await db.select().from(schema.shops);
console.log("boutiques:", shops.map(s=>`${s.name} (${s.id}, owner ${s.ownerUserId})`).join(", "));
const shop = shops.find((s) => s.remoteShopId) ?? shops[0];
if (!shop) throw new Error("Aucune boutique");
const owner = (await db.select().from(schema.users).where(eq(schema.users.id, shop.ownerUserId)))[0];
console.log("utilisateur:", owner.email, "->", shop.name);

const { startConversation, askMimi } = await import("../src/lib/mimi.ts");
const cid = await startConversation(owner.id, shop.id, process.argv[2] ?? "Quel est mon chiffre d'affaires des 30 derniers jours ?");
const result = await askMimi({ userId: owner.id, shopId: shop.id, conversationId: cid, message: process.argv[2] ?? "Quel est mon chiffre d'affaires des 30 derniers jours ?" });
console.log("--- REPONSE MIMI ---");
console.log(result.reply);
console.log("outils utilises:", result.toolCalls.join(", ") || "(aucun)");
