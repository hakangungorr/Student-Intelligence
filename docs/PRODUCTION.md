# Production temeli

Bu aşama production MVP'nin altyapısıdır; gerçek veriyle devreye alınmış bir ürün
değildir. Mevcut dört ekranlı demo korunur. Kurum modu ayrı Next.js sayfalarıdır.

## Hazır olanlar

- Next.js App Router, React, TypeScript; yerel gömülü yazı tipleri.
- Sunucu aksiyonuyla e-posta / şifre girişi ve çıkış.
- Proxy üzerinden cookie yenileme; korumalı sayfa ve veri erişiminde `getUser()`.
- Demo ve kurum modlarının ayrılması; production'da `/demo` 404 verir.
- Kurum, şube, üyelik, öğrenci, kur kaydı, ölçüm, gözlem, risk geçmişi ve aksiyon şeması.
- Kurum ve şube bazlı RLS; eğitmen için aktif öğrenci ataması kontrolü.
- Aksiyon oluşturma / durum değişikliği ve gözlem ekleme için değiştirilemez işlem izi.
- Veritabanına bağlı aktif öğrenci sayısı, şube listesi ve kişinin erişim bilgileri.
- Ortam örneği, health endpoint, GitHub CI, lint, tip denetimi ve PostgreSQL RLS testleri.

## Ortamlar

| Ortam | Mod | Veri |
|---|---|---|
| Yerel demo | `demo` | Gömülü sentetik veri; Supabase kullanılmaz |
| Staging | `supabase` | Ayrı Supabase projesi; yalnızca test verisi |
| Production | `supabase` | Kurumun onayladığı ayrı proje |

`.env.example` dosyasını `.env.local` olarak kopyalayın. Kurum modunda:

```dotenv
APP_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Publishable key istemcide kullanılabilir; tek başına yetki vermez. RLS ve SQL
izinleri erişimi belirler. Bu uygulama `service_role` anahtarı kullanmaz. Böyle
bir anahtarı `NEXT_PUBLIC_*` ortam değişkenine asla koymayın. Gizli dosyalar git
dışındadır. Gerçek öğrenci verileri repoya veya CI çıktısına eklenmez.

`APP_DATA_MODE` tanımlanmazsa kurum modu seçilir. Eksik Supabase ayarında
`/workspace` kurulum ekranına gider ve `/api/health` 503 döner. Demo etkinleşmez.
Health kontrolü süreç / yapılandırma kontrolüdür; Supabase erişilebilirlik testi
veya migration doğrulaması değildir.

## Supabase kurulumu

1. Kurumla barındırma bölgesini ve veri işleme koşullarını belirleyin. Staging ve
   production için farklı projeler oluşturun; üretim verisini preview ortamına bağlamayın.
2. Supabase CLI ile giriş yapıp doğru projeyi bağlayın:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   ```

3. Auth ayarlarında herkese açık kayıt ve anonim oturumları kapatın. Depodaki
   `config.toml` bunu yerel Supabase için ayarlar; barındırılan projenin ayarları
   ayrıca kontrol edilmelidir. E-posta doğrulamasını açık tutun.
4. Auth Site URL'yi gerçek uygulama adresine ayarlayın. Redirect listesine sadece
   gerekli tam adresleri ekleyin. Auth rate-limit ayarlarını gözden geçirin.
5. İlk kullanıcıyı Supabase Auth yönetim ekranında oluşturun. Kullanıcının UUID'sini
   alın; aşağıdaki işlemi yetkili SQL Editor oturumunda çalıştırın. Parola yönetimi
   kurumun kontrollü hesap sağlama sürecinden yapılır. Davet kabulü ve şifre sıfırlama
   arayüzleri bu aşamanın kapsamında değildir.

   ```sql
   begin;
   with new_org as (
     insert into public.organizations(name)
     values ('American LIFE') returning id
   ), first_branch as (
     insert into public.branches(organization_id,name)
     select id,'İzmir' from new_org returning organization_id
   )
   insert into public.memberships(user_id,organization_id,role)
   select 'REPLACE_WITH_AUTH_USER_UUID'::uuid, organization_id, 'org_admin'
   from first_branch;
   commit;
   ```

   Bu işlem ilk kurulum içindir; tekrar çalıştırıp kurumları çoğaltmayın. Sonraki
   üyelikler mevcut kurum / şube kimlikleriyle eklenir. `org_admin` üyeliğinin
   `branch_id` değeri boş; diğer rollerin şubesi zorunludur. Eğitmenlerin ayrıca
   `enrollments.teacher_id` alanında aktif öğrenci atamaları olmalıdır.

