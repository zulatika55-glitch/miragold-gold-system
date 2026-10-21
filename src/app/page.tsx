import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import HomeLanding from "@/components/HomeLanding";

// sir zul, 21/10 (Masalah 1, master instruction): the only thing wrong with
// "/" was that it never checked who's looking at it -- a customer who just
// logged in landed right back on this price-only landing page instead of
// their Gold Wallet. This is a server component purely so it can check the
// session (getCurrentUser(), the same one every other protected route
// already uses) before anything renders, and redirect a logged-in customer
// straight to /wallet. A guest with no session sees exactly the same
// landing page as before -- HomeLanding is an unmodified copy of what this
// file used to render. No new homepage, /wallet untouched.
export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/wallet");
  }

  return <HomeLanding />;
}
