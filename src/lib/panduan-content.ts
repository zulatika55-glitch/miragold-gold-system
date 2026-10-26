/**
 * Pusat Panduan Pengguna — content sumber tunggal (sir zul, Master
 * Instruction tambahan: "customer baharu boleh faham cara menggunakan Gold
 * Wallet tanpa bantuan staff").
 *
 * PENTING — requirement #9 sir zul: panduan ni cuma boleh describe fungsi
 * yang BENAR-BENAR live. Download Penyata PDF (Fungsi 12) sudah live
 * (26/10) — lihat langkah di bawah dalam topik "sejarah-transaksi". Ganjaran
 * & Cabaran sengaja DIGUGURKAN (bukan sekadar "akan datang") — sir zul,
 * 26/10: tak perlu buat fungsi ni. Jangan tambah apa-apa langkah untuknya.
 *
 * Tempoh (price lock, OTP window) sengaja TIDAK di-hardcode di sini — ia
 * dibaca terus dari src/lib/buyback.ts dan process.env.PRICE_LOCK_MINUTES
 * dalam page.tsx supaya automatik betul walau sir ubah env var tu nanti.
 */

export type PanduanStep = {
  title: string;
  body: string;
  /** Path under /public, e.g. "/panduan/daftar-akaun-1.jpg". Optional — falls back to the icon. */
  screenshot?: string;
};

export type PanduanTopic = {
  slug: string;
  title: string;
  shortDesc: string;
  icon: string;
  steps: PanduanStep[];
};

