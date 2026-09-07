"""
Student Intelligence — Risk Engine v0.4
American LIFE Pilot MVP

v0.3'ten farklar:
 1) BAGLILIK boyutu cikarildi. Anket verisi kurumda yok / bayat / yanit orani dusuk.
    satisfaction_score veri modelinde KALIYOR ama skorlanmiyor — sadece ogrenci
    detay ekraninda gosteriliyor. Pilotta CRM + odeme verisi gelince geri acilir.
 2) Akademik boyutlar (Test, Beceri) artik KUR ICI GORELI.
    Eslesme referansi disaridan verilmiyor; her kurun kendi en iyi ceyreginin
    ortalamasi benchmark olarak hesaplaniyor. Kurum degisse de kalibrasyon bozulmaz.
 3) Saf goreli model her zaman bir alt ceyrek uretir. Bunu dengelemek icin
    her akademik boyutta MUTLAK GECME NOTU TABANI var.

Devam ve Sinif Ici boyutlari MUTLAK kalir: %60 devam her kurda kotudur.
"""

from statistics import mean

HIGH_THRESHOLD = 65
MEDIUM_THRESHOLD = 30

WEIGHTS = {
    "test": 0.30,
    "skill": 0.25,
    "classroom": 0.20,
    "attendance": 0.25,
}

MAX_DIMENSION_FLOOR = 0.60
ESCALATION = {0: 0, 1: 0, 2: 10, 3: 22, 4: 32}
ELEVATED_AT = 50

PASS_MARK = 60          # kurumun gecme notu — mutlak guvenlik tabani
BENCHMARK_QUANTILE = 0.25   # her kurun en iyi %25'i referans alinir

DIM_LABELS = {
    "test": "Test Performansi",
    "skill": "Beceri Profili",
    "classroom": "Sinif Ici Performans",
    "attendance": "Devam",
}


# ---------------------------------------------------------------------------
# KOHORT BENCHMARK — referans veriden uretilir, disaridan verilmez
# ---------------------------------------------------------------------------
def build_benchmarks(students):
    """Her kur icin, o kurun en iyi %25'inin ortalamasi = benchmark."""
    by_level = {}
    for s in students:
        by_level.setdefault(s["level"], []).append(s)

    marks = {}
    for level, group in by_level.items():
        n = max(1, round(len(group) * BENCHMARK_QUANTILE))

        exam_vals = sorted((mean([st["exam_3"], st["exam_4"]]) for st in group), reverse=True)
        skill_vals = sorted((mean([st["speaking_score"], st["writing_score"],
                                   st["listening_score"], st["reading_score"]])
                             for st in group), reverse=True)
        marks[level] = {
            "exam": mean(exam_vals[:n]),
            "skill": mean(skill_vals[:n]),
            "cohort_size": len(group),
        }
    return marks


def gap_points(value, benchmark, scale):
    """Benchmark'a gore yuzde geride kalma -> risk puani."""
    if benchmark <= 0:
        return 0, 0.0
    gap = (benchmark - value) / benchmark * 100
    if gap >= 35:   p = scale
    elif gap >= 25: p = round(scale * 0.75)
    elif gap >= 15: p = round(scale * 0.47)
    elif gap >= 8:  p = round(scale * 0.20)
    else:           p = 0
    return p, round(gap, 1)


