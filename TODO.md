# Student Intelligence — Yapılacaklar

Depo: `hakangungorr/Student-Intelligence`
Hazırlayan: kod incelemesi, 14 Eylül 2026 · son güncelleme 16 Eylül 2026
Durum: `npm run check` temiz (131 test, lint, tsc, build)

Bu dosya Claude Code'a verilmek üzere yazıldı. Her görevde dosya, satır, kabul kriteri ve
dikkat edilecek tuzak var. Görevler sıralı: **Bölüm 1 bitmeden Bölüm 3'e geçme.**

---

## Durum — 16 Eylül 2026

**Bitti: T1–T8** (Bölüm 1 ve Bölüm 2 tamamı) ve **Bölüm 6** — kişisel dil gelişim planı.
16 Eylül'de plan katmanı sadeleştirildi (Bölüm 6, "Sadeleştirme"). `npm run check` temiz,
131 test.

Migration geçmişi canlıyla senkron; `202609160012_one_plan.sql` dahil hepsi `db push` ile
uygulanır.

- T3 migration'ı (`202609140009_action_period.sql`) hâlâ gerekli.
- Bir sapma (T1): "ESCALATION mevcut boyut sayısına göre indekslensin" maddesi gözlenen boyut
  sayısıyla indekslenerek uygulandı, orantılı ölçeklemeyle değil. Gerekçe `engine.ts` içinde.

**Başlanmadı: T9–T12** — Bölüm 5 soruları kuruma sorulmadan kodlanmayacağı dosyada yazılı.
**T13–T15** ölçek işleri; gerçek öğrenci sayısı belli olunca.

---

## Bölüm 0 — Uyulacak kısıtlar

Bunlar tartışmaya açık değil, projede zaten verilmiş kararlar:

1. **Motor parity.** `risk_engine_v4.py` referanstır. `tests/engine.test.ts` 100 referans
   öğrencinin skorunu, seviyesini, boyutlarını ve teşhisini birebir doğrular. Tam veriye
   sahip bir öğrencinin skoru değişiyorsa bu bir hatadır, tercih değil. Motorun davranışını
   kasten değiştiren bir iş yapılacaksa `ENGINE_VERSION` artırılır (`risk_snapshots` benzersiz
   anahtarı zaten `engine_version` içerir) ve v0.4 testleri korunur.

2. **`service_role` anahtarı kullanılmaz.** Her yazma, kullanıcının kendi RLS yetkisiyle yapılır.
   Yeni bir tablo eklenirse RLS politikası ve sütun seviyesinde `grant` ile birlikte eklenir —
   `alter default privileges` zaten her şeyi kapalı başlatıyor.

3. **`HANDOFF.md` §4'teki kararlar yeniden açılmaz.** Eğitmen analitiği yok, memnuniyet
   skorlanmıyor, ortalama devam oranı KPI'ı kullanılmıyor. Bu dosyadaki hiçbir görev bunları
   geri getirmez.

4. Her görev sonunda `npm run check` çalıştırılır ve geçmeden görev bitmiş sayılmaz.

5. Kod yorumları bu projede kararın **nedenini** yazıyor, ne yaptığını değil. Aynı üslubu koru.

---

## Bölüm 1 — Pilot öncesi bloklayıcılar

Bu ikisi bitmeden kuruma gösterim yapılmamalı. İkisi de "kurumun verisi bizim
varsaydığımız şekilde değilse ürün hiçbir şey göstermez" sorununu çözüyor.

### T1 — Kısmi veriyle puanlama

**Sorun.** `src/lib/scoring.ts:89` bir öğrenciyi dört sınav, dört beceri, devam oranı,
katılım ve ödev değerlerinin **hepsi** yoksa atlıyor. Öğrenci gündemde hiç görünmüyor.
Sonuç: kurum elindeki veriyi yükler, bir eksik yüzünden boş ekran görür ve ürünün
çalışmadığını sanır. Emek %100 önden, değer satır tamamlanana kadar %0.

