# Pilot hazırlığı — kuruma gitmeden önce

Bu belgenin tek amacı var: **kurumdan önceden bilgi almadan** karşılarına
çıkabilmek. Cevabını bilmediğimiz her soru ya makul bir varsayımla dolduruldu ve
ekrandan değiştirilebilir hâle getirildi, ya da burada açıkça "bugün
cevaplanamıyor" diye yazıldı. Toplantıda not almak yerine ayarı değiştirip
sonucu göstermek esas alınır.

---

## 1. Sistemin kurum adına verdiği kararlar

Risk motorunun geri kalanı kurumun kendi verisinden kalibre olur — her kurun
karşılaştırma değeri o kurun en iyi %25'inin ortalamasıdır, dışarıdan eşik
verilmez. Aşağıdaki üç değer hesaplanamaz, çünkü bunlar kurumun kararıdır.

| Karar | Varsayılan | Nerede değişir | Değişince ne olur |
|---|---|---|---|
| Geçme notu | 60 | Kurum ayarları | Sınav ve beceri puanlarında "geçme notunun altında" uyarısı; öğrenci kartındaki kesikli çizgi |
| Devamsızlıkta kritik sınır | %75 | Kurum ayarları | Gündemdeki "Devamsızlığı kritik" sayısı ve kur bulguları |
| Kur adları | A1 · A2 · B1 · B2 · C1 | Kurum ayarları | Aktarımda ve formlarda kabul edilen kur adları |

Kaydedildiği anda bütün öğrencilerin skoru yeni değerlerle yeniden hesaplanır;
ayrı bir adım yok. Ayarlar sayfası, kaydetmeden önce **"geçme notu 70 olsaydı
kaç öğrenci etkilenirdi"** sorusunu kurumun kendi verisi üzerinde cevaplar. Yani
"geçme notunuz kaç?" sorusu bir engel değil, otuz saniyelik bir ayar.

Kasten ayarlanabilir **olmayanlar:** boyut ağırlıkları, HIGH/MEDIUM eşikleri,
kohort yüzdesi. Bunlar yüz öğrencilik veri üzerinde kalibre edildi; ekrandan
değiştirilmeleri aynı öğrencinin kimin baktığına göre farklı skor almasına yol
açar.

Ayarlanamayan ama veri sözleşmesinden gelen varsayımlar: dönem başına **dört
sınav notu**, **dört beceri puanı** (0–100), devam için **dönem oranı + son dört
hafta**, sınıf içi için **katılım (1–10) + ödev (%) + eğitmen endişesi**. Kurumun
elinde bunların bir kısmı yoksa öğrenci yine aktarılır, yalnızca skoru
hesaplanmaz ve nedeni aktarım ekranında satır satır yazar.

---

## 2. Kurumdan istenen tek şey: bir liste

Toplantıya "şu alanları hazırlayın" listesiyle gitmiyoruz. İstenen tek şey
kurumun **zaten elinde olan** öğrenci listesinin CSV hâli.

- Excel'de: *Farklı Kaydet → CSV UTF-8 (virgülle ayrılmış)*. Noktalı virgül,
  virgül ve sekme ayırıcıların üçü de tanınır.
- Başlıkları çevirmek gerekmez: `Öğrenci No`, `Ad Soyad`, `Şube`, `Kur`,
  `Devam Oranı`, `Sınav 1`, `Konuşma`, `Ödev Tamamlama`, `Eğitmen Endişesi` gibi
  Türkçe başlıklar tanınır. Büyük harf, boşluk ve noktalama farkı önemsizdir.
- Zorunlu olan yalnızca dört sütun: öğrenci numarası, ad, şube, kur. Gerisi
  varsa okunur, yoksa o öğrenci eksik veriyle listede durur.
- Hazır bir dışa aktarım yoksa: **Veri aktarımı → boş şablonu indirin.** Şablon
  kurumun kendi şube ve kur adlarıyla üretilir.
- Dosya önce doğrulanır ve önizlenir; onaylanmadan hiçbir şey yazılmaz. Aynı
  dosyayı ikinci kez yüklemek satırları çoğaltmaz, günceller.

Excel dosyası (`.xlsx`) doğrudan okunmaz — bu bilinçli bir sınır, ve tek
istediğimiz şeyin "Farklı Kaydet" olduğunu söyleyebilmek yeterli.

---

## 3. Toplantı akışı (20 dakika)

Özellik turu yapılmaz. Tek hikâye: *"Her öğrenciyi tek tek takip etmek imkânsız.
Sistem sizin için takip etsin."*

| Dakika | Ne gösterilir | Neyi kanıtlar |
|---|---|---|
| 0–2 | Problem: yüzlerce öğrenci, elle takip | Neden var olduğumuz |
| 2–6 | Öğrenci gündemi — dört sayı, "önce bu 10 öğrenci" | Liste değil sıra veriyoruz |
| 6–10 | Riskli bir öğrenci kartı | Sinyalleri **birlikte** açıklıyoruz: sınav düşüşü + devamsızlık + konuşma |
| 10–13 | "Ne yapmalı" ve tamamlandı işaretleme | Skor değil aksiyon üretiyoruz |
| 13–16 | Soru sor: "Bu hafta kimlerle ilgilenmeliyiz?" | Cevaplar veritabanından hesaplanıyor, uydurulmuyor |
| 16–20 | Kurum ayarları + pilot planı | Varsayımlarımız pazarlığa açık, kod değişikliği gerektirmiyor |