# ---------------------------------------------------------------------------
# BOYUT 1 — TEST PERFORMANSI   (trend + kur ici goreli konum + mutlak taban)
# ---------------------------------------------------------------------------
def test_dimension(s, bm):
    exams = [s["exam_1"], s["exam_2"], s["exam_3"], s["exam_4"]]
    delta = mean(exams[-2:]) - mean(exams[:2])
    recent = mean(exams[-2:])
    last = exams[-1]

    if delta <= -12:    trend = 45
    elif delta <= -8:   trend = 36
    elif delta <= -4:   trend = 22
    elif delta <= -1.5: trend = 10
    elif delta >= 6:    trend = -8
    else:               trend = 0

    rel, gap = gap_points(recent, bm["exam"], 40)

    if last < PASS_MARK - 10:  floor = 25
    elif last < PASS_MARK:     floor = 15
    else:                      floor = 0

    # Kesintisiz dusus: her sinav bir oncekinden dusuk.
    # Delta bunu kacirabilir (kucuk ama istikrarli dusus), oysa dalgalanma degil
    # yorunge oldugu icin daha guclu bir sinyaldir. Mudure anlatmasi da kolay.
    monotonic = all(exams[i] > exams[i + 1] for i in range(3))
    mono = 10 if monotonic else 0

    notes = []
    if monotonic:
        notes.append("Son 4 sinavin her biri bir oncekinden dusuk")
    if delta <= -4:
        notes.append(f"Son 4 sinavda {abs(delta):.1f} puan dusus")
    elif delta >= 6:
        notes.append(f"Sinav trendi yukselisde (+{delta:.1f})")
    if gap >= 15:
        notes.append(f"{s['level']} kur ortalamasinin %{gap:.0f} altinda")
    if last < PASS_MARK:
        notes.append(f"Son sinav {last} — gecme notunun altinda")

    return clamp(trend + rel + floor + mono), notes, {
        "delta": round(delta, 1), "last_exam": last, "monotonic_decline": monotonic,
        "recent_avg": round(recent, 1), "cohort_gap_pct": gap,
    }


# ---------------------------------------------------------------------------
# BOYUT 2 — BECERI PROFILI  (kur ici konum + DENGESIZLIK + mutlak taban)
# Dengesizlik = en zayif beceri ile ogrencinin KENDI ortalamasi arasindaki fark.
# Kur-bagimsizdir: "kendi ortalamasinin 25 puan altinda" A1'de de C1'de de ayni sey.
# Seviye dusuklugu ile beceri acigi FARKLI hastaliklardir, farkli aksiyon gerektirir.
# ---------------------------------------------------------------------------
def skill_dimension(s, bm):
    skills = {
        "Speaking": s["speaking_score"], "Writing": s["writing_score"],
        "Listening": s["listening_score"], "Reading": s["reading_score"],
    }
    weakest_name = min(skills, key=skills.get)
    weakest = skills[weakest_name]
    own_avg = mean(skills.values())

    rel, gap = gap_points(own_avg, bm["skill"], 45)

    spread = own_avg - weakest
    if spread >= 22:   imb = 35
    elif spread >= 16: imb = 24
    elif spread >= 10: imb = 12
    else:              imb = 0

    if weakest < PASS_MARK - 10: floor = 25
    elif weakest < PASS_MARK:    floor = 14
    else:                        floor = 0

    notes = []
    if gap >= 15:
        notes.append(f"Beceri ortalamasi {s['level']} kurunun %{gap:.0f} altinda")
    if imb >= 24:
        notes.append(f"{weakest_name} {weakest} — kendi ortalamasinin {spread:.0f} puan altinda")
    elif weakest < PASS_MARK:
        notes.append(f"{weakest_name} {weakest} — gecme notunun altinda")

    diagnosis = ("beceri_acigi" if imb >= 24 else
                 "seviye_dusuklugu" if gap >= 15 else "temiz")

    return clamp(rel + imb + floor), notes, {
        "weakest": weakest_name, "weakest_score": weakest,
        "own_avg": round(own_avg, 1), "spread": round(spread, 1),
        "cohort_gap_pct": gap, "diagnosis": diagnosis,
    }


# ---------------------------------------------------------------------------
# BOYUT 3 — SINIF ICI PERFORMANS  (mutlak — egitmen gozlemi)
# ---------------------------------------------------------------------------
def classroom_dimension(s, bm=None):
    part, hw, concern = s["participation_score"], s["homework_completion"], s["teacher_concern"]

    if part <= 3:   p = 40
    elif part <= 5: p = 26
    elif part <= 6: p = 14
    else:           p = 0

    if hw < 40:   h = 40
    elif hw < 60: h = 28
    elif hw < 75: h = 14
    else:         h = 0

    c = 20 if concern else 0

    notes = []
    if part <= 5:   notes.append(f"Derse katilim {part}/10")
    if hw < 75:     notes.append(f"Odev tamamlama %{hw}")
    if concern:     notes.append("Egitmen endise bildirdi")

    return clamp(p + h + c), notes, {"participation": part, "homework": hw,
                                     "teacher_concern": concern}