**Yapılacak.**

- `src/lib/engine.ts` — `Measures` alanlarını opsiyonel yap. Her boyut için
  hesaplanabilirlik belirle:
  - `test`: en az 2 sınav notu
  - `skill`: en az 1 beceri puanı (dördü de yoksa boyut yok)
  - `attendance`: `attendanceRate` var
  - `classroom`: `participation` veya `homework` veya `concern`'den en az biri var
- `WEIGHTS` toplamını mevcut boyutlara yeniden normalize et. `ESCALATION` dizisi mevcut
  boyut sayısına göre indekslensin. `MAX_DIMENSION_FLOOR` aynen kalsın.
- `scoreStudent` dönüşüne `available: Dimension[]` ekle. **Eksik boyutu `dimensions`
  nesnesine hiç yazma** — `null` veya `0` yazma.
- `src/lib/scoring.ts` — `skipped`'a yalnızca hiçbir boyutu hesaplanamayan öğrenci girsin.
  Atlanma gerekçesi "veri eksik" değil, hangi boyutun neden hesaplanamadığı olsun.
- `risk_snapshots.dimensions` jsonb'sinde eksik anahtar hiç bulunmasın.

**Tuzak — bunu atlarsan hata sessiz kalır.** Şu dört yerde `?? 0` var ve eksik boyutu
"sorun yok" (yeşil) olarak gösterir:

```
src/lib/agenda.ts:234
src/app/workspace/page.tsx:129
src/app/workspace/students/page.tsx:21
src/app/workspace/students/page.tsx:71
```

Hepsini eksik-veri durumunu ayırt edecek şekilde düzelt:

- `src/lib/narrative.ts:50` — `band()` şu an `crit | warn | good` döndürüyor.
  Dördüncü bir durum ekle: değer `undefined` ise `none`.
- `src/app/globals.css` — `.cell.none` için nötr, yanmayan bir stil (gri kontur, dolgu yok).
  Renk disiplinine dikkat: bu bir durum rengi değil, veri yokluğu işareti.
- `agenda.ts:234` ısı haritası ortalaması — eksik boyutu paydadan düş, sıfır sayma.
- `students/page.tsx:21` "sorun alanı" süzgeci — eksik boyut eşleşmesin.
- Satırda "3/4 alan" rozeti ve hangi alanın eksik olduğu: *"Beceri puanı girilmemiş."*

**Kabul kriteri.**

1. Dört sınavı ve devam oranı olan, beceri puanı hiç olmayan bir öğrenci gündemde görünür.
2. Dörtlü hücrenin beceri kutusu yanmaz, boş görünür — yeşil görünmez.
3. Satırda eksik alanın adı yazar.
4. Dört boyutu da olan öğrencinin skoru, seviyesi ve teşhisi **bit bit eskisiyle aynı**;
   `tests/engine.test.ts` değiştirilmeden geçer.
5. Yeni test: kısmi veri senaryoları için `tests/engine.test.ts` içine en az üç vaka
   (yalnız devam; devam + sınav; sınav + beceri).

---

### T2 — Esnek sınav sayısı

**Sorun.** `src/lib/scoring.ts:23` `EXAMS = ["exam_1".."exam_4"]` ve dördü birden yoksa
öğrenci atlanıyor. Motor da dört varsayıyor: `src/lib/engine.ts:115` trendi
`slice(-2)` ile `slice(0, 2)` arasındaki farktan hesaplıyor. Kurumun bir kurunda üç sınav
varsa o kurdaki **her** öğrenci puanlanmaz.

**Yapılacak.**

- `src/lib/scoring.ts` — `EXAMS` sabitini kaldır. `kind = 'exam'` olan bütün ölçümleri al,
  `source_reference` doğal sırasıyla (exam_1, exam_2, … / doğal sayı sırası) dizilim kur.
  Veri şeması değişmiyor: `source_reference` zaten serbest metin.