Elde kurumun kendi dosyası varsa 13–16 aralığı **canlı aktarımla** değiştirilir:
dosya yüklenir, önizlenir, yazılır ve skorlar aynı ekranda hesaplanır. Bu, bütün
sunumdan daha ikna edicidir.

Demoda gösterilen veri sentetiktir ve ekranda öyle yazar. Bunu biz söyleriz;
sorulmasını beklemeyiz.

---

## 4. Gelmesi beklenen sorular ve hazır cevaplar

**"Bizim geçme notumuz 70."**
Kurum ayarlarından değiştirilir, skorlar kaydedince yeniden hesaplanır. Aynı
ekran, kaydetmeden önce hangi notun kaç öğrenciyi etkilediğini kendi verileri
üzerinde gösterir.

**"Kurlarımızın adı farklı."**
Kur adları da ayarlardan yazılır. Aktarımda büyük/küçük harf farkı önemsizdir.

**"Kimlerin kaydını yenilemeyeceğini görebiliyor musunuz?"**
Bugün hayır. Kayıt yenileme ve ödeme geçmişi sistemde yok; bunlar CRM ve
muhasebe tarafında duruyor. Bu veri bağlandığında bağlılık boyutu açılır. Şu an
verdiğimiz şey akademik erken uyarı; "gitmeye karar vermiş öğrenciyi" değil,
"gitmeye doğru giden öğrenciyi" gösteriyor.

**"Hangi eğitmen kötü performans gösteriyor?"**
Bilerek yok, iki nedenle. Birincisi: en kötü görünen iki eğitmen aynı şubede
çıkıyor, ama sebep o iki kişi değil, şubenin sistemik konuşma açığı — naif
sıralama yanlış kişiyi suçlar. İkincisi: sınıf içi verisini öğretmen giriyor;
ürün denetleyici algılanırsa veri gelmez ve en değerli sinyal çöker. Eğitmen adı
öğrenci kaydında durur, çünkü "eğitmenle görüşün" derken kiminle görüşüleceği
bilinmelidir.

**"Öğretmenlerimiz ne yapacak?"**
Veri girişi ekranı: bir sınıf, bir sütun, bir ekran. Öğretmen yalnızca kendisine
atanmış öğrencileri görür ve yalnızca onlara veri girer. Bir sınıfın katılım
sütununu doldurmak birkaç dakika sürer.

**"Verimiz nerede duruyor?"**
Kurum için ayrı bir veritabanı projesi açılır; bölge ve veri işleme koşulları
kurumla birlikte belirlenir. Erişim veritabanı seviyesinde sınırlıdır: şube
yöneticisi kendi şubesini, eğitmen yalnızca kendi öğrencilerini görür ve bu
kural uygulamada değil veritabanında yazılıdır. Uygulama bütün politikaları
atlayan yönetici anahtarını kullanmaz. Demo verisi sentetiktir; gerçek öğrenci
verisi depoya veya test ortamına konmaz.

**"Ne kadar sürede kurulur?"**
Hesap açma ve şube tanımlarıyla birlikte yarım gün; veriyi biz yüklüyorsak liste
elimize geçtiği gün. Kurulum adımları aşağıda.

**"Geçen haftaya göre değişim neden boş?"**
İlk ölçümde karşılaştıracak kesit yoktur. "İyiye giden öğrenciler" paneli ve
haftalık değişim sayıları ikinci ölçümden itibaren dolar; boş olduklarında
ekran bunu yazar, sıfır göstermez.

---

## 5. Pilot kurulumu — bizim tarafımızdaki adımlar

1. Kuruma ait ayrı Supabase projesi; migration'lar önce staging'de uygulanır.
   (`docs/PRODUCTION.md`)
2. İlk yönetici hesabı Supabase panelinden açılır, kurum ve ilk şube SQL ile
   tanımlanır. *(Uygulama hesap açamaz: bunun için bütün erişim kurallarını
   atlayan yönetici anahtarı gerekir ve o anahtar bilinçli olarak kullanılmıyor.)*
3. Şubeler eklenir.
4. **Kurum ayarları** doldurulur: geçme notu, devam sınırı, kur adları.
5. Öğrenci listesi CSV olarak aktarılır; önizleme kontrol edilir.
6. Skorlar hesaplanır (aktarım sonunda kendiliğinden çalışır).
7. Ekip eklenir ve eğitmenlere sınıf atanır — atama yapılmadan eğitmen giriş
   yapar ama hiçbir öğrenci göremez.
8. İkinci ölçüm için tarih belirlenir; karşılaştırmalı ekranlar o tarihten sonra
   anlamlanır.

---

## 6. Bugün konuşulmayacak olanlar

Sorulursa cevabı var, ama gündeme biz getirmiyoruz: gerçek zamanlı entegrasyon,
öğrenci/veli uygulaması, WhatsApp bildirimleri, ML tahmin modeli, ödeme ve CRM
bağlantısı. Hepsi pilot sonrası konuşulur. Pilotun tek amacı şu soruya cevap
vermek: **kurum bu listeye bakıp bir şey yapıyor mu, ve yaptığında sayılar
düzeliyor mu?**
