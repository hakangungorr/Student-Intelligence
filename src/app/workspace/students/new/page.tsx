import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { NewStudentForm } from "./form";

export default async function NewStudent() {
  const { client } = await requireUser();
  const [branches, settings] = await Promise.all([
    client.from("branches").select("id,name").order("name"),
    loadSettings(client)
  ]);
  if (branches.error) throw new Error("Şubeler okunamadı.");

  return <>
    <Link className="backlink" href="/workspace/students">← Öğrenci listesine dön</Link>
    <p className="eyebrow">YENİ ÖĞRENCİ</p>
    <h1>Öğrenci kaydı.</h1>
    <p className="intro">Tek öğrenci için form; bir dönemin tamamını taşıyacaksanız{" "}
      <Link href="/workspace/import">CSV aktarımı</Link> daha hızlıdır. Sınav ve devam bilgileri
      kayıttan sonra <Link href="/workspace/entry">veri girişi</Link> sayfasından girilir.</p>
    <NewStudentForm branches={branches.data} levels={settings.levels} />
  </>;
}
