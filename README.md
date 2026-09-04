# FDM / SLA Baskı Fiyat Hesaplama

STL (veya OBJ) dosyası yükleyin; **Bambu Lab A1 Combo**, **Bambu Lab X2D Combo** (FDM) ve **Elegoo Jupiter 2** (reçine) için malzeme, süre, maliyet ve satış fiyatı tahmini alın. Tüm hesaplama tarayıcıda yapılır; dosya hiçbir sunucuya gönderilmez, bu yüzden statik olarak (GitHub Pages, Cloudflare Pages, Vercel) ücretsiz yayınlanabilir.

## Özellikler

- 200 MB'a kadar binary/ASCII STL, OBJ, 3MF (birim, çoklu nesne, bileşen dönüşümleri, üretim uzantısı; Bambu/Orca proje 3MF'inden renk/ekstruder sayısı) ve STEP/IGES/BREP (occt-import-js, LGPL-2.1, ~7 MB WASM yalnızca gerektiğinde yüklenir); ayrıştırma ve analiz Web Worker'da (arayüz donmaz); 1,5 milyon üçgen üstünde görüntü meshoptimizer ile sadeleştirilir, hesaplar tam mesh'te kalır
- Geometri: hacim, yüzey alanı, bounding box, tabla teması, sarkma (destek) yüzeyleri, manifold kontrolü, katman katman kesit alanı/çevre
- Basılabilirlik (DFM): manifold/açık kenar, ayrı kabuk sayısı, ters çevrilmiş üçgenler, birim sezgisi (inç/mikron), devrilme riski, tabla teması; duvar kalınlığı analizi (yüzeyden içeri ışın, three-mesh-bvh) ile ince bölgeler kırmızı boyanır, en ince %5 ve ince yüzey oranı raporlanır (FDM eşiği 2 hat genişliği, reçine 0,6 mm)
- 3B önizleme: yazıcı tablası, sarkmaların turuncu renklendirilmesi, ince duvarların kırmızı gösterimi, 90° döndürme, inç/mm
- FDM modeli: duvar + üst/alt kabuk + dolgu + destek + purge/flush israfı; katman bazlı süre (malzeme/makine akış tavanı, min. katman süresi, ısınma/kalibrasyon, AMS renk değişimi)
- Reçine modeli: hacim + destek + boşaltma; katman × (pozlama + kaldırma döngüsü); IPA, FEP/LCD sarfı
- Maliyet: malzeme, elektrik, amortisman, bakım, işçilik, başarısızlık riski, kâr marjı, KDV, minimum sipariş, adet
- **Dilimleyici verisi içe aktarma:** Bambu Studio / OrcaSlicer / PrusaSlicer G-code'u ya da .gcode.3mf projesi (ve Cura G-code'u) sürüklenince gerçek süre ve filament ağırlığı okunur, model tahminiyle farkı gösterilir ve fiyatlamada kullanılır (parça sayısına bölünür). Kalibrasyon: dilimleyici/gerçek baskı verisi yazıcı × malzeme başına kaydedilir, medyan düzeltme katsayısı sonraki tahminlere uygulanır (Ayarlar › Kalibrasyon)
- Paylaşım: teklif penceresinden WhatsApp mesajı (wa.me), sunucusuz paylaşım bağlantısı (teklif özeti URL içinde sıkıştırılmış; açan kişi salt-okunur özet görür), CSV indirme; PDF'e WhatsApp/web sitesi QR kodu; tüm ayar ve verilerin JSON yedeği (dışa/içe aktarma)
- Ticari ayarlar: kademeli adet indirimi (eşik/yüzde tablosu), 1/10/50/100 adet fiyat merdiveni, teslim süresi tahmini (yazıcı sayısı × günlük saat), KDV ön ayarları (%20/10/1/0) ve KDV dahil vurgu, EUR/USD gösterimi (Frankfurter/ECB kurları tek tıkla, PDF'de kur dipnotu), elektrik tarifesi ön ayarları (mesken kademe 1/2, ticarethane, sanayi)
- Adet girildiğinde tabla bazlı parti hesabı: parçalar tablaya ızgara yerleşimiyle sığdırılır, reçinede süre parça sayısından bağımsız (katman sayısı), FDM'de ısınma/kalibrasyon ve renk değişimleri tabla başına amortize edilir
- **Çok parçalı proje:** birden fazla dosya (+ Parça ekle) aynı teklifte; her parçanın kendi adedi, döndürmesi ve ölçeği vardır. Tüm kopyalar aynı yazıcı/malzeme ile karışık tablalara MaxRects (best-short-side-fit, 90° döndürme) ile yerleştirilir; FDM'de tabla süresi katman katman toplanır (soğutma tabanı ortak, ısınma bir kez), reçinede en yüksek parçanın katman sayısı belirler. Fiyat parçalara tek başına maliyet ağırlığıyla dağıtılır; 3B görünümde tabla tabla yerleşim gösterilir, PDF'e parça tablosu eklenir. Sığmayan parça hesap dışı bırakılıp uyarılır (en fazla 24 parça)
- **Teklif geçmişi ve müşteri kartı:** teklif penceresindeki “Kaydet” ya da PDF indirme, teklifi (no, tarih, müşteri, model/parçalar, yazıcı, malzeme, adet, fiyat, maliyet, üretim özeti, küçük görsel, paylaşım özeti) tarayıcının IndexedDB'sine yazar. Üst çubuktaki “Teklifler” penceresinde arama, durum (taslak/gönderildi/kabul/red), müşteri filtresi, not, paylaşım bağlantısı/WhatsApp, CSV listesi; müşteri kartlarında telefon/e-posta/firma (telefon varsa WhatsApp paylaşımı doğrudan o numaraya gider, teklifte ad yazınca otomatik kart açılır, otomatik tamamlama). Geçmiş JSON yedeğe dahildir
- Üç yazıcının aynı model için yan yana karşılaştırması (adet başına ve toplam sipariş fiyatı)
- Dahili katalog: 4 Türk perakendecisinden (3dultra, robo90, rhino3dprinter, metatechtr) derlenen ~150 FDM/reçine yazıcı ve ~390 filament/reçine (marka + tür bazında, kg fiyatı medyan; fiyatı olmayan ya da siteler arasında tabla/fiyat/kasa bilgisi çelişen kayıtlar atılır). `scripts/build-catalog.py` JSON kaynaklarını (`scripts/catalog/`) tekilleştirip `src/data/catalog.ts` üretir; teknik parametreler sınıf sezgileriyle türetilir (elle doğrulanmış 9 profil `printers.ts` içinde önceliklidir)
- Kendi yazıcınızı ve malzemenizi ekleyebilirsiniz (şablondan kopyalayarak); özel yazıcı/malzemeler yalnızca o tarayıcının localStorage'ında saklanır, kimseyle paylaşılmaz
- Müşteriye gönderilebilir **teklif PDF'i**: firma bilgisi ve logo (PNG/JPEG/SVG, tarayıcıda saklanır), 3B görünümden model görseli, kalemsiz fiyat tablosu (kâr marjı ya da elle girilen birim/toplam fiyat), KDV, isteğe bağlı üretim bilgisi; Türkçe karakterler için gömülü DejaVu Sans
- Tüm fiyat/parametreler tarayıcıda (localStorage) saklanır; yazdır çıktısı

## Geliştirme

```bash
npm install
npm run dev
```

Üretim derlemesi: `npm run build` → `dist/`. Motor/dilimleyici regresyon testleri: `npm test` (Node 22+, tip sıyırma ile çalışır).

## Yayınlama

### GitHub Pages
1. Depoyu GitHub'a gönderin (`main` dalı).
2. Repo › Settings › Pages › Source: **GitHub Actions** seçin.
3. `.github/workflows/deploy-pages.yml` her push'ta derleyip yayınlar. Site adresi `https://<kullanıcı>.github.io/<repo>/` olur (alt dizin için `VITE_BASE` otomatik ayarlanır).

### Cloudflare Pages
- Dashboard › Workers & Pages › Create › Pages › Git'e bağlayın. Build command `npm run build`, output `dist`.
- veya CLI: `npm run build && npx wrangler pages deploy dist`

### Vercel
- Projeyi içe aktarın; `vercel.json` framework'ü Vite olarak tanımlar. Ek ayar gerekmez.

> Özel alan adında kök dizinden servis ediyorsanız `VITE_BASE` tanımlamayın (varsayılan `/`).

## Hesaplama yöntemi (özet)

| Adım | Yöntem |
|---|---|
| Hacim | Üçgenlerin işaretli tetrahedron toplamı (kapalı mesh varsayımı; açık mesh'te uyarı) |
| Sarkma / destek | Normali dikeyden eşik açısından fazla aşağı bakan yüzeyler; izdüşüm alanı × tablaya yükseklik = destek sütunu hacmi × destek yoğunluğu |
| FDM malzeme | Σ(katman çevresi × duvar kalınlığı × katman) + yatay yüzey alanı × kabuk kalınlığı + (hacim − kabuk) × dolgu % + destek + israf |
| FDM süre | Katman başına hacim ÷ efektif akış; efektif akış = min(malzeme, makine) maks. akış × k(S/V) × makine verimi; min. katman süresi tabanı; katman geçişi; ısınma/kalibrasyon; renk değişimleri |
| Reçine malzeme | Hacim (boşaltma: kabuk + kalan) + destek oranı + %8 yıkama kaybı; yoğunluk ~1.10 |
| Reçine süre | taban katman × (taban pozlama + döngü) + kalan × (pozlama + döngü) |
| Parti (adet) | parça/tabla = ⌊(tabla+aralık)/(parça+aralık)⌋ her iki eksende (90° denenir); tabla sayısı = ⌈adet/parça⌉. FDM: tabla süresi = iş başlangıcı + Σ katman max(k×t, min. katman süresi) + travel (+%2–5, ≥10 parça) + renk değişimleri (tabla başına bir kez). Reçine: tabla süresi katman sayısına bağlı; statik ayırmalı makinelerde ×(1 + 0.15×kaplama) en fazla +%30, tilt-release'te ceza yok |
| İşçilik | tabla başına hazırlık (FDM 12 dk, reçine 5 dk + 10 dk yıkama/kürleme partisi) + parça başına (FDM 1.5 dk, reçine 5 dk destek sökme) |
| Maliyet | malzeme + elektrik + fiyat/ömür × saat + bakım × saat + işçilik → × başarısızlık (FDM %8, reçine %12) → × (1 + kâr) → min. sipariş → KDV |

Varsayılan değerlerin kaynakları: Bambu Lab resmi spec PDF'leri ve Bambu Wiki güç ölçümleri, BambuStudio filament/süreç profilleri (yoğunluk, maks. akış, min. katman süresi, flush hacimleri), Elegoo ürün sayfaları ve Jupiter SE resmi reçine ayarları, Tom's Hardware / CNC Kitchen incelemeleri, EPDK Nisan 2026 elektrik tarifeleri, Türkiye perakende fiyatları (Akakçe, Robolink, Metatech, Robot Sepeti). Tümü `src/data/` altında yorumlarla belirtilmiştir ve Ayarlar'dan değiştirilebilir.

## Sınırlamalar

- Gerçek bir dilimleyici çalıştırılmaz; süre tahmini ±%20–30 sapabilir. Ayarlar › **Süre kalibrasyonu** çarpanı ile kendi Bambu Studio / Chitubox sonuçlarınıza göre ayarlayın.
- Destek hacmi, sarkmanın altındaki model geometrisini hesaba katmaz (üst sınır tahmini).
- Çok renkli baskıda israf, renk geçişlerine (açık→koyu vs. koyu→açık) göre büyük farklılık gösterir.