- `src/lib/engine.ts:115` — sabit indis yerine yarı ortalamaları:

  ```ts
  const half = Math.floor(exams.length / 2);
  const delta = mean(exams.slice(-half)) - mean(exams.slice(0, half));
  const recent = mean(exams.slice(-half));
  ```

  `n = 4` için bu ifade `slice(-2)` / `slice(0,2)` ile **aynı** sonucu verir — parity korunur.
  `n = 3` → ilk 1 ile son 1 karşılaştırılır, ortadaki atlanır. `n = 2` → ilk ile son.
- `src/lib/engine.ts:92` `buildBenchmarks` içindeki `slice(-2)` de aynı `half` mantığına geçsin.
- `exams.length < 2` → test boyutu hesaplanamaz (T1 ile birleşir, atlama değil).
- `src/lib/narrative.ts` — "Son 4 sınavın her biri bir öncekinden düşük" ve
  "Sınav notları dört sınavdır üst üste düşüyor" metinlerindeki sabit "4"ü sınav sayısından üret.
- `src/lib/entry.ts` `ENTRY_KINDS` — `1. sınav … 4. sınav` sabit listesi yerine, girilecek
  sınavın kurum tarafından belirlenmesi. **Bu adım için önce Bölüm 5'teki 1. soruyu sor.**
  Cevap gelene kadar mevcut dört giriş türü durabilir; kritik olan motor ve puanlama tarafı.

**Kabul kriteri.**

1. Üç sınav notu olan öğrenci puanlanır ve gündemde görünür.
2. İki sınav notu olan öğrenci puanlanır.
3. Bir sınav notu olan öğrencide test boyutu eksik görünür, öğrenci yine de gündemde.
4. `tests/engine.test.ts` (dört sınavlı 100 referans öğrenci) değiştirilmeden geçer.
5. Yeni test: 2, 3 ve 5 sınavlı senaryolar.

---

## Bölüm 2 — Hatalar

### T3 — Tamamlanan aksiyon hiç sıfırlanmıyor · **yüksek**

**Sorun.** `src/lib/agenda.ts:66` tamamlanmış aksiyonları dönem filtresi olmadan çekiyor:

```ts
client.from("actions").select("student_id,status").eq("status", "completed")
```

`doneFor`, o öğrencinin *herhangi bir zamanda* tamamlanmış bir aksiyonu olup olmadığına
dönüşüyor. `src/app/workspace/mark.ts:34-39` da dönem başına yeni satır açmıyor, en son
satırın durumunu güncelliyor — ve `title` sütunu zaten `grant update` listesinde yok.

Sonuç: Eylül'de işaretlenen öğrenci Ekim'de aksiyon tamamen değişmiş olsa bile tamamlanmış
görünür, satırı üstü çizili gelir, ilerleme çubuğu onu sayar. Ürünün "müdahale işe yaradı mı"
sorusuna verdiği tek cevap bu çubuk.

**Yapılacak.**

- Yeni migration: `supabase/migrations/2026____0009_action_period.sql`

  ```sql
  alter table public.actions add column period_end date;
  create index actions_period_idx on public.actions(student_id, period_end);
  ```

  Yorumda gerekçeyi yaz: bir aksiyon belirli bir değerlendirme kesitinin önerisine cevaptır;
  kesit değiştiğinde öneri de değişir.
- `mark.ts` — cari kesiti `latestPeriod(client)` ile bul; o kesit için satır varsa güncelle,
  yoksa **yeni satır aç**. Eski kesitlerin satırlarına dokunma; onlar kapanış kaydı.
- `agenda.ts:66` — sorguya `.eq("period_end", periodEnd)` ekle. `periodEnd` aynı fonksiyonda
  zaten hesaplanıyor ama snapshot'lardan sonra; sorgu sırasını buna göre düzenle
  (iki aşamalı: önce dönemleri belirle, sonra aksiyonları çek).
