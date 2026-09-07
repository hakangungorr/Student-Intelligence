# Student Intelligence

Eğitim kurumları için öğrenci risk tespit ve karar destek panosu.
American LIFE pilotu için hazırlanan çalışan demo.

> **Bu depodaki veri sentetiktir.** 100 öğrencinin tamamı üretilmiştir; gerçek
> American LIFE verisi değildir. Arayüzde de "ÖRNEK VERİ" ibaresi görünür.

---

## Ürün tek cümlede

Öğrenci verisini okuyup **hangi öğrenciye, neden müdahale edilmesi gerektiğini ve
önerilen aksiyonu** yöneticinin önüne getiren karar destek sistemi.

Sistem "kim kötü durumda?" demiyor; **neden riskli olduğunu, kimin ne yapması
gerektiğini** söylüyor.

---

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `dashboard.html` | Panonun tamamı — tek dosya, build yok, sunucu gerekmiyor |
| `risk_engine_v4.py` | Risk motoru v0.4 · deterministik, LLM yok |
| `demo_dataset.json` | 100 sentetik öğrenci · 4 şube · A1–C1 · iki haftalık karşılaştırma |
| `HANDOFF.md` | Ürün kararlarının gerekçeleri ve yeniden açılmayacak kararlar |

## Çalıştırma

```bash
open dashboard.html          # macOS
```

Hepsi bu. Veri, yazı tipleri ve mantık dosyanın içinde gömülü; internet
bağlantısı, paket kurulumu veya sunucu gerekmiyor.

Risk motorunu ayrıca çalıştırmak için:

```python
from risk_engine_v4 import score_all
scored, benchmarks = score_all(students)
```

---

## Risk motoru

Dört bağımsız boyut, sabit ağırlık. Ortalamaya gömülmeyi engellemek için
bileşik skorun yanında güvenlik kuralları var.

| Boyut | Ağırlık | Kalibrasyon | Girdi |
|---|---|---|---|
| Test performansı | %30 | Kur içi göreli | Sınav trendi, monotonik düşüş, kur ortalamasına uzaklık |
| Beceri profili | %25 | Kur içi göreli | Kur ortalamasına uzaklık + beceri dengesizliği |
| Sınıf içi performans | %20 | Mutlak | Katılım, ödev, eğitmen endişesi |
| Devam | %25 | Mutlak | Oran + son 4 hafta trendi |

- **Eşikler:** HIGH ≥ 65 · MEDIUM ≥ 30 · altı LOW
- **Güvenlik kuralı:** 3+ boyut ≥ 60 ise bileşik skor ne olursa olsun HIGH
- **Kohort referansı:** her kurun en iyi %25'inin ortalaması
- **Mutlak taban:** geçme notu 60 *(kuruma doğrulatılacak — aşağıya bakınız)*
- **Sıralama** tavansız `risk_score_raw` ile yapılır; gösterimdeki skor 100'de sınırlıdır

Skoru dil modeli hesaplamaz. Arayüz de hesaplamaz — yalnızca motorun çıktısını
insan diline çevirir.

---

## Arayüz kararları

**Skor değil cümle.** Ekranda "Devam boyutu 100" yazmaz;
"Her 10 dersin 5'ine gelmiyor — devam oranı %50, son bir ayda %38'e düştü" yazar.
Hedef kitle yönetici ve öğretmen; boyut/ağırlık/kohort motorun iç kavramlarıdır.

**Renk disiplini.** Kırmızı, sarı ve yeşil **yalnızca veriye** aittir. Arayüzün
hiçbir yerinde durum rengi kullanılmaz — böylece ekranda gördüğünüz her kırmızı
bir öğrenci sorunudur. Marka kırmızısının tek yeri sol üstteki logo işaretidir.

**Dörtlük.** Her öğrenci satırının solundaki dört hücreli işaret dört alanın
durumunu gösterir: Sınav notları · Dil becerileri · Derse katılım · Devamsızlık.
Sıra her ekranda aynıdır.

**Türkçe ekler kurala bağlıdır.** Ek, sayının son okunan sözcüğüne göre değişir
(`47'si` ama `54'ü`, `38'e` ama `47'ye`). Elle yazılan ekler hatalıydı; artık
tablodan üretiliyor.

---

## Kapsam dışı bırakılanlar ve nedenleri

