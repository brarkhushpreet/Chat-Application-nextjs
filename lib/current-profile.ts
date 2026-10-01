import { auth } from "@/auth";
import { cache } from "react";

import { db } from "./db";

export const currentProfile = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }
  return db.profile.findUnique({
    where: {
      userId,
    },
  });
});
