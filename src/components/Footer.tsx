import Link from "next/link";

// Trust/legitimacy signals for a system that moves real money (spec's own
// concern, echoed by sir zul: customers/staff should be able to tell this
// is a real Miragold system, not a scam page). Address/registration/phone
// are placeholders — swap in the real details before public launch.
export default function Footer() {
  return (
    <footer className="border-t border-amber-900/10 bg-white">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="text-base font-semibold tracking-tight text-amber-900">MIRAGOLD</p>
          <p className="mt-2 text-zinc-500">
            Gold Saving System — simpan &amp; kumpul gram Emas 916 dengan mudah dan selamat.
          </p>
        </div>

        <div>
          <p className="font-medium text-zinc-900">Keselamatan</p>
          <ul className="mt-2 space-y-1 text-zinc-500">
            <li>🔒 Sambungan disulitkan (HTTPS/SSL)</li>
            <li>💳 Pembayaran diproses oleh Billplz, payment gateway berdaftar</li>
            <li>📒 Setiap transaksi direkod dalam log audit yang tidak boleh diubah</li>
          </ul>
        </div>

        <div>
          <p className="font-medium text-zinc-900">Hubungi Kami</p>
          <ul className="mt-2 space-y-1 text-zinc-500">
            <li>Miragold — [alamat kedai]</li>
            <li>[nombor telefon / WhatsApp]</li>
            <li>[emel sokongan]</li>
          </ul>
          <div className="mt-3 flex gap-3 text-zinc-500">
            <Link href="/terma" className="hover:text-amber-900 hover:underline">
              Terma &amp; Syarat
            </Link>
            <Link href="/privasi" className="hover:text-amber-900 hover:underline">
              Dasar Privasi
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-100 px-6 py-4 text-center text-xs text-zinc-400">
        © {new Date().getFullYear()} Miragold. Hak cipta terpelihara.
      </div>
    </footer>
  );
}
