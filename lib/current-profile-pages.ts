import { db } from "./db";
import { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/auth";
import { pagesAuthResponse } from "./pages-auth-response";

export const currentProfilePages = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const session = await auth(req, pagesAuthResponse(res));
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }
  return db.profile.findUnique({
    where: {
      userId,
    },
  });
};