# ---------------------------------------------------------------------------
# BOYUT 4 — DEVAM  (mutlak — oran + son donem trendi)
# ---------------------------------------------------------------------------
def attendance_dimension(s, bm=None):
    rate, recent = s["attendance_rate"], s["attendance_recent"]
    drop = rate - recent

    if rate < 65:   lvl = 60
    elif rate < 75: lvl = 45
    elif rate < 80: lvl = 28
    elif rate < 85: lvl = 14
    else:           lvl = 0

    if drop >= 15:   tr = 40
    elif drop >= 10: tr = 28
    elif drop >= 5:  tr = 15
    else:            tr = 0

    notes = []
    if rate < 85:  notes.append(f"Devam orani %{rate}")
    if drop >= 5:  notes.append(f"Son 4 haftada %{rate} -> %{recent}")

    return clamp(lvl + tr), notes, {"rate": rate, "recent": recent, "drop": drop}


def clamp(v):
    return max(0, min(100, v))


DIMENSION_FNS = {
    "test": test_dimension,
    "skill": skill_dimension,
    "classroom": classroom_dimension,
    "attendance": attendance_dimension,
}

ACTIONS = {
    "test":       "egitmen gorusmesi + telafi plani",
    "skill":      None,   # teshise gore secilir
    "classroom":  "egitmen ile ogrenci degerlendirme toplantisi",
    "attendance": "ogrenci iliskileri aramasi (devamsizlik nedeni)",
}


def score_student(s, benchmarks):
    bm = benchmarks[s["level"]]
    dims, notes, detail = {}, {}, {}
    for key, fn in DIMENSION_FNS.items():
        dims[key], notes[key], detail[key] = fn(s, bm)

    weighted = sum(dims[k] * WEIGHTS[k] for k in dims)
    top_dim = max(dims, key=dims.get)
    floor = dims[top_dim] * MAX_DIMENSION_FLOOR
    elevated = [k for k in dims if dims[k] >= ELEVATED_AT]
    raw = max(weighted, floor) + ESCALATION[len(elevated)]
    composite = min(100, round(raw))
    # Tavana vuran ogrenciler ayni skoru paylasiyor ve oncelik listesi
    # siralanamaz hale geliyor ("once kimi arayayim?" cevapsiz kalir).
    # Gosterimde 100'de sinirli, siralamada tavansiz.

    if composite >= HIGH_THRESHOLD:   level = "HIGH"
    elif composite >= MEDIUM_THRESHOLD: level = "MEDIUM"
    else:                              level = "LOW"

    critical = [k for k in dims if dims[k] >= 60]
    if len(critical) >= 3:
        level = "HIGH"

    # --- aksiyon
    diag = detail["skill"]["diagnosis"]
    skill_action = ("hedefli " + detail["skill"]["weakest"] + " destek plani (2 hafta)"
                    if diag == "beceri_acigi" else
                    "seviye degerlendirmesi — kur tekrari / telafi programi")
    acts = []
    for k in sorted(dims, key=dims.get, reverse=True)[:2]:
        if dims[k] >= 40:
            acts.append(skill_action if k == "skill" else ACTIONS[k])
    action = (("ACIL: " if level == "HIGH" else "") + " + ".join(acts)
              if acts else "Aksiyon gerekmiyor — rutin takip")

    flat = [n for k in sorted(dims, key=dims.get, reverse=True) for n in notes[k]]

    return {
        **s,
        "dimensions": dims,
        "dimension_detail": detail,
        "critical_dimensions": critical,
        "elevated_dimensions": elevated,
        "top_dimension": top_dim,
        "weighted_avg": round(weighted, 1),
        "escalation": ESCALATION[len(elevated)],
        "risk_score": composite,
        "risk_score_raw": round(raw, 1),   # siralama icin — tavansiz
        "risk_level": level,
        "risk_reasons": flat or ["Belirgin risk sinyali yok"],
        "recommended_action": action,
    }


def score_all(students):
    bms = build_benchmarks(students)
    return [score_student(s, bms) for s in students], bms