export const PANDUAN_TOPICS: PanduanTopic[] = [
  {
    slug: "daftar-akaun",
    title: "Daftar Akaun & Log Masuk",
    shortDesc: "Mula guna Gold Wallet dalam 2 minit — tiada kata laluan diperlukan.",
    icon: "🔐",
    steps: [
      {
        title: "Buka halaman Log Masuk",
        body: "Dari halaman utama, tekan butang \"Daftar Akaun\" (atau \"Log Masuk\" jika sudah ada akaun) di bahagian atas skrin.",
        screenshot: "/panduan/daftar-akaun-1.jpg",
      },
      {
        title: "Isikan nama, email & nombor telefon",
        body: "Untuk akaun baharu, masukkan nama penuh (seperti dalam IC), email, dan nombor telefon anda. Tiada kata laluan untuk diingati — Gold Wallet guna kod OTP sekali guna setiap kali log masuk.",
        screenshot: "/panduan/daftar-akaun-2.jpg",
      },
      {
        title: "Masukkan kod OTP",
        body: "Kod OTP 6 digit akan dihantar ke email anda. Taip kod tersebut dalam masa yang ditetapkan untuk sahkan akaun.",
      },
      {
        title: "Selesai — anda sudah masuk ke Gold Wallet",
        body: "Lepas kod OTP disahkan, anda akan terus dibawa ke Gold Wallet anda. Log masuk kali seterusnya cuma perlukan nombor telefon + OTP baharu — lebih pantas dan selamat tanpa kata laluan.",
      },
    ],
  },
  {
    slug: "beli-emas",
    title: "Beli dan Simpan Emas 916",
    shortDesc: "Kunci harga semasa dan bayar dengan selamat melalui Billplz.",
    icon: "🛒",
    steps: [
      {
        title: "Tekan \"Beli Emas 916\"",
        body: "Dari menu Gold Wallet, tekan \"Beli Emas 916\" untuk mula. Harga Jual 916 hari ini akan dipaparkan di atas.",
        screenshot: "/panduan/beli-emas-1.jpg",
      },
      {
        title: "Pilih atau taip jumlah RM",
        body: "Pilih salah satu jumlah pantas (contoh RM100, RM200) atau taip jumlah lain. Sistem akan kira terus berapa gram emas 916 yang anda akan terima berdasarkan harga semasa.",
      },
      {
        title: "Harga anda dikunci sementara (Price Lock)",
        body: "Lepas tekan teruskan, harga semasa dikunci untuk anda dalam tempoh terhad (ditunjukkan sebagai pembilang masa pada skrin) — ini bermakna harga tak akan berubah walaupun harga pasaran naik/turun semasa anda sedang bayar.",
      },
      {
        title: "Bayar melalui Billplz",
        body: "Tekan \"Teruskan Pembayaran\" untuk dibawa ke halaman pembayaran selamat Billplz (payment gateway berdaftar). Pilih kaedah pembayaran pilihan anda (FPX, kad, dll) dan selesaikan bayaran sebelum tempoh kunci harga tamat.",
      },
      {
        title: "Gram terus masuk Gold Wallet anda",
        body: "Sebaik pembayaran disahkan berjaya oleh Billplz, gram emas terus dikreditkan ke Gold Wallet anda. Jika pembayaran gagal atau tempoh kunci tamat sebelum bayar, transaksi akan ditandakan \"Tamat Tempoh\" — tiada gram ditolak dan anda boleh cuba semula.",
      },
    ],
  },
  {
    slug: "semak-baki",
    title: "Semak Baki Emas",
    shortDesc: "Lihat jumlah emas 916 yang anda ada, bila-bila masa.",
    icon: "⚖️",
    steps: [
      {
        title: "Buka Gold Wallet anda",
        body: "Lepas log masuk, anda akan terus berada di halaman Gold Wallet — baki emas anda (dalam gram) dipaparkan besar di bahagian atas.",
        screenshot: "/panduan/semak-baki-1.jpg",
      },
      {
        title: "Faham nilai RM yang dipaparkan",
        body: "Nilai RM yang ditunjukkan di sebelah baki gram adalah anggaran berdasarkan harga emas semasa — ia BUKAN baki tunai tetap. Nilai sebenar berubah mengikut harga pasaran emas 916 hari ini.",
      },
      {
        title: "Emas Tersedia vs Emas Dalam Hold",
        body: "Dalam Dashboard Simpanan Saya, baki dipecahkan kepada \"Emas Tersedia\" (boleh dijual/ditebus bila-bila masa) dan \"Emas Dalam Hold\" (sedang direzab sementara untuk tebusan barang kemas yang belum disahkan). Jumlah kedua-duanya ialah jumlah emas sebenar anda.",
      },
    ],
  },
  {
    slug: "tebus-barang-kemas",
    title: "Tebus Barang Kemas",
    shortDesc: "Tukar baki emas anda kepada barang kemas sebenar — melalui staff Miragold.",
    icon: "💍",
    steps: [
      {
        title: "Hubungi/lawati Miragold untuk buat quotation",
        body: "Tebusan barang kemas bermula dengan staff Miragold menyediakan sebut harga (quotation) untuk item yang anda nak tebus — sama ada anda WhatsApp terus, hubungi semasa TikTok Live, atau datang sendiri (walk-in) ke kedai.",
      },
      {
        title: "Terima link sahkan tebusan",
        body: "Selepas quotation disediakan, staff akan hantar link pengesahan selamat kepada anda — melalui WhatsApp (jika dihubungi secara dalam talian), atau dengan kod QR untuk anda imbas sendiri dengan telefon anda (jika walk-in di kaunter).",
      },
      {
        title: "Log masuk & semak butiran",
        body: "Buka link/imbas QR tersebut, log masuk ke Gold Wallet anda (jika belum), dan semak butiran quotation — nama item, berat gram, dan baki wallet yang akan ditolak.",
      },
      {
        title: "Sahkan dengan kod OTP",
        body: "Hanya ANDA sendiri (bukan staff) yang boleh sahkan tebusan — ini untuk keselamatan akaun anda. Masukkan kod OTP yang dihantar untuk sahkan, dan gram akan ditolak dari baki \"Emas Tersedia\" wallet anda.",
      },
      {
        title: "Semak status tebusan bila-bila masa",
        body: "Buka Gold Wallet → \"Status Tebusan Saya\" untuk lihat quotation yang masih menunggu tindakan, atau yang sudah selesai/dibatalkan.",
        screenshot: "/panduan/tebus-barang-kemas-1.jpg",
      },
    ],
  },
  {
    slug: "jual-balik-emas",
    title: "Jual Balik Emas",
    shortDesc: "Tukar emas dalam Gold Wallet anda kepada wang tunai.",
    icon: "💰",
    steps: [
      {
        title: "Tekan \"Jual Emas\"",
        body: "Dari menu Gold Wallet, tekan \"Jual Emas\". Pastikan maklumat akaun bank anda sudah lengkap di Profil Saya — ini diperlukan untuk bayaran balik.",
        screenshot: "/panduan/jual-balik-emas-1.jpg",
      },
      {
        title: "Pilih jumlah gram untuk dijual",
        body: "Taip jumlah gram yang anda nak jual, atau pilih \"Jual Semua\" untuk jual keseluruhan baki tersedia anda. Sistem akan kira jumlah RM berdasarkan Harga Beli Balik 916 semasa.",
      },
      {
        title: "Semak & sahkan dengan OTP",
        body: "Semak semula jumlah gram dan RM yang akan diterima pada skrin pratonton. Masukkan kod OTP untuk sahkan permohonan jual balik.",
      },
      {
        title: "Tunggu bayaran diproses",
        body: "Lepas disahkan, permohonan anda akan disemak oleh pihak Miragold dan bayaran akan dibuat melalui pindahan bank terus ke akaun berdaftar anda mengikut tempoh pemprosesan yang dinyatakan pada skrin.",
      },
    ],
  },
  {
    slug: "dashboard-simpanan",
    title: "Dashboard Simpanan Saya",
    shortDesc: "Pantau sasaran, perkembangan dan nilai simpanan emas anda.",
    icon: "📊",
    steps: [
      {
        title: "Buka Dashboard Simpanan Saya",
        body: "Dari menu Gold Wallet, tekan \"Dashboard Simpanan Saya\" (atau link \"Lihat Dashboard Simpanan Penuh\" pada halaman Gold Wallet utama).",
        screenshot: "/panduan/dashboard-simpanan-1.jpg",
      },
      {
        title: "Tetapkan Sasaran Simpanan Emas",
        body: "Pilih sasaran gram (contoh 5g, 10g) atau taip sasaran sendiri. Dashboard akan tunjuk bar perkembangan berdasarkan baki emas semasa anda berbanding sasaran tersebut.",
      },
      {
        title: "Lihat Graf Perkembangan Simpanan",
        body: "Tukar tempoh paparan (1 bulan, 3 bulan, 6 bulan, 1 tahun, Semua) untuk lihat bagaimana baki emas anda berkembang dari masa ke masa, dikira dari transaksi yang berstatus selesai sahaja.",
      },
      {
        title: "Guna Kalkulator & Pelan Simpanan Bulanan",
        body: "Kalkulator menunjukkan anggaran gram yang anda akan dapat untuk jumlah RM tertentu pada harga semasa (simulasi sahaja, bukan transaksi sebenar). Pelan Simpanan Bulanan pula anggarkan berapa lama untuk capai sasaran anda berdasarkan bajet bulanan yang anda tetapkan.",
      },
      {
        title: "Semak Analisis Nilai, Milestone & Sejarah Harga",
        body: "Analisis Nilai Emas tunjuk anggaran nilai jual balik semasa. Milestone Simpanan (1g, 5g, 10g, 20g, 50g) adalah penanda motivasi sahaja — bukan ganjaran kewangan automatik. Sejarah Harga Emas 916 tunjuk pergerakan harga jual & beli balik dari masa ke masa.",
      },
    ],
  },
  {
    slug: "sejarah-transaksi",
    title: "Sejarah Transaksi",
    shortDesc: "Semak setiap transaksi dan pergerakan emas dalam akaun anda.",
    icon: "🧾",
    steps: [
      {
        title: "Tatal ke bahagian \"Sejarah Transaksi\"",
        body: "Pada halaman Gold Wallet utama, tatal ke bawah ke bahagian \"Sejarah Transaksi\" — setiap percubaan pembelian direkod di sini, termasuk yang gagal atau tamat tempoh.",
        screenshot: "/panduan/sejarah-transaksi-1.jpg",
      },
      {
        title: "Faham status setiap transaksi",
        body: "\"Selesai\" bermakna gram sudah masuk wallet anda. \"Tamat Tempoh\" bermakna kunci harga luput sebelum bayaran selesai (tiada apa-apa ditolak). \"Dibatalkan\" bermakna permohonan dibatalkan.",
      },
      {
        title: "Semak Rekod Pergerakan Emas",
        body: "Bahagian \"Rekod Pergerakan Emas\" (dalam Dashboard Simpanan Saya → Penyata & Aktiviti) tunjuk setiap gram masuk dan keluar secara terperinci — pembelian, jualan, tebusan, dan sebarang pelarasan oleh pihak Miragold — lengkap dengan baki selepas setiap transaksi.",
      },
      {
        title: "Download Penyata PDF",
        body: "Dalam bahagian \"Penyata & Aktiviti\" yang sama, pilih tempoh (1 bulan, 3 bulan, 6 bulan, 1 tahun, atau Semua) lalu tekan \"Download Penyata PDF\". Skrin cetak akan terbuka — pilih \"Simpan sebagai PDF\" untuk muat turun penyata rasmi simpanan emas anda, lengkap dengan baki awal dan baki akhir tempoh tersebut.",
      },
    ],
  },
];