- Geriye dönük: `period_end` null olan mevcut satırlar en eski kesite atanabilir ya da
  null bırakılıp hiçbir kesitte sayılmaz. İkincisi daha güvenli.

**Kabul kriteri.** Yeni kesit açıldığında bütün öğrenciler yeniden "yapılacak" durumuna döner;
önceki kesitin kaydı `actions` tablosunda durur ve denetim izi bozulmaz.

---

### T4 — Öğrenci kartındaki devam sınırı sabit · orta

`src/app/workspace/students/[id]/page.tsx:76`

```tsx
<Kv k="Kurumun kritik sınırı" v="%75" />
```

`organization_settings.attendance_floor` ayarlanabilir ve gündem, soru ekranı ve bulgu
cümleleri doğru okuyor — yalnızca öğrenci kartı sabit. Kurum 80 yaparsa kart, **"kurumun"**
kelimesiyle yanlış değeri gösterir.

`loadStudent` zaten `passMark` taşıyor; `attendanceFloor`'u da aynı yoldan geçir.

**Kabul.** Ayarı 80 yap, öğrenci kartı %80 desin.

---

### T5 — Öğrenci listesinde şube süzgeci yok · orta

`src/app/workspace/students/page.tsx:28` giriş metni "Şube, kur, risk ve sorun alanına göre
süzün" diyor; formda şube yok. `/workspace/entry` ekranında var.

- `sube` query parametresi ekle, süzgeci forma koy.
- Şube listesi `loadAgenda` çıktısındaki `byBranch`'ten gelir, ek sorgu gerekmez.
- Kullanıcının eriştiği şube tekse (branch_manager, teacher) süzgeci **gizle** — tek
  seçenekli bir açılır liste gürültüdür.

---

### T6 — Aktarım tarihi ile değerlendirme kesiti aynı dili konuşuyor · orta

`src/app/workspace/import/actions.ts:107`

```ts
const period = (await latestPeriod(client)) ?? when.data;
```

Aktarım formundaki alanın adı "Dönem sonu tarihi" ve ölçümler o tarihe yazılıyor; ama
puanlama var olan en yeni kesite yazıyor. 1 Ekim verisi yüklendiğinde gündem hâlâ
"1 Eylül ölçümü" der ve Eylül kesiti Ekim verisiyle üzerine yazılır.

Davranış kasıtlı ve `ScoreForm` notunda doğru anlatılmış; sorun aktarım ekranının susması.

- `src/app/workspace/import/form.tsx` — alan adı **"Ölçüm tarihi"**.
- `PreviewState`'e hangi kesitin tazeleneceğini ekle; onay ekranında yaz:
  *"Bu aktarım 1 Eylül kesitini günceller. Yeni kesit açmak için aşağıdaki hesaplama formunu
  kullanın."*
- Hiç kesit yoksa bunu da söyle: *"İlk kesit bu aktarımla açılacak."*

---

### T7 — Yapılamayacak işler menüde duruyor · orta

`src/app/workspace/layout.tsx:12` — "Veri aktarımı" bağlantısı herkese, eğitmene de görünüyor.
Eğitmen dosya yükler, önizleme geçer, "Aktar" der ve ham RLS hata metni yer.
`src/app/workspace/import/page.tsx` içindeki `ScoreForm` da herkese render ediliyor; puanlama
yalnızca `org_admin` yetkisinde (gerekçesi `202609080005_risk_scoring.sql` yorumunda).

Aynı dosyanın 9. satırında zaten doğru prensip yazılı: *"Offering a link that answers
'you may not' is worse than not offering it."* Ekip ve Ayarlar için uygulanmış, aktarım için atlanmış.

- Aktarım bağlantısını yalnızca `org_admin` ve `branch_manager`'a göster.
- `ScoreForm`'u yalnızca `org_admin`'e render et.
- `branch_manager` aktarımı bitirdiğinde bekleyen adımı söyle: *"Skorların güncellenmesi için
  kurum yöneticinizin hesaplamayı çalıştırması gerekiyor."*

