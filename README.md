# FDM / SLA Baskı Fiyat Hesaplama

STL (veya OBJ) dosyası yükleyin; **Bambu Lab A1 Combo**, **Bambu Lab X2D Combo** (FDM) ve **Elegoo Jupiter 2** (reçine) için malzeme, süre, maliyet ve satış fiyatı tahmini alın. Tüm hesaplama tarayıcıda yapılır; dosya hiçbir sunucuya gönderilmez, bu yüzden statik olarak (GitHub Pages, Cloudflare Pages, Vercel) ücretsiz yayınlanabilir.

## Özellikler

- 200 MB'a kadar binary/ASCII STL ve OBJ; ayrıştırma ve analiz Web Worker'da (arayüz donmaz)
- Geometri: hacim, yüzey alanı, bounding box, tabla teması, sarkma (destek) yüzeyleri, manifold kontrolü, katman katman kesit alanı/çevre
- 3B önizleme: yazıcı tablası, sarkmaların turuncu renklendirilmesi, 90° döndürme, inç/mm
- FDM modeli: duvar + üst/alt kabuk + dolgu + destek + purge/flush israfı; katman bazlı süre (malzeme/makine akış tavanı, min. katman süresi, ısınma/kalibrasyon, AMS renk değişimi)
- Reçine modeli: hacim + destek + boşaltma; katman × (pozlama + kaldırma döngüsü); IPA, FEP/LCD sarfı
- Maliyet: malzeme, elektrik, amortisman, bakım, işçilik, başarısızlık riski, kâr marjı, KDV, minimum sipariş, adet
- Adet girildiğinde tabla bazlı parti hesabı: parçalar tablaya ızgara yerleşimiyle sığdırılır, reçinede süre parça sayısından bağımsız (katman sayısı), FDM'de ısınma/kalibrasyon ve renk değişimleri tabla başına amortize edilir
- Üç yazıcının aynı model için yan yana karşılaştırması (adet başına ve toplam sipariş fiyatı)
- Kendi yazıcınızı ve malzemenizi ekleyebilirsiniz (şablondan kopyalayarak); özel yazıcı/malzemeler yalnızca o tarayıcının localStorage'ında saklanır, kimseyle paylaşılmaz
- Müşteriye gönderilebilir **teklif PDF'i**: firma bilgisi ve logo (PNG/JPEG/SVG, tarayıcıda saklanır), 3B görünümden model görseli, kalemsiz fiyat tablosu (kâr marjı ya da elle girilen birim/toplam fiyat), KDV, isteğe bağlı üretim bilgisi; Türkçe karakterler için gömülü DejaVu Sans
- Tüm fiyat/parametreler tarayıcıda (localStorage) saklanır; yazdır çıktısı

## Geliştirme

```bash
npm install
npm run dev
```

Üretim derlemesi: `npm run build` → `dist/`.

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
