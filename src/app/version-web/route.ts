import { UI_COOKIE } from "@/lib/cookies";

/**
 * Bascule de la coquille Mini App vers la version web complète :
 * le cookie `teu_ui=web` est posé, puis on retourne à la page demandée.
 * (Route handler : Next 15 n'autorise l'écriture de cookies que ici ou en action.)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("redirect");
  const destination = target === "/login" || target === "/dashboard" ? target : "/dashboard";

  const response = new Response(null, { status: 307, headers: { Location: destination } });
  response.headers.append(
    "Set-Cookie",
    `${UI_COOKIE}=web; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`,
  );
  return response;
}
