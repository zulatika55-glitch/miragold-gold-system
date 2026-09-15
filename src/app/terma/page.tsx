export default function TermaPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 text-sm leading-relaxed text-zinc-700">
      <h1 className="text-2xl font-semibold text-zinc-900">Terma &amp; Syarat</h1>
      <p className="mt-1 text-xs text-amber-700">
        Draf awal — sila semak dan kemaskini dengan pihak Miragold sebelum sistem dibuka kepada orang ramai.
      </p>

      <ol className="mt-6 list-decimal space-y-4 pl-5">
        <li>
          Sistem Gold Saving Miragold membenarkan pengguna mengunci/membeli gram Emas 916 pada harga semasa yang
          dipaparkan, tertakluk kepada tempoh kunci harga (price lock window) yang dinyatakan semasa checkout.
        </li>
        <li>
          Baki wallet dipaparkan dalam gram dan merupakan rekod simpanan emas, bukan akaun tunai. Nilai Ringgit
          Malaysia (RM) yang dipaparkan adalah anggaran berdasarkan harga semasa, bukan nilai tetap.
        </li>
        <li>Pembayaran diproses melalui Billplz. Gram hanya dikreditkan selepas pembayaran disahkan berjaya.</li>
        <li>
          Sekiranya pembayaran berjaya tetapi kredit gram tergendala atas sebab teknikal, transaksi akan disemak
          secara manual oleh pihak Miragold dan diselesaikan dalam tempoh munasabah.
        </li>
        <li>Setiap transaksi direkodkan dalam log audit dalaman untuk tujuan ketelusan dan pematuhan.</li>
        <li>
          Miragold berhak mengemaskini harga jualan/beli balik emas dari semasa ke semasa mengikut harga pasaran
          semasa.
        </li>
        <li>
          Akaun boleh digantung sekiranya disyaki terlibat dengan aktiviti tidak sah atau penyalahgunaan sistem.
        </li>
      </ol>

      <p className="mt-8 text-xs text-zinc-400">
        Terma penuh (termasuk butiran Syariah/kepatuhan, jika berkaitan) akan dikemaskini sebelum pelancaran
        awam, mengikut fasa semakan undang-undang dalam pelan pembangunan sistem ini.
      </p>
    </main>
  );
}
