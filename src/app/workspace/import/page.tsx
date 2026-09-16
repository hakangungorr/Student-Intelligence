import { redirect } from "next/navigation";

/** Veri aktarımı artık Veri girişi ekranının bir sekmesi. Eski bağlantılar ve
 *  yer imleri kırılmasın diye adres yönlendirir. */
export default function Import() {
  redirect("/workspace/entry?yol=dosya");
}
