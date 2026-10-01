import type { NextApiResponse } from "next";
import type { ServerResponse } from "node:http";

export function pagesAuthResponse(res: Pick<ServerResponse, "appendHeader">): NextApiResponse {
  // Auth.js checks for `headers` to choose the Web Response API. OpenNext's
  // Node response also has `headers`, but it is a plain object. Give Auth.js
  // only its Node cookie-writing interface, without changing the real response.
  return {
    appendHeader: (name: string, value: string | string[]) => res.appendHeader(name, value),
  } as NextApiResponse;
}
