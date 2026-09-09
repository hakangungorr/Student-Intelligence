"use client";
import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";
import type { Settings } from "@/lib/settings";

const idle: SettingsState = { status: "idle" };

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, submit, saving] = useActionState(saveSettings, idle);
  return <form className="panel pad form-stack" action={submit}>
    <h2>Kurum kararları</h2>
    {state.status !== "idle" && <p className={`note${state.status === "error" ? " error-note" : ""}`}>
      {state.message}</p>}

    <label>Geçme notu
      <input type="number" name="passMark" min={0} max={100} step={1}
        defaultValue={settings.passMark} required inputMode="numeric" />
      <small className="note">Bu notun altındaki sınav ve beceri puanları risk sayılır.
        Öğrenci kartındaki kesikli çizgi de buraya çekilir.</small></label>

    <label>Devamsızlıkta kritik sınır (%)
      <input type="number" name="attendanceFloor" min={0} max={100} step={1}
        defaultValue={settings.attendanceFloor} required inputMode="numeric" />
      <small className="note">Devam oranı bu değerin altındaki öğrenciler gündemdeki
        “Devamsızlığı kritik” sayısına girer.</small></label>

    <label>Kur adları
      <textarea name="levels" rows={4} defaultValue={settings.levels.join(", ")}
        required spellCheck={false} />
      <small className="note">Virgülle ya da alt alta yazın. Aktarılan dosyalarda ve
        formlarda yalnızca bu adlar kabul edilir; büyük/küçük harf farkı önemsizdir.</small></label>

    <button type="submit" className="primary" disabled={saving}>
      {saving ? "Kaydediliyor ve yeniden hesaplanıyor…" : "Kaydet ve skorları yenile"}</button>
  </form>;
}