---

### T8 — Eğitmen giriş yapıyor ve hiçbir şey görmüyor · orta

Eğitmenin erişimi `enrollments.teacher_id` ile tanımlı; CSV aktarımı yalnızca `teacher_name`
yazıyor. Sınıf atanana kadar eğitmen boş ekran görür ve mesaj yanlış teşhis koydurur:
*"Henüz öğrenci kaydı yok."* — oysa öğrenci var, ona bağlanmamış.
Durum `src/lib/team.ts` yorumunda zaten biliniyor, ekranda söylenmiyor.

`src/app/workspace/page.tsx:22` — rolü `teacher` ve atanmış öğrencisi sıfır olan kullanıcıya
ayrı boş durum: *"Size henüz sınıf atanmadı. Kurum yöneticiniz Ekip ve sınıflar ekranından
atayabilir."*

**Ek olarak** `src/lib/import.ts`: aktarım `teacher_name`'i günceller, `teacher_id`'ye
dokunmaz. Kartta yazan eğitmen ile erişimi olan kişi farklı olabilir. En azından Ekip
ekranında uyar: *"Bu sınıfın dosyadaki eğitmeni X, erişim Y'de."*

---

## Bölüm 3 — Veri girişi (asıl iş)

Sistem öğrenci başına 11 zorunlu değer istiyor. 100 öğrenci = 1.100 değer. Bunların
**ikisi hiçbir yerde kayıtlı değil** ve eğitmen tarafından o an uyduruluyor: `participation`
(1–10) ve `homework_completion` (%). Devam oranı da elle yüzde olarak yazdırılıyor — oysa
devamsızlık her okulda ders ders tutulan, en sağlam veri.

**Bu bölümdeki işler motorun davranışını değiştirir.** `ENGINE_VERSION` v0.5'e çıkar,
v0.4 referans testleri aynen korunur. Bölüm 5'teki sorular cevaplanmadan başlama.

### T9 — Katılım ve ödev yerine ders sonu işaretlemesi

İki uydurma sayı yerine tarihli bir olay akışı topla. Ders bitiminde tek soru:

> Bugün kimler seni endişelendirdi? → 0–3 isme dokun

On saniye sürer; çıkan veri daha iyidir: "son 4 haftada 3 kez işaretlendi", "ilk kez
işaretlendi", "işaretlenme sıklığı artıyor" gerçek erken uyarı sinyalleridir.
`classroom_observations` zaten tarihli ve `teacher_concern` alanı zaten var — doğru olan o,
1–10 ile % yanlış olanlar.

- `classroomDimension` girdisini işaretlenme sıklığına ve trendine çevir.
- `participation` / `homework_completion` sütunları şemada kalabilir (eski veri), skora girmez.
- Psikolojik gerekçe: eğitmen öğrenci notlandırmıyor, dikkat çekiyor. `HANDOFF.md` §4'ün
  "denetleyici algılanırsa veri gelmez" endişesiyle aynı yönde.

### T10 — Devam ders ders gelsin, oran türetilsin

- Ders bazlı yoklama: varsayılan "geldi", yalnızca gelmeyene dokunulur.
- `term_rate` ve `last_four_weeks` elle girilen alanlar olmaktan çıkıp bir görünümden türetilsin.
- Alternatif: kurumun kendi sisteminden ders bazlı dışa aktarım. **Bölüm 5, soru 4.**

### T11 — Girişin birimi "3. sınav" değil "dün yaptığımız quiz"

Eğitmenin zihninde `exam_3` diye bir şey yok. Giriş akışı: *Sınav ekle → ad, tarih →
sınıf listesi*. T2'yi arayüz tarafında tamamlar.

### T12 — Sınıf (section) kavramı

`enrollments.teacher_id` atama birimi (şube × kur). `src/lib/team.ts` `assignClass` o şube ve
kurdaki **bütün** öğrencileri tek eğitmene yazıyor. Aynı şubede aynı kurdan iki grup varsa
ikinci eğitmeni atadığın an birincinin erişimi gider.

