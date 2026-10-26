import Link from "next/link";

// Small, fixed-position help icon (sir zul requirement #2: "tanpa mengubah
// layout utama secara besar"). Pure link to the guide hub — no state, no
// data, nothing that touches wallet/Billplz/OTP. Reused on /wallet and
// /wallet/dashboard; `href` lets each page send the customer to the most
// relevant guide topic instead of always the generic hub.
export default function HelpButton({ href = "/panduan" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Panduan Pengguna"
      title="Panduan Pengguna"
      className="fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-amber-900 text-lg font-semibold text-white shadow-lg shadow-amber-900/30 transition hover:bg-amber-800"
    >
      ?
    </Link>
  );
}