- **Bağlılık / memnuniyet skoru yok.** Anket dönemde bir kez toplanıyor, yanıt
  oranı düşük ve "3/10" yazan öğrenci çoktan gitmeye karar vermiş oluyor — erken
  uyarı değil. `satisfaction_score` alanı durur ve öğrenci kartında *gösterilir*,
  skora girmez.
- **Eğitmen analitiği yok.** Eğitmen adı öğrenci kaydında durur (kiminle
  görüşüleceği bilinsin diye) ama analiz ekseni değildir: filtre, sıralama veya
  kıyaslama yoktur. Gerekçe `HANDOFF.md` §4'te.
- **Kayıt yenileme / ödeme geçmişi yok.** Veri sistemde bulunmuyor; dolayısıyla
  "kimler kaydını yenilemeyecek" sorusu bugün cevaplanamıyor. Pilotta CRM ve
  ödeme verisi bağlandığında açılacak.

## Açık kalanlar

1. **Geçme notu 60 varsayımı doğrulanmadı.** Değişirse "geçme notunun altında"
   uyarılarının kimlere çıkacağı değişir (60'ta 19 öğrenci, 50'de 13, 70'te 36).
2. **İlk hafta karşılaştırma yapılamaz.** "Geçen haftaya göre" metrikleri ve
   "iyiye giden öğrenciler" paneli ikinci haftadan itibaren dolar; geçmiş veri
   yoksa bu bölümler kendiliğinden gizlenir.
3. **Sınıf içi verisi öğretmen tarafından girilir ve yöneticiye görünür.**
   Bu şeffaflığın öğretmenle konuşulması gerekir; en büyük farklılaştırıcı bu
   veriye bağlı.

---

## Teknik notlar

Bağımlılık yok. Tek `.html` dosyası; veri, yazı tipleri ve mantık gömülü.

- **Yazı tipleri** dosyaya `data:` URI olarak gömülüdür (latin + latin-ext, tam
  Türkçe kapsama). Kurumsal ağ Google Fonts'u keserse görünüm bozulmaz.
  Familjen Grotesk, Source Sans 3 ve IBM Plex Mono — üçü de SIL Open Font
  License 1.1 ile dağıtılır.
- **Aksiyon işaretlemeleri** yayımlanmış sürümde sunucuda, yerel dosyada
  `localStorage`'da tutulur. İkisi de yoksa sayfa yine çalışır.
- **Tema** açık / koyu / sistem olarak seçilebilir; seçim tarayıcıda saklanır.
- Grafiklerin tamamı elle yazılmış SVG/CSS — grafik kütüphanesi yok.

## Doğrulanmış davranışlar

- KPI'lar ve ısı matrisleri öğrenci satırlarından yeniden hesaplanır; kurum
  genelinde `demo_dataset.json`'daki `kpi` bloğuyla birebir aynı sonucu verir
- Öncelik listesi ham skora göre sıralıdır
- "Acil" etiketli ama gerekçe gösterilmeyen öğrenci yoktur
- 390 px mobil ve 1440 px masaüstü görünümünde yatay taşma yoktur
- Açık/koyu tema ve klavyeyle aksiyon tamamlama kontrol edildi

## American LIFE UI/UX güncellemesi

- Lacivert gezinme alanı ve her ekranda şube/tema seçimi.
- Geniş ekranda öncelik listesiyle yan yana şube ve kur risk haritası.
- Gündemde ilk iki risk nedeni; tüm sinyaller öğrenci kartında ve listede.
- Ayrı aksiyon alanı, tamamlandı/geri al akışı ve klavye desteği.
- Mobilde iki sütunlu menü ve özet kartları; dar ekranda tek sütunlu içerik.
- Gömülü yazı tiplerinin önündeki açık CSS yorumu düzeltildi.
- Risk motoru ve sentetik veri değişmedi.

Yerel önizleme: `python3 -m http.server 8765 --bind 127.0.0.1`, ardından
`http://127.0.0.1:8765/dashboard.html`. Dosya doğrudan açıldığında da çalışır.

Tarayıcıda kontrol edilenler: açık/koyu tema, 390 px mobil görünüm,
1440 px masaüstü görünümü, öğrenci araması, İzmir kapsamı (22 öğrenci /
7 acil), öğrenci detayı, klavyeyle aksiyon tamamlama, geri alma ve demo sorusu.