Minimum çözüm `enrollments.section` metin alanı ve atama biriminin (şube, kur, sınıf) olması.
Tam çözüm ayrı bir `classes` tablosu. **Bölüm 5, soru 3 cevaplanmadan seçme.**

---

## Bölüm 4 — Ölçek

100 öğrencide hiçbiri sorun çıkarmaz; gerçek kurum verisinde hepsi çıkarır.

### T13 — Gündem sorgusuna dönem sınırı

`src/lib/agenda.ts:59` — risk kesitleri sorgusunda dönem sınırı yok; her öğrencinin her kesiti
çekilip en yeni ikisi JavaScript'te ayıklanıyor. 1000 öğrenci × 30 hafta = her sayfa açılışında
30.000 satır, ve bu sorgu gündem, öğrenci listesi ve soru ekranının üçünde de çalışıyor.

Önce en yeni iki `period_end` değerini seç (`select distinct period_end order by desc limit 2`),
sonra ana sorguyu `.in("period_end", [...])` ile sınırla. Tek satırlık değişiklik, en büyük kazanç.

### T14 — Puanlama tek yazımda, transaction içinde

`src/lib/scoring.ts:128` — mevcut kayıtlar `for` döngüsünde tek tek UPDATE ediliyor.
500 öğrencinin ikinci hesaplaması 500 ayrı istek: Server Action zaman aşımı. Yarıda kalırsa
yarısı yeni yarısı eski skorlu bir kesit kalır ve ekranda hiçbir uyarı çıkmaz.

**Dikkat:** PostgREST `upsert` payload'daki her sütunu yazar ve `organization_id` kasten
grantable değil — bu yüzden upsert reddedilir. Aynı gerekçe `src/lib/import.ts` başındaki
yorumda anlatılmış. Doğru çözüm: jsonb dizi alan tek bir Postgres fonksiyonu,
`security invoker` (RLS korunmalı).

### T15 — Zamanlanmış hesaplama

Skorlar yalnızca kurum yöneticisi düğmeye basınca güncelleniyor. "Bu hafta riske girenler"
kartı birinin hatırlamasına bağlı. pg_cron ya da Vercel Cron ile mevcut kesit tazelensin;
**yeni kesit açma kararı insanda kalsın** — yoksa haftalık karşılaştırma anlamsızlaşır.

---

## Bölüm 5 — Kuruma sorulacaklar

Bunlar cevaplanmadan Bölüm 3 kodlanmamalı. Her biri bir varsayımı kapatıyor.

1. **Bir kurda kaç sınav yapılıyor, hepsi aynı ağırlıkta mı?** (T2, T11)
2. **Dört dil becerisi ayrı ayrı 0–100 olarak puanlanıyor mu, yoksa kur sonunda tek sınav mı
   var?** Ölçülmüyorsa beceri boyutu isteğe bağlı kalmalı — uydurulmuş dört sayı yerine
   dürüstçe kaydedilmiş yarım profil. (T1)
3. **Bir şubede aynı kurdan kaç grup var?** Birden fazlaysa sınıf kavramı zorunlu. (T12)
4. **Devamsızlık ders ders mi tutuluyor, hangi sistemde, dışa aktarılabiliyor mu?** (T10)
5. **Katılım ve ödev tamamlama bugün herhangi bir yerde kayıtlı mı, yoksa tamamen yeni iş mi?**
   (T9)

---

## Özet sıra

| # | Görev | Ne zaman |
|---|---|---|
| T1 | Kısmi veriyle puanlama | Pilot öncesi — en yüksek etki |
| T2 | Esnek sınav sayısı | Pilot öncesi |
| T3 | Aksiyon dönem bazlı | Pilot öncesi |
| T4–T8 | Arayüz tutarsızlıkları | Gösterimden önce, hepsi bir günlük |
| T9–T12 | Veri girişi yeniden tasarımı | Bölüm 5 cevaplandıktan sonra |
| T13–T15 | Ölçek | Gerçek öğrenci sayısı belli olunca |

