import { auth } from "@/auth";

import { db } from "./db";

export const currentProfile = async () => {
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
};