export type FaqItem = { question: string; answer: string };

export const PANDUAN_FAQ: FaqItem[] = [
  {
    question: "Apakah dimaksudkan dengan \"gram\" dalam Gold Wallet?",
    answer:
      "Baki Gold Wallet anda direkod dalam gram emas 916 — ini adalah rekod simpanan emas sebenar, BUKAN akaun tunai. Nilai RM yang dipaparkan adalah anggaran berdasarkan harga emas semasa dan berubah mengikut pasaran.",
  },
  {
    question: "Macam mana harga emas 916 ditentukan?",
    answer:
      "Miragold mengemaskini Harga Jual 916 dan Harga Beli Balik 916 dari semasa ke semasa mengikut harga pasaran semasa. Harga terkini sentiasa dipaparkan di halaman Gold Wallet dan Beli Emas.",
  },
  {
    question: "Apa itu \"Emas Dalam Hold\" (Gold Hold)?",
    answer:
      "Apabila staff Miragold menyediakan quotation untuk tebusan barang kemas anda, gram yang terlibat direzab sementara sebagai \"Dalam Hold\" — ia tidak boleh dijual/ditebus di tempat lain semasa menunggu pengesahan anda. Gram akan kembali \"Tersedia\" secara automatik jika quotation dibatalkan atau tamat tempoh.",
  },
  {
    question: "Macam mana pembayaran diproses?",
    answer:
      "Semua pembayaran pembelian emas diproses melalui Billplz, payment gateway berdaftar. Gram hanya dikreditkan ke wallet anda selepas Billplz mengesahkan pembayaran berjaya.",
  },
  {
    question: "Macam mana jual balik (buyback) emas berfungsi?",
    answer:
      "Tekan \"Jual Emas\", pilih jumlah gram, sahkan dengan kod OTP. Bayaran dibuat melalui pindahan bank ke akaun berdaftar anda mengikut tempoh pemprosesan yang dinyatakan semasa anda membuat permohonan.",
  },
  {
    question: "Macam mana tebusan barang kemas (redemption) berfungsi?",
    answer:
      "Tebusan bermula dengan staff Miragold (bukan sistem automatik) menyediakan quotation untuk item yang anda nak tebus — sama ada melalui WhatsApp, semasa TikTok Live, atau walk-in di kedai. Anda sahaja yang boleh sahkan quotation tersebut (log masuk + OTP) — staff tidak boleh sahkan bagi pihak anda.",
  },
];