T1 ve T2 birlikte şunu söylemeni sağlıyor: **"Elinizdeki dosyayı yükleyin, çalışsın."**
Satış konuşmasının tamamı bu cümle.


---

## Bölüm 6 — Kişisel dil gelişim planı · **bitti, 15 Eylül · sadeleştirildi 16 Eylül 2026**

Kaynak: `AMERICAN_LIFE_KISISEL_GELISIM_PLANI.md`. Aşağıdakiler uygulandı.

### Güven düzeltmeleri (plan §5)

| Bulgu | Ne yapıldı |
|---|---|
| P1 · Soru ekranı farklı soruya cevap veriyordu | `questions.ts` artık çapa sözcük eşleşmesi kullanıyor. "Bu hafta kaç deneme yapıldı?" hiçbir soruya eşleşmiyor. `tests/questions.test.ts` |
| P1 · İki öneri tek düğmeyle kapanıyordu | Öneriler artık plana tek tek görev olarak giriyor; her görevin kendi durumu var. (İlk çözüm `actions.task_key` idi; sadeleştirmede plan görevlerine taşındı, `actions` geçmiş kayıt olarak duruyor.) |
| P1 · "Aksiyon" sayacı görev değil öğrenci sayıyordu | `studentsWithAction`, `withPlan`, `tasks`, `tasksDone` ayrı metrikler. İlerleme çubuğu açık planlardaki görevleri sayıyor. |
| P1 · Yeniden hesaplama eski tamamlanmayı taşıyordu | Öneri anahtarı görev metninden türetiliyor; öneri değişince yeni öneri olarak görünüyor. Tamamlanma plandaki görevde duruyor, öneriye taşınmıyor. |
| P1 · Aktarımda hata sayısı atlanan satır gibi kaydediliyordu | `import_batches.rejected_count` ve `issue_count` ayrıldı. Eski satırlar "—" gösteriyor; geçmişe dönük tahmin yapılmıyor. |
| P1 · Yeni ölçüm eski kanıtı eziyordu | `measurement_revisions` tablosu + `student_measurements` üzerinde trigger. Güncel değer yerinde kalıyor, önceki değer saklanıyor. |
| P1 · Risk düşüşü "iyileşme" sayılıyordu | Gündem paneli "Risk skoru düşen öğrenciler" oldu. Risk **Durum** sekmesinde, yapılan iş **Plan** sekmesinde, beceri değişimi **Ölçümler → Ne değişti**'de — üç ayrı yerde. |
| P1 · "Konuşma pratiği yetersiz" kesin nedeni | Hem `agenda.ts` bulgusu hem soru cevabı, farkın ölçüldüğünü ama nedenin ölçülmediğini söylüyor. |
| P2 · Skoru olmayan öğrenci toplamdan düşüyordu | `registered` / `awaitingScore` ayrı; gündem girişinde yazıyor. |
| P2 · Tek şubede `-Infinity` | Karşılaştırma grubu yoksa cümle gösterilmiyor. |
| P2 · Eşzamanlı aksiyon mükerrer kayıt | `plans_one_open` ve `plan_tasks_once` tekil indeksleri; kontenjan satır kilidiyle. |
| P2 · Aktarım yarıda kalınca sessiz kısmi kayıt | `writeRoster` dört aşamaya bölündü; duran aşama ve yazılanlar ekranda. Aşamalar idempotent, aynı dosya tekrar yüklenince kaldığı yerden tamamlanıyor. |

### Sadeleştirme — 16 Eylül 2026

İlk sürüm (15 Eylül) iki ayrı "ne yapmalı" yolu kurmuştu: gündemdeki aksiyonlar ve haftalık
plan; etrafında taslak, onay kuyruğu, sürüm, beş görev durumu, dört katılım durumu, ayrı
alt beceri kataloğu vardı. Canlıda 28 taslak üretildi ve 28'i de aynıydı — "dört beceriyi
ölç" — çünkü kimse ölçülmemişti. Akış ters kurulmuştu.

