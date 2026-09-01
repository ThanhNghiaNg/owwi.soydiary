import { auth } from "@/auth";

export async function requireActor() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return { id: session.user.id };
}
