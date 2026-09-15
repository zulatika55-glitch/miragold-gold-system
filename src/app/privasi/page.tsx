export default function PrivasiPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 text-sm leading-relaxed text-zinc-700">
      <h1 className="text-2xl font-semibold text-zinc-900">Dasar Privasi</h1>
      <p className="mt-1 text-xs text-amber-700">
        Draf awal — sila semak dan kemaskini dengan pihak Miragold sebelum sistem dibuka kepada orang ramai.
      </p>

      <div className="mt-6 space-y-4">
        <p>
          Kami mengumpul maklumat yang diperlukan untuk mengendalikan akaun anda: nama, nombor telefon, emel
          (jika diberikan), dan sejarah transaksi simpanan emas.
        </p>
        <p>
          Maklumat pembayaran diproses terus oleh Billplz — Miragold tidak menyimpan nombor kad bank atau
          maklumat pembayaran sensitif anda.
        </p>
        <p>
          Kod pengesahan (OTP) digunakan untuk log masuk dan disahkan secara selamat; kod tidak disimpan dalam
          bentuk teks biasa.
        </p>
        <p>Maklumat anda tidak dikongsi dengan pihak ketiga selain yang diperlukan untuk memproses pembayaran.</p>
        <p>
          Sebarang pertanyaan berkaitan privasi data boleh dihubungi terus melalui butiran perhubungan di bahagian
          footer laman ini.
        </p>
      </div>
    </main>
  );
}
