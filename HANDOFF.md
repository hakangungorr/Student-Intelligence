# Student Intelligence — Claude Code Devir Dokümanı

**Proje:** Eğitim kurumları için AI destekli öğrenci risk tespit platformu
**Hedef:** American LIFE'a gösterilecek 3–5 dakikalık çalışan demo
**Tarih:** 7 Eylül 2026
**Notion:** [Proje 03 — Student Intelligence MVP](https://app.notion.com/p/3cfc55d081f481d2b5bbc7b5baa8947d)

---

## 1. Bu dokümanın amacı

Risk motoru ve demo dataseti **bitti**. Sırada 4 ekranlı dashboard var.

Bu doküman Claude Code'a şunu söyler: veri hazır, mantık kilitli, sen sadece arayüzü kur. Aşağıdaki "Yeniden açılmayacak kararlar" bölümü önemli — bunlar veri üzerinde test edilerek verildi, sıfırdan türetilmemeli.

---

## 2. Ürün tek cümlede

> Öğrenci verisini okuyup **hangi öğrenciye, neden müdahale edilmesi gerektiğini ve önerilen aksiyonu** yöneticinin önüne getiren karar destek sistemi.

Sihir anı: sistem "kim kötü durumda?" demiyor; **neden riskli olduğunu ve sıradaki aksiyonu** söylüyor.

---

## 3. Tamamlanan işler

### Risk motoru — v0.4 (`risk_engine_v4.py`)

Deterministik, LLM yok. 4 bağımsız boyut + sıralama için composite skor.

| Boyut | Ağırlık | Kalibrasyon | Girdi |
|---|---|---|---|
| Test Performansı | %30 | Kur içi göreli | Sınav trendi, monotonik düşüş, kur ortalamasına uzaklık |
| Beceri Profili | %25 | Kur içi göreli | Kur ortalamasına uzaklık + beceri dengesizliği |
| Sınıf İçi Performans | %20 | Mutlak | Katılım, ödev, eğitmen endişesi |
| Devam | %25 | Mutlak | Oran + son 4 hafta trendi |

**Eşikler:** HIGH ≥ 65 · MEDIUM ≥ 30 · altı LOW
**Güvenlik kuralı:** 3+ boyut ≥60 ise composite ne olursa olsun HIGH
**Kohort benchmark:** her kurun en iyi %25'inin ortalaması
**Mutlak geçme notu tabanı:** 60 *(American LIFE'a doğrulatılacak)*

### Demo dataseti (`demo_dataset.json`)

100 sentetik öğrenci · 4 şube (Ankara, İstanbul, İzmir, Bursa) · 5 kur (A1–C1)
Dağılım: **20 HIGH / 24 MEDIUM / 56 LOW**
İki haftalık karşılaştırma dahil (geçen hafta: 15 HIGH / 31 MEDIUM / 54 LOW)

---

## 4. Yeniden açılmayacak kararlar

Bunlar veri üzerinde test edilerek verildi. Claude Code bunları sorgulamasın, uygulasın.

### ❌ "Ortalama devam oranı" KPI'ı kullanılmayacak
Kurum ortalaması %82.5 — iyi görünüyor. Altında 21 öğrencinin devamı %75'in altında. Ortalama görülmesi gereken kuyruğu siliyor. Yerine **"devamı %75 altındaki öğrenci sayısı"**.

### ❌ Boyut ortalamaları üst şeritte gösterilmeyecek
Kurum çapında Beceri 28.5 · Test 27.1 · Devam 26.7 · Sınıf içi 24.1 — dördü de aynı. Toplulaştırma sinyali öldürüyor. Şube kırılımında İzmir beceri **50**, Ankara **16**. Bu yüzden **ısı haritası ek panel değil, ana unsur**.

### ❌ Eğitmen analitiği yok
İki sebep: (1) En kötü görünen iki eğitmen de İzmir'de — ama sebep şubenin sistemik speaking açığı, o iki kişi değil. Naif sıralama yanlış suçluyu bulur. (2) Sınıf içi boyutu öğretmenin veri girmesine bağlı; ürün denetleyici algılanırsa veri gelmez ve en büyük farklılaştırıcı çöker.

`teacher` alanı **öğrenci kaydında kalır** (aksiyon "eğitmen görüşmesi" ise kiminle görüşüleceği bilinmeli) ama **analiz ekseni değildir**: filtre yok, sıralama yok, kıyaslama yok.

### ❌ Bağlılık / memnuniyet boyutu skorlanmıyor
`satisfaction_score` alanı duruyor ve öğrenci detayında **gösteriliyor**, ama risk skoruna girmiyor. Anket verisi dönemde bir kez toplanıyor, yanıt oranı %30–50, ve "3/10" yazan öğrenci zaten gitmeye karar vermiş oluyor — erken uyarı değil.

⚠️ Demo maliyeti: "kayıt yenilemeyecekleri görebiliyor musunuz?" sorusunun cevabı şu an **hayır**. Ufuk Bey bunu sorabilir.

### ✅ Skorlar tavansız sıralanır
`risk_score` gösterimde 100'de sınırlı; **sıralama `risk_score_raw` ile yapılır**. 9 öğrenci 100'e vuruyor, ham skor onları ayırıyor. Öncelik listesi ham skora göre sıralanmalı.

---

## 5. Veri şeması — `demo_dataset.json`

```
{
  "kpi": { ... },
  "benchmarks": { "<kur>": {...} },
  "branch_x_dimension": { "<şube>": {...} },
  "level_x_dimension": { "<kur>": {...} },
  "students": [ ... ]   // risk_score_raw'a göre azalan sıralı
}
```

### `kpi`

```json
{
  "acil_mudahale":     { "value": 20, "prev": 15 },
  "izlemede":          { "value": 24, "prev": 31 },
  "yeni_riske_giren":  5,
  "toparlanan":        3,
  "devami_kritik":     21,
  "en_yogun_risk_sube": "Izmir",
  "toplam_ogrenci":    100
}
```

### `branch_x_dimension` / `level_x_dimension`

Isı haritalarının kaynağı. Boyut değerleri 0–100 ortalama risk (yüksek = kötü).

```json
"Izmir": { "n": 22, "high": 7, "test": 32.9, "skill": 50.2, "classroom": 30.0, "attendance": 32.9 }
```

### `benchmarks`

```json
"B1": { "exam": 80.92, "skill": 81.46, "cohort_size": 26 }
```

### `students[]`

**Ham veri**
`student_id` `name` `branch` `level` `teacher`
`attendance_rate` `attendance_recent`
`exam_1` `exam_2` `exam_3` `exam_4`
`speaking_score` `writing_score` `listening_score` `reading_score`
`participation_score` (1–10) `homework_completion` (0–100) `teacher_concern` (bool)
`satisfaction_score` (1–10, **gösterilir, skorlanmaz**)

**Skor çıktısı**

| Alan | Tip | Açıklama |
|---|---|---|
| `dimensions` | dict | `{test, skill, classroom, attendance}` — her biri 0–100 |
| `dimension_detail` | dict | Boyut başına ayrıntı, aşağıda |
| `risk_score` | int | 0–100, **gösterim için** |
| `risk_score_raw` | float | Tavansız, **sıralama için** |
| `risk_level` | str | `HIGH` / `MEDIUM` / `LOW` |
| `top_dimension` | str | Baskın boyut anahtarı |
| `critical_dimensions` | list | Boyutlar ≥60 |
| `elevated_dimensions` | list | Boyutlar ≥50 |
| `risk_reasons` | list[str] | İnsan okunur, öncelik sırasında |
| `recommended_action` | str | Önerilen aksiyon |
| `weighted_avg` / `escalation` | float / int | Skorun bileşenleri (debug) |

**Haftalık karşılaştırma**

| Alan | Tip | Açıklama |
|---|---|---|
| `prev_risk_score` | int | Geçen haftaki skor |
| `prev_risk_level` | str | Geçen haftaki seviye |
| `delta` | int | `risk_score - prev_risk_score` |
| `transition` | str | `worse` / `better` / `same` |

**`dimension_detail` yapısı**

```json
{
  "test":       { "delta": -12.0, "last_exam": 43, "monotonic_decline": true,
                  "recent_avg": 48.5, "cohort_gap_pct": 44.1 },
  "skill":      { "weakest": "Speaking", "weakest_score": 22, "own_avg": 42.5,
                  "spread": 20.5, "cohort_gap_pct": 50.0, "diagnosis": "beceri_acigi" },
  "classroom":  { "participation": 1, "homework": 47, "teacher_concern": true },
  "attendance": { "rate": 50, "recent": 38, "drop": 12 }
}
```

`diagnosis` üç değer alır ve **aksiyonu belirler**:
- `beceri_acigi` → tek beceri kendi ortalamasının çok altında → hedefli 2 haftalık destek
- `seviye_dusuklugu` → tüm beceriler kurun altında → kur tekrarı / telafi
- `temiz` → aksiyon yok

---

## 6. Yapılacak — 4 ekran

### Ekran 1 — Executive Dashboard

**Üst şerit, 4 kart** (fazlası okunmuyor):

| Kart | Kaynak | Gösterim |
|---|---|---|
| Acil müdahale | `kpi.acil_mudahale` | `20` · geçen hafta 15 ▲ |
| İzlemede | `kpi.izlemede` | `24` · geçen hafta 31 ▼ |
| Yeni riske giren | `kpi.yeni_riske_giren` | `5` |
| Devamı kritik | `kpi.devami_kritik` | `21` (%75 altı) |

"Toplam 100 aktif öğrenci" başlık altında küçük bağlam satırı — kart değil.

**Ana paneller:**

1. **Öncelik listesi** — ilk 10, `risk_score_raw` sıralı. Her satır: isim · şube · kur · skor · baskın boyut · ilk 2 `risk_reasons` · `recommended_action`. Bu ekranın sihir anı.
2. **Şube × Boyut ısı haritası** — `branch_x_dimension`. İzmir'in beceri 50'si burada patlamalı.
3. **Kur × Boyut ısı haritası** — `level_x_dimension`. B1'in devam 38'i görünmeli.
4. **Toparlananlar** — `transition == "better"`. Küçük panel ama kritik: müdahalenin işe yaradığını gösteren tek yer.

### Ekran 2 — Student Detail

- Kimlik: şube · kur · eğitmen
- **4 boyut görselleştirmesi** (radar veya yatay bar) — ekranın merkezi
- Sınav trendi grafiği (`exam_1..4`), monotonik düşüş varsa işaretli
- Beceri kırılımı (4 beceri) + kur benchmark'ı referans çizgisi
- Devam: `attendance_rate` ve `attendance_recent` birlikte (düşüş görünsün)
- Sınıf içi: katılım, ödev, eğitmen endişesi
- Memnuniyet — **gösterilir, "skora dahil değil" notuyla**
- Risk skoru + geçen haftaya göre değişim
- `risk_reasons` listesi
- `recommended_action`

### Ekran 3 — Risk & Action Center

Filtrelenebilir tablo. **Filtreler: Şube / Kur / Risk seviyesi / Boyut** — eğitmen filtresi yok.

Kolonlar: Öğrenci · Şube · Kur · Risk seviyesi · Skor · Baskın boyut · Risk nedeni · Önerilen aksiyon · Haftalık değişim

### Ekran 4 — AI Assistant

Dört demo sorusunun **veride gerçek karşılığı var** — uydurmamalı:

| Soru | Beklenen cevap | Kaynak |
|---|---|---|
| "Bu hafta kimlerle ilgilenmeliyiz?" | İlk 10 öncelik listesi | `students` (raw sıralı) |
| "B1'in en büyük problemi ne?" | Devam (38), test 32 ve beceri 36'nın üstünde | `level_x_dimension.B1` |
| "Devamsızlığı artan ve performansı düşen öğrenciler" | 14 öğrenci | `attendance.drop >= 8 && test.delta <= -4` |
| "Hangi şubede speaking zayıf?" | İzmir — speaking 51.4, diğer beceriler 67.7 | öğrenci bazında hesap |

---

## 7. Demo hikâyesi

Feature listesi gezdirilmeyecek. Tek hikâye:

1. "Yüzlerce öğrenciyi tek tek takip etmek mümkün değil."
2. Dashboard açılır — sadece aksiyon gereken öğrenciler.
3. Riskli bir öğrenciye girilir.
4. Sistem sinyalleri **birlikte** açıklar (sınav düşüşü + devamsızlık + speaking).
5. Önerilen aksiyon gösterilir.
6. AI Assistant'a "Bu hafta kimlerle ilgilenmeliyiz?" sorulur.

**Ana mesaj:** *"Her öğrenciyi takip etmek imkânsız. AI sizin için takip etsin."*

---

## 8. Teknik notlar

- **Frontend:** Next.js / React
- **Veri:** `demo_dataset.json` doğrudan okunur — demo için backend gerekmiyor
- **Grafik:** trend çizgisi, radar/bar, ısı haritası
- **AI katmanı:** `risk_reasons` ve `dimension_detail` zaten hazır; LLM sadece bunları akıcı cümleye çevirir. **Skoru LLM hesaplamaz.**
- Skor gösterimde `risk_score`, sıralamada `risk_score_raw`
- Renk eşiği: ≥60 kırmızı · ≥30 sarı · altı yeşil

**Yapılmayacaklar:** gerçek veri, kurum entegrasyonu, production auth, öğrenci/veli uygulaması, ödeme, CRM, WhatsApp, ML tahmin modeli, karmaşık agent yapısı.

---

## 9. Açık kalanlar

**American LIFE'a sorulacak keşif soruları** (cevapsız kalırsa hangi boyutun çöktüğü yazılı):

1. Eğitmenler öğrenci hakkında yazılı bir şey tutuyor mu? Nerede? *(Sınıf içi boyutu tamamen buna bağlı.)*
2. Devamsızlık tarihli mi tutuluyor, yoksa sadece dönem sonu oranı mı? *(Trend için en az iki zaman noktası gerekiyor.)*
3. Beceri skorları nasıl üretiliyor — kur içi müfredattan mı, mutlak yeterlilik mi?
4. Kayıt yenileme ve ödeme geçmişi hangi sistemde? *(Bağlılık boyutunun ön koşulu.)*
5. Geçme notu kaç? *(Şu an 60 varsayıldı.)*

**Pilotta gelecekler:** davranışsal bağlılık boyutu (kayıt yenileme, ödeme gecikmesi, kurlar arası boşluk), eğitmen kırılımı (kurumla konuşulduktan sonra), gerçek veri entegrasyonu.