6. İlk yöneticiyle `/login` üzerinden giriş yapın. `/workspace` şubeyi ve sıfır
   öğrenci sayısını göstermelidir. Üyeliği olmayan kullanıcı veri göremez.

Docker ve Supabase CLI yüklüyse yerel Supabase için `npx supabase start` ardından
`npx supabase db reset` kullanılabilir. `db reset` yalnızca boş / atılabilir yerel
veritabanı içindir; yerel mevcut veriyi siler. Otomatik seed kapalıdır.

## Yetki modeli

| Rol | Okuma | Yazma |
|---|---|---|
| Kurum yöneticisi | Kendi kurumunun tüm şubeleri | Aksiyon, gözlem, öğrenci / kur kaydı / ölçüm aktarımı, risk skoru |
| Şube yöneticisi | Üye olduğu şube | Aksiyon, gözlem, kendi şubesinde aktarım. Risk skoru **yazamaz** |
| Eğitmen | Üye olduğu şubede aktif atanmış öğrenciler | Atanmış öğrencide aksiyon ve gözlem |
| Görüntüleyici | Üye olduğu şube | Yok |
| Üyeliği olmayan / anonim | Öğrenci verisi yok | Yok |

Kullanıcılar kendi üyeliklerini okuyabilir, değiştiremez. Kurum / şube / öğrenci
eşleşmeleri birleşik yabancı anahtarlarla korunur. Tarayıcıdan farklı şube kimliği
göndermek erişim sağlamaz.

Öğrenci / kur kaydı / ölçüm aktarımı ve risk skoru yazma yetkisi, ilk tasarımda
kapalıydı; veri aktarımı geldiğinde açıldı. Alternatif `service_role` anahtarıyla
sunucu tarafında yazmaktı, ancak bu anahtar buradaki bütün politikaları atlar ve
yalnızca tek bir kurumun kendi satırlarına dokunan bir iş için uygulamaya sınırsız
bir kimlik verirdi. Ele geçen bir oturum yalnızca kendi kurumuna yazabilir; sızan
bir `service_role` anahtarı her kuruma yazabilir. Bu yüzden aktarım RLS'in
etrafından değil içinden geçer ve `service_role` kullanılmaz kararı korunur.

Güncelleme yetkileri kolon bazlıdır: aktarım bir listenin içeriğini düzeltir, bir
satırın hangi kuruma ait olduğunu değil. `organization_id` ve kimlik kolonları
kurum yöneticisi için bile yazılamaz.

Risk skoru yazmak yalnızca kurum yöneticisindedir ve gerekçe güven değil
kalibrasyondur: her kurun benchmark'ı o kurun en iyi %25'inin ortalamasıdır, bu
yüzden tek şubeyi puanlamak öğrenciyi kendi şubesiyle kıyaslar. Aynı öğrenci
düğmeye kimin bastığına göre farklı skor alırdı.

Aksiyonun sadece `status`, `due_on`, `note` alanları güncellenebilir. Kurum,
öğrenci, yazar ve oluşturulma tarihi değiştirilemez. Audit tablosuna istemci
yazamaz veya kayıt silemez. İşlem izleri veri tabanı yöneticisine karşı değişmezlik
garantisi vermez; yönetici operasyonlarını ayrıca izlemek gerekir.

## Veri modelinin sınırları

`student_measurements` ortak tarih / tür / değer şemasıdır; tam bir yoklama
sistemi değildir. Gerçek kaynak belirlendiğinde ders bazlı katılım ve eksik veri
tanımları netleştirilecek. Risk geçmişi dönem ve motor sürümüyle saklanır.

