/** Login sprzedawcy → adres konta. Login bez „@” dostaje techniczną domenę. */
export const SELLER_LOGIN_DOMAIN = "sellers.pkmreps.app";

export function sellerLoginEmail(login: string): string {
  const l = (login ?? "").trim().toLowerCase();
  return l.includes("@") ? l : `${l}@${SELLER_LOGIN_DOMAIN}`;
}