Şimdi tek yol: **ölç → plan → yap → kontrol ölçümü.** Kavramlar README'de tablo olarak.

- **Şema** (`202609160012_one_plan.sql`): `plans` (her öğrenciye en fazla bir açık plan),
  `plan_tasks` (yapılacak / yapıldı / takıldı), `plan_events` (tetikleyiciyle, salt okunur),
  `library_items` (çalışma + etkinlik), `library_bookings` (satır = ayrılmış yer, kilitli
  kontenjan). `open_plan` ve `add_plan_task` tek işlemde yazar. Kaldırılanlar:
  `study_plans`, `study_tasks`, `task_events`, `learning_resources`, `support_sessions`,
  `session_participations`, `learning_objectives`, `student_availability`. Örnek katalog
  kütüphaneye taşındı; 28 test taslağı karar gereği taşınmadı.
- **Kod**: `lib/plan.ts` (öneri + okuma + yazma), `lib/plan-context.ts`,
  `lib/assessments.ts`, `lib/library.ts`, `lib/library-seed.ts`, `lib/rubric.ts`.
- **Ekranlar**: öğrenci kartı **Durum · Plan · Ölçümler**; `/workspace/library`; rapor.
  Kaldırılanlar: onay kuyruğu, plan detayı, katalog, öğrencinin haftası (Plan sekmesinin
  yazdırma görünümü oldu), gündemdeki görev başına "Yapıldı" düğmeleri.
- **Kurallar kodda ve veritabanında**: öneri kaydedilmez, eklemek onaydır · ölçüm yoksa tek
  "önce ölç" görevi · ölçülmeyen ölçüt sıfır sayılmaz · tek ölçüm kesin eksiklik değildir ·
  farklı ölçüt sürümü karşılaştırılmaz · dolu etkinlik eklenemez · yapılmış görev
  çıkarılamaz · her değişiklik `plan_events`'te.

### Bilerek yapılmayanlar

- **Öğrenci ve veli girişi.** `member_role` genişletilmedi, `student_guardians` yazılmadı.
  Kurumun erişim modeli belli değil; tanımlanmamış bir erişim yolunu şemaya yazmak, ürünün
  sahip olmadığı bir yeteneği iddia etmek olurdu. `students.report_audience` raporun kime
  yazıldığını ayırıyor; yetişkin raporu kendiliğinden veli raporuna dönüşmüyor.
  Öğrenciye verilecek liste, Plan sekmesinin yazdırma görünümü.
- **ART entegrasyonu.** Doğrulanmış API yok. Kütüphane kayıtları `is_sample` ile işaretli ve
  her ekranda öyle görünüyor; hiçbir yerde "ART'a atandı" yazmıyor.
- **Ses analizi / otomatik konuşma notlandırma.** MVP için gerekli değil (plan §10).

### Kuruma sorulacak — Bölüm 5'e eklenenler

6. **Konuşma ve yazma için kurumun kendi değerlendirme ölçütleri neler?** `lib/rubric.ts`
   içindeki `pilot-taslak-v1` bizim taslağımız. Kurumunki geldiğinde `RUBRIC_VERSION`
   artırılır; eski kayıtlar kendi sürümlerini taşıdığı için karşılaştırma bozulmaz.
7. **Kurumun öğretim planındaki alt beceriler bizim ölçütlerimizle örtüşüyor mu?** Ayrı bir alt
   beceri kataloğu tutulmuyor; ölçütler o işi görüyor.
8. **Guided Practice ve +More takvimi ile kontenjanlar nereden alınacak, dışa aktarılabiliyor mu?**
9. **Çocuk/genç programında veli–öğrenci ilişkisi hangi sistemde tutuluyor?** Erişim modeli
   bu cevaba bağlı.