CSV aktarımı çalışır durumdadır; Excel dosyası okunmaz, kurumun dosyayı CSV olarak
dışa aktarması gerekir. Sütun sözleşmesi demo veri setinden türetilmiştir çünkü
kurumun kendi dışa aktarımı henüz görülmedi. Sınav tarihleri dosyada olmadığı için
bütün ölçümler seçilen dönem sonu tarihine yazılır; sıralama `source_reference`
alanında taşınır.

Risk motoru v0.4 TypeScript'e taşındı ve uygulamadan çalıştırılır. Python sürümü
referans olarak korunur: `tests/engine.test.ts` yüz referans öğrenciyi porttan
geçirir ve skor, seviye, dört boyut, teşhis, gerekçe ile aksiyonun birebir tutmasını
şart koşar. Hesaplama elle tetiklenir; zamanlanmış iş kurulmadı.

**PostgREST yanıtı varsayılan olarak 1000 satırda kesilir ve bunu bildirmez.**
İstek başarılı döner, eksik satırlar için hata çıkmaz. Yüz iki öğrencinin bin yirmi
ölçümü vardır; sayfalanmayan bir sorgu son iki öğrenciyi verisiz gösterip yanlış
puanlamıştı. Listeyle birlikte büyüyen her okuma `src/lib/paginate.ts` üzerinden
açıkça sayfalanmalıdır.

## Vercel yayınlama

1. GitHub reposunu Vercel'e aktarın, framework olarak Next.js seçin. Root dizin
   repo köküdür; build `npm run build`, install `npm ci`, Node sürümü 24.
2. Preview ortam değişkenlerini staging Supabase projesine, Production değerlerini
   production Supabase projesine bağlayın. İki ortamda da `APP_DATA_MODE=supabase`.
3. Supabase migration'larını önce staging'de uygulayın ve kontrol edin. CI migration
   uygulamaz ve production gizli anahtarı içermez.
4. CI başarılı olduktan ve canlı Auth / RLS kontrolü yapıldıktan sonra production'a
   aynı migration'ı uygulayıp yayını açın. Next.js public ortam değerleri build'de
   sabitlendiği için ayar değişikliğinde yeniden deploy edin.
5. Alan adını, TLS'yi, Supabase Site URL'yi ve yedekleme / geri yükleme sürecini doğrulayın.

## Testler ve doğrulama

`npm run check` lint, tip denetimi, 15 test ve production build çalıştırır.
RLS testleri PGlite içinde gerçek PostgreSQL SQL'ini ve migration'ı çalıştırır.
`auth.users`, roller ve `auth.uid()` testte taklit edilir; gerçek Supabase Auth,
PostgREST, cookie yaşam döngüsü ve barındırılan proje ayarları bu testin kapsamında
değildir. Bunlar staging üzerinde gerçek kullanıcılarla ayrıca doğrulanmalıdır.

Yerelde kontrol edilen HTTP davranışları: kurum modunda demo engeli, eksik ayarda
korumalı çalışma alanı yönlendirmesi, login hata durumu ve demo modunda eski pano.

## Sonraki aşama

- Veri kaynak sözleşmesi ve kurumun onayladığı örnek veri.
- CSV/Excel doğrulama, önizleme, tekrar yükleme güvenliği ve aktarım geçmişi.
- Dört ekranın React'e taşınması ve gerçek risk sonuçlarına bağlanması.
- Aksiyon sorumlusu / not / bitiş tarihi arayüzü; kullanıcı daveti ve parola sıfırlama.
- Risk motorunun sunucu işi olarak bağlanması ve hesaplama sürümü takibi.
- Gerçek Supabase oturumlarıyla uçtan uca test; parola / oturum / hesap iptali senaryoları.
- İzleme, alarmlar, yedekten geri yükleme provası, veri saklama ve silme prosedürü.

## Resmi kaynaklar

- [Next.js yayınlama](https://nextjs.org/docs/app/getting-started/deploying)
- [Supabase sunucu oturumu](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
