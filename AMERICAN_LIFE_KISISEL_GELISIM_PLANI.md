# American LIFE Student Intelligence — Kişisel Dil Gelişim ve Aksiyon Planı

**Revizyon:** 2 · 15 Eylül 2026  
**Kapsam:** Mevcut American LIFE demosunu, öğrenciye özel dil gelişim planı ve takip sistemiyle genişletmek.

## 1. Düzeltilmiş ürün yönü

Önceki dokümanın sınava hazırlık kapsamı hatalıydı. Kullanıcının verdiği “analizden aksiyona” fikri American LIFE'ın dil eğitimi süreçlerine uyarlanacak. TYT, AYT, LGS ve matematik/Türkçe modülleri bu projenin kapsamına dahil değil.

**Ürün önerisi:** Öğrenci değerlendirmelerini, öğretmen gözlemlerini ve katılım verilerini birleştir; öğrencinin hangi dil becerisinde hangi desteğe ihtiyacı olduğunu göster; öğretmen onaylı haftalık plan oluştur; çalışmayı ve sonraki beceri ölçümünü takip et.

> Ölçüm ve gözlem → beceri/alt beceri ihtiyacı → kişisel haftalık plan → uygun çalışma veya destek oturumu → katılım ve görev takibi → yeniden değerlendirme.

Mevcut risk gündemi korunur. Üzerine öğrencinin hangi çalışmayı yapacağını ve o çalışmadan sonra ne değiştiğini gösteren bir katman eklenir.

## 2. American LIFE'ın sitesinden doğrulanan bağlam

15 Eylül 2026 tarihinde resmî site incelendi:

- Kurum genel İngilizce, farklı yaş grupları, kurumsal eğitim ve başka dil programlarını listeliyor. Dil sınavlarına hazırlık da ayrı hizmetler arasında bulunuyor. Bunların tümü ilk demo kapsamına alınmıyor. [American LIFE](https://www.americanlife.com.tr/)
- Genel İngilizce sayfasında A1–C2 seviyeleri ve konuşma odaklı eğitim anlatılıyor. Demoda görünen A1–C1 kur listesi, kurumun bütün programlarını temsil etmek zorunda değil. [Genel İngilizce](https://www.americanlife.com.tr/ingilizce-kursu/)
- ART; dijital çalışmalarla sınıf eğitimini, ders öncesi hazırlığı ve ders sonrası pekiştirmeyi bir araya getiriyor. [ART eğitim sistemi](https://www.americanlife.com.tr/egitim-sistemimiz/)
- Guided Practice öğretmen eşliğinde çalışma; +More ise beceri geliştirme aktiviteleri için kurumun sunduğu mevcut destekler. [Guided Practice](https://www.americanlife.com.tr/egitim-sistemimiz/ogretmen-esliginde-ingilizce-pratik/), [+More](https://www.americanlife.com.tr/egitim-sistemimiz/ingilizce-aktiviteler/)

**Ürün çıkarımı:** Öğrencinin uygun içeriğe ve desteğe yönlendirilmesi, bu desteğin uygulanması ve gelişimin izlenmesi projenin odağı olmalı. ART'ın iç teknik yapısı, veri dışa aktarımı, API erişimi ve hâlihazırdaki kişiselleştirme özellikleri incelenmedi. Kurumun mevcut sisteminde bu özelliklerin bulunmadığı iddia edilmiyor.

Bu dokümandaki haftalık planlar, alt beceriler ve veri modeli bizim tasarım önerimizdir; kurumun doğrulanmış iç müfredatı veya resmî işleyişi değildir.

## 3. Kuruma anlatılacak değer

> Her öğrencinin ihtiyacını görünür kılın; uygun çalışmayı ve destek oturumunu planlayın; öğretmenin takibini kolaylaştırıp dil gelişimini somut kanıtlarla gösterin.

Kullanıcılar:

- **Akademik koordinatör:** Şube ve kur bazında destek ihtiyacını, bekleyen planları ve sonuçları izler.
- **Eğitmen:** Kendi öğrencilerinin ihtiyaçlarını değerlendirir; öneriyi düzenler, onaylar ve tekrar ölçer.
- **Öğrenci ilişkileri:** Katılım ve iletişim takibini yetkisi çerçevesinde yürütür.
- **Öğrenci:** Bu hafta neyi, neden ve nasıl çalışacağını görür.
- **Veli:** Çocuk/genç programında, yetkilendirildiği öğrencinin uygun gelişim özetini görür.

Yetişkin öğrenci için varsayılan çıktı öğrencinin kendi gelişim raporudur. Her öğrenciyi veli iletişimi olan bir çocuk gibi ele alma. Kurumsal eğitim raporlarının alıcı ve kapsamı ayrıca tanımlanmalı.

Öğretmen başına takip kapasitesi ve zaman tasarrufu pilotta ölçülecek hedeflerdir; kanıtlanmış sonuç gibi sunulmamalı.

## 4. Mevcut demoda korunacak parçalar

Önceki incelemede canlı gündem, öğrenci kartı, veri aktarımı ve soru ekranı görüldü. Kaynak kod sürümü: `92e8ef1416d1fc4f1b79c8b58268f4f70b267189`.

| Mevcut parça | Genişletme |
|---|---|
| Öncelikli öğrenci gündemi | Plan bekleyen, desteğe katılmayan ve yeniden değerlendirme isteyen öğrenciler |
| Sınav, dil becerisi, katılım, devam boyutları | İhtiyacı açıklayan alt beceri kanıtları ve veri güncelliği |
| “Ne yapmalı” önerisi | Tarihli, sorumlusu belli, ayrı ayrı izlenebilir görevler |
| Öğrenci kartı | Haftalık plan ve beceriye göre gelişim geçmişi |
| Şube/kur görünümü | Ortak ihtiyaçlar ve destek oturumu talebi |
| CSV önizleme | Tarihli ölçüm, öğretmen değerlendirmesi ve etkinlik katılımı aktarımı |
| Kurum/şube erişim altyapısı | Öğrenci ve gerektiğinde veli ilişkisine dayalı erişim |

American LIFE markasının sabit olması bu özel demo için hata değildir. Çok markalı ürünleştirme ilk kapsamın önceliği olmamalı. Kur adları ise kurum ayarından yönetilmeye devam etmeli.

## 5. Hatalar ve eksikler — geçerli bulgular

**Kanıt ayrımı:** “Canlı” gözlenen davranış; “kod” kaynakta doğrulanan yapı; “risk” ilgili koşul canlıda denenmeden koddan çıkarılan olasılık. Uygulama test paketi ve farklı hesaplarla erişim testleri çalıştırılmadı. Canlı sürüm ile depo sürümünün birebir aynı olduğu doğrulanmadı.

| Öncelik / kanıt | Bulgu | Düzeltme ve kabul ölçütü |
|---|---|---|
| P1 · Canlı + kod | Soru ekranı farklı soruya cevap verebiliyor. Önceki kontrolde “Bu hafta kaç deneme yapıldı?” sorusu öncelikli öğrenci listesine yönlendi. Bu yalnızca hata örneğidir, ürün kapsamı değildir. | `questions.ts` sözcük eşleştirmesini düzelt. Desteklenmeyen soru açıkça reddedilsin veya kullanıcının niyeti netleştirilsin. |
| P1 · Canlı + kod | İki öneri tek “Yapıldı” düğmesiyle kapanıyor. | Her görevin kimliği, sorumlusu, tarihi ve durumu ayrı olsun; bir görev bitince diğeri açık kalsın. |
| P1 · Kod | “Aksiyon” sayacı görev değil, öneri gereken öğrenci sayısını sayıyor. | “Destek planı olan öğrenci” ile “tamamlanan görev” ayrı metrikler olsun. |
| P1 · Risk | Aynı dönem yeniden hesaplanınca değişen öneri önceki tamamlanmayı taşıyabilir. | Plan/öneri sürümüne bağlı görev oluştur; yeni görev tamamlanmış görünmesin. |
| P1 · Canlı + kod | Aktarım geçmişinde “3 satır / 4 atlanan” var; hata sayısı atlanan satır gibi kaydediliyor. | Toplam, kabul edilen, reddedilen tekil satır ve hata sayısı ayrı tutulsun. |
| P1 · Kod | CSV sınav alanları `exam_1…exam_4`; aynı referanslı ölçümün değeri/tarihi güncelleniyor. | Tarihli değerlendirme olayları ekle; yeni ölçüm eski kanıtı ezmesin. |
| P1 · Kod | Risk skorundaki düşüş “iyileşme” sayılıyor; görev etkisi veya dil gelişimi ayrıca doğrulanmıyor. | Risk değişimi, görev gerçekleşmesi ve beceri gelişimi ayrı gösterilsin. |
| P1 · Canlı + kod | Düşük konuşma ortalamasından “konuşma pratiği yetersiz” diye kesin neden çıkarılıyor. | “Konuşma puanı geride; pratik ve değerlendirme koşulları incelensin” gibi kanıtla sınırlı anlatım kullanılsın. |
| P2 · Kod | Güncel skoru olmayan öğrenci gündem toplamından düşüyor. | Kayıtlı, değerlendirilmiş, veri beklenen ve devamı izlenecek öğrenci sayıları ayrı olsun. |
| P2 · Risk | Tek şube görünürken soru yanıtındaki diğer şube karşılaştırması boş kümede `-Infinity` üretebilir. | İkinci karşılaştırma grubu yoksa karşılaştırma cümlesi gösterilmesin. |
| P2 · Risk | Aksiyon eklemede eşzamanlı istekler mükerrer kayıt oluşturabilir; dönem indeksi benzersiz değil. | Tekil görev anahtarı ve atomik yazma kullanılsın. |
| P2 · Risk | Aktarım ardışık yazılıyor; ara hatada kısmi kayıt kalabilir. | Hazırlama, doğrulama ve yayınlama aşamaları ayrılıp tekrar çalıştırılabilir olsun. |

**Beceri analizi eksiği:** “Konuşma 22” puanı hangi alıştırmanın uygun olduğunu tek başına söylemez. Akıcılık, anlaşılabilirlik, etkileşim veya hedef dil yapısını kullanma gibi alt ölçütler gerekir. Bu veri yoksa öğretmene kısa tanılama görevi önerilmelidir.

**İleride erişim genişletilirse:** Mevcut kurum/şube kuralları korunmalı; öğrenci sadece kendini, veli sadece ilişkili öğrenciyi görebilmeli. Birden fazla kurum üyeliğinde aktif kurum bağlamı açık seçilmeli. Bunlar doğrulanmış veri sızıntısı iddiası değildir.

## 6. Ürünü ART ve destek çalışmalarına bağlama

Aşağıdaki eşlemeler öneridir. Gerçek içerik kimlikleri ve oturum takvimi kurumdan alınmalıdır.

| Kanıtlanan ihtiyaç | Önerilebilecek çalışma | Sonraki kontrol |
|---|---|---|
| Hedef kelimeleri konuşmada kullanamama | Uygun kelime hazırlığı + Guided Practice içinde kısa konuşma | Yeni konuşma görevinde hedef kelime kullanımı |
| Dinlemede ayrıntıları kaçırma | Seviyeye uygun dinleme tekrarı + uygun +More etkinliği | Farklı kayıtta ayrıntı soruları |
| Belirli dil yapısında tekrarlanan hata | İlgili pekiştirme alıştırması + eğitmen geri bildirimi | Yapıyı yeni cümle veya diyalogda kullanma |
| Yazıda düzen ve bağlaç sorunu | Kısa yazı, örnek incelemesi ve düzeltme | Farklı konuda aynı ölçütlerle ikinci yazı |
| Derse hazırlık eksikliği | Sonraki derse bağlı kısa hazırlık planı | Hazırlık tamamlanması ve ders içi gözlem |
| Devam düşüşü | Öğrenci ilişkileri görüşmesi ve uygun saatli destek | Katılım; beceri gelişimi ayrıca ölçülür |

Kulüp önerisi yalnızca beceri adına göre yapılmamalı: dil, seviye, içerik, öğrencinin uygunluğu, şube ve kapasite eşleşmeli. Öneri, rezervasyon ve gerçek katılım ayrı kayıtlar olmalı. Yer yoksa öğrenci katılmış görünmemeli; uygun alternatif gösterilmeli.

ART için doğrulanmış bir API yoksa ilk pilotta öğretmen girişi ve onaylı CSV kullanılabilir. İçerik için kurumun sağladığı başlık/kod/bağlantı kataloglanır. Entegrasyon yokken “ART'a otomatik atandı” veya “rezervasyon tamamlandı” mesajı gösterilmez.

## 7. Ölçüm ve değerlendirme modeli

Mevcut risk motoru, hangi öğrenciyle önce ilgilenileceği için kullanılabilir. Bunun yanına **öğrenme ihtiyacı ve planlama mantığı** eklenmeli.

### Veri türleri

1. Tarihli kısa sınav ve soru bazlı sonuçlar; varsa sorunun hedef alt becerisi.
2. Konuşma/yazma için öğretmen değerlendirme ölçütleri.
3. Ders içi gözlem ve öğrenci hedefi.
4. Hazırlık, pekiştirme ve ödev gerçekleşmesi.
5. Ders, Guided Practice ve aktivite katılımı.
6. Öğrencinin haftalık uygunluğu ve ek çalışma kapasitesi.

### Kurallar

- Ölçülmeyen beceri “veri yok” olarak kalır; sıfır veya başarısız sayılmaz.
- Tek hatadan kesin eksiklik çıkarılmaz. Az veri için tanılama önerilir.
- Konuşma ve yazma yalnızca çoktan seçmeli sınavla değerlendirilmez.
- Her sonuçta görev, tarih, ölçek, değerlendirici ve ölçüt sürümü bulunur.
- Farklı ölçeklerin puanları doğrudan karşılaştırılmaz.
- Düşük risk skoru bir öğrencinin kur hedeflerini kazandığını kanıtlamaz.
- Tamamlanan alıştırma ve katılınan kulüp öğrenme kanıtı yerine geçmez.
- Yeniden değerlendirmede aynı alt beceri, benzer zorluk ve aynı ölçütler kullanılır.
- Öğretmen öneriyi değiştirebilir; gerekçe ve sürüm kaydı tutulur.
- Kur geçişi veya kur tekrarı kararı otomatik verilmez; akademik değerlendirmeye sunulur.

Pilot alt beceri kataloğu kurumun öğretim planından seçilmeli. Bu rapordaki örnekler resmî CEFR tanımlayıcıları veya American LIFE müfredat kodları değildir.

## 8. Öğrenciye özel haftalık plan örneği

**Temsili senaryo:** B1 grubundaki bir yetişkin öğrenci, kısa konuşmalarda çok duraksıyor ve geçmiş olayları anlatırken hedef yapıyı tutarsız kullanıyor. Öğretmen iki görevde bu ihtiyacı gözlemlemiş. Haftalık ek çalışma bütçesi 120 dakika.

| Gün | Görev | Süre | Çıktı |
|---|---|---:|---|
| Pazartesi | İlgili hedef yapı ve kelimelerle hazırlık | 15 dk | 8 kısa alıştırma ve 5 örnek cümle |
| Salı | Uygun Guided Practice oturumu | 30 dk | Öğretmen eşliğinde 2 kısa anlatım |
| Çarşamba | Kısa dinleme ve yeniden anlatma | 15 dk | 5 anlama sorusu ve sözlü özet |
| Perşembe | Seviyeye ve takvime uygun konuşma etkinliği | 30 dk | Katılım ve kısa eğitmen gözlemi |
| Cuma | Farklı konu üzerinde kısa konuşma değerlendirmesi | 15 dk | Aynı ölçütlerle yeni değerlendirme |
| Hafta sonu | Geri bildirim ve sonraki haftanın planı | 15 dk | Sürecek veya değişecek görev kararı |

Toplam **120 dakika**. Oturum süreleri temsilîdir; gerçek takvim farklıysa plan yeniden hesaplanır.

Konuşma kontrolünde akıcılık, anlaşılabilirlik ve hedef yapıyı kullanma gibi öğretmenin tanımladığı ölçütler ayrı izlenir. Örneğin bir ölçütte 2/4'ten 3/4'e çıkış gösterilebilir; bu kur atlama veya genel dil seviyesinde kesin artış anlamına gelmez.

Her görevde: **neden seçildi, kaynak, süre, tarih, sorumlu, beklenen çıktı, kontrol yöntemi ve durum** bulunmalı. Görev sayısı öğrencinin kapasitesine sığmalı.

## 9. Ekran değişiklikleri

### Öğrenci gündemi

Mevcut öncelik listesine “Plan hazırla”, “Planı incele”, “Katılımı kontrol et”, “Yeniden değerlendir” işlemleri eklenir. Kimin hangi aksiyonu üstleneceği görünür olur.

### Öğrenci kartı

Sekmeler: Özet, Beceri Profili, Haftalık Plan, Çalışma Geçmişi, Gelişim.

Beceri profilinde puanın yanında kanıt, tarih ve ölçüt görünür. Plan ekranı kaynak ve oturumları gösterir. Gelişim ekranı risk değişimini beceri değişiminden ayırır.

### Plan onay kuyruğu

Öğretmen taslakları inceler. Önce eksik kanıt, kaynak bulunamaması, süre aşımı ve oturum çakışması olan taslaklar gösterilir. Düzenleme ve toplu onay yapılabilir; sorunlu taslaklar ayrı kalır.

### Kaynaklar ve oturumlar

Kurumun mevcut içeriği ve oturumları dil, kur, beceri, alt beceri ve süreyle kataloglanır. Rezervasyon entegrasyonu yoksa bağlantı ve “rezervasyon bekliyor” durumu kullanılır.

### Öğrencinin haftası

Mobil görünümde bugün yapılacaklar, kaynak/oturum bilgisi, süre ve yardım isteği bulunur. “Öğrenci tamamladı”, “öğretmen kontrol etti” ve “yeniden ölçüldü” ayrı tutulur.

### Gelişim raporu

Yetişkine kendi hedefleri ve ilerlemesi; çocuk/genç programında uygun veli özeti. İlk aşamada yazdırılabilir rapor yeterli. Rapor üretmek ile dışarıya göndermek ayrı işlemler olmalı.

## 10. Teknik uygulama planı

Mevcut Next.js, Supabase ve TypeScript yapısı üzerinden ilerle. İlk aşamada yeni bir eğitim platformu kurmak yerine mevcut öğrenci takibini genişlet.

| Mevcut dosya/alan | Değişiklik |
|---|---|
| `src/lib/engine.ts` | Risk önceliklendirmesini koru |
| `src/lib/agenda.ts` | Plan, görev, veri eksikliği ve takip metrikleri |
| `src/lib/narrative.ts` | Kanıta dayalı, kesin neden iddiasından kaçınan dil |
| `src/lib/questions.ts` | Desteklenmeyen soru kontrolü ve izinli sorgular |
| `src/lib/import.ts`, `csv.ts` | Tarihli değerlendirme ve etkinlik aktarımı |
| `src/app/workspace/mark.ts` | Öğrenci yerine tekil görev/sürüm bazlı durum |
| `src/app/workspace/students/[id]/page.tsx` | Beceri ve plan sekmeleri |
| `supabase/migrations/` | Yeni veri modeli, benzersiz anahtarlar ve erişim |

Önerilen ek varlıklar:

- `learning_objectives`: dil, kur, beceri, alt beceri, müfredat sürümü.
- `assessments`, `assessment_results`: tarihli ölçüm ve öğrenci sonucu.
- `rubrics`, `rubric_scores`: konuşma/yazma ölçütleri, ölçek ve değerlendirici.
- `assessment_items`, `item_results`: varsa soru/alıştırma bazlı kanıt.
- `learning_resources`: kurum içeriği ve hedef eşlemeleri.
- `support_sessions`, `session_participations`: oturum, kapasite, rezervasyon ve katılım.
- `study_plans`, `study_tasks`, `task_attempts`: onaylı plan, tekil görev ve çalışma çıktıları.
- `student_availability`: haftalık kapasite ve uygun günler.
- `student_guardians`: gerektiğinde veli–öğrenci erişim ilişkisi.

Yeni kayıtlar mevcut öğrenci, şube, kurum ve kur yapısına bağlanmalı. Eski toplam puanlardan alt beceri geçmişi uydurulmamalı; bu kayıtlar “özet ölçüm” olarak kalmalı.

Planlar sürümlenmeli; onaylı plan sessizce değiştirilmemeli. Aktarım anahtarı kaynak sistem + kaynak kayıt kimliği/sürümü üzerinden mükerrerliği engellemeli. Aynı dosyanın tekrar yüklenmesi ölçüm ve görev çoğaltmamalı.

Yapay zekâ eklenirse öğretmen notunu yapılandırma, açıklama ve plan taslağı hazırlamada kullanılabilir. Kaynak varlığı, süre, uygunluk, erişim ve çıktı şeması sunucuda doğrulanmalı. Ses analizi veya otomatik konuşma notlandırması ilk MVP için gerekli değil.

## 11. İlk pilot kapsamı ve sıra

**Önerilen başlangıç:** Bir şube, bir B1 Genel İngilizce grubu, konuşma ve dinleme için sınırlı alt beceri listesi, öğretmen değerlendirmesi ve iki haftalık takip. Grup ve kur seçimi pilot varsayımıdır.

1. **Veriyi doğrula:** Kurumdan mevcut değerlendirme formu, içerik listesi ve destek takviminin örneğini al. ART veri erişimini netleştir.
2. **Güven hatalarını düzelt:** Soru yönlendirme, aktarım sayıları, görev kimliği ve öneri sürümü.
3. **Plan döngüsünü kur:** Öğretmen girişi → ihtiyacın belirlenmesi → süreye uygun plan → onay.
4. **Uygulamayı izle:** Öğrenci görevleri, destek katılımı ve yardım isteği.
5. **Yeniden ölç:** Aynı alt becerileri yeni görevle değerlendir; raporu üret.
6. **Entegrasyonu genişlet:** Pilot işe yarıyorsa ART aktarımı ve rezervasyon bağlantısını gerçek olanaklara göre geliştir.

İlk demoda otomatik ART entegrasyonu yerine açıkça etiketli örnek içerik ve oturumlar kullanılabilir. Tüm diller, yaş grupları ve dil sınavı programlarını aynı anda kapsama alma.

## 12. Demo hikâyesi

Sentetik bir öğrencinin konuşma ihtiyacı gündemde görünür. Öğretmen öğrenci kartında iki değerlendirme kanıtını açar. Sistem 120 dakikaya sığan taslak plan önerir. Öğretmen uygun olmayan etkinliği değiştirir ve onaylar. Öğrenci bir görevi tamamlar, birinde yardım ister. Eğitmen sonraki konuşma görevini aynı ölçütlerle değerlendirir. Raporda yapılan çalışma ve gözlenen beceri değişimi ayrı gösterilir.

İkinci senaryoda öğrenci planı tamamlar ama beceri sonucu değişmez: sistem otomatik başarı yazmak yerine öğretmen incelemesi ve farklı destek önerir. Üçüncü senaryoda yeterli veri yoktur: önce kısa değerlendirme istenir.

## 13. Pilot başarısı ve kabul kriterleri

Ölçülecekler: öğrenci başına öğretmenin planlama/takip süresi; onaylanan plan oranı; öğretmenin taslaklarda yaptığı değişiklik; görev gerçekleşmesi; destek oturumuna katılım; yeniden değerlendirme kapsaması; aynı ölçütte gözlenen beceri değişimi.

Kayıt yenileme veya kur tekrarı üzerindeki etki, yeterli veri ve değerlendirme olmadan vaat edilmemeli.

- [ ] Yeni ölçüm eski puan ve öğretmen değerlendirmesini ezmiyor.
- [ ] Ölçülmeyen alt beceride sistem kesin ihtiyaç üretmiyor.
- [ ] Konuşma/yazma ihtiyacı uygun performans kanıtıyla destekleniyor.
- [ ] Plan günlük/haftalık süreye ve mevcut ders takvimine sığıyor.
- [ ] Kaynak ve oturum gerçekten mevcut; seviye ve şube uygun.
- [ ] Rezervasyon, katılım ve öğrenme ayrı durumlar.
- [ ] Bir görev bitince diğer görevler açık kalıyor.
- [ ] Yeni plan sürümü eski tamamlanmayı devralmıyor.
- [ ] Öğretmen planı düzenleyip onaylayabiliyor.
- [ ] Beceri gelişimi ile risk azalması ayrı raporlanıyor.
- [ ] Yetişkin raporu otomatik olarak veli raporuna dönüşmüyor.
- [ ] Öğrenci ve veli yalnızca izinli kayıtları görüyor.
- [ ] Desteklenmeyen soruya ilgisiz yanıt verilmiyor.
- [ ] Entegrasyon olmayan işlem tamamlanmış gibi gösterilmiyor.

## 14. Geliştiriciye verilecek görev

> American LIFE Student Intelligence uygulamasını kişisel dil gelişim ve aksiyon takibiyle genişlet. Mevcut risk gündemini koru. Tarihli beceri ve alt beceri değerlendirmeleri, konuşma/yazma ölçütleri, öğretmen onaylı haftalık plan, tekil görev durumları, uygun içerik/Guided Practice/+More yönlendirmesi ve yeniden değerlendirme ekle. İlk kapsamı bir Genel İngilizce grubu ile sınırla. ART API veya rezervasyon erişimi doğrulanmadan entegrasyon varsayma; örnek veri veya öğretmen girişi kullanıldığını açık göster. Öğrencinin ne yaptığı ile ne öğrendiğini ayrı ölç. Mevcut soru yönlendirme, aktarım sayacı ve görev tamamlama sorunlarını düzelt. Yetişkin öğrenci ve çocuk/genç veli raporu ayrımını koru. TYT/AYT/LGS modülü geliştirme.

## 15. Teknik incelemenin kaynağı

[Canlı demo](https://student-intelligence-eta.vercel.app/workspace) · [İncelenen depo sürümü](https://github.com/hakangungorr/Student-Intelligence/tree/92e8ef1416d1fc4f1b79c8b58268f4f70b267189)

İlgili dosyalar: `src/lib/questions.ts`, `agenda.ts`, `import.ts`, `scoring.ts`, `roles.ts`; `src/app/workspace/mark.ts`, `import/actions.ts`; `supabase/migrations/202609080001_foundation.sql` ve `202609140009_action_period.sql`.

Bu revizyon dokümanı düzeltir; uygulama koduna veya canlı öğrenci kayıtlarına değişiklik yapmaz.

