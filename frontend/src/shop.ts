import { BASE_URL } from "@/src/api";

export const logoUri = (version?: number) => `${BASE_URL}/api/shop/logo?v=${version ?? 0}`;
