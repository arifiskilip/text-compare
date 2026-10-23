# Kıyas

Günlük metin karşılaştırmaları için Türkçe bir masaüstü tarayıcı uygulaması. İki metni yan yana düzenleyin, değişiklikler arasında klavyeyle ilerleyin ve çalışmanıza kaldığınız yerden devam edin.

## Windows'ta başlatma

1. Bilgisayarınızda **Node.js 22.12 LTS veya daha yeni** bir sürüm kurulu olsun.
2. Proje klasöründeki **Baslat.cmd** dosyasına çift tıklayın.
3. İlk açılışta bağımlılıklar kurulur ve uygulama derlenir. Bu hazırlık internet bağlantısı gerektirir. Sonraki açılışlarda hazırlanan yerel dosyalar kullanılır.
4. Tarayıcıda `http://127.0.0.1:4173` açılır. Komut penceresini açık tutun; kapatmanız sunucuyu durdurur.

Tarayıcı otomatik açılmazsa adresi kendiniz açın. Kıyas zaten çalışıyorsa başlatıcı mevcut uygulamayı açar. Başka bir uygulama 4173 portunu kullanıyorsa onu kapatıp tekrar deneyin; taslakların aynı tarayıcı adresinde kalması için başlatıcı port değiştirmez.

## Kullanım

- Sol tarafa ilk metni, sağ tarafa karşılaştıracağınız metni yapıştırın veya dosya yükleyin.
- Metni düzenlediğinizde karşılaştırma otomatik güncellenir.
- Önceki ve sonraki değişiklik düğmeleriyle ya da klavye kısayollarıyla değişikliklere ilerleyin.
- Fark görünümünde eklenen, silinen ve değiştirilen bölümleri renkleriyle takip edin.
- Bir değişiklik bloğunu iki yönde de diğer metne uygulayın; tüm metni bir kerede kopyalamanız gerekmez.
- En fazla 20 karşılaştırmayı adlandırıp oturum kitaplığına kaydedin ve daha sonra yeniden açın.
- Metinleri dosyaya indirin, değişiklikleri patch olarak dışa aktarın veya JSON yedeği alıp geri yükleyin.
- Çalışmanız tarayıcının yerel depolama alanında tutulur. Aynı tarayıcıda ve aynı adreste yeniden açın.

## Klavye kısayolları

Sol menü sol üstteki düğmeyle açılıp kapanır; masaüstündeki tercihin ve değişiklik listesinin açık/kapalı durumu hatırlanır. Menü başlangıçta kapalıdır. Odak modu yan menüyü, alt listeyi ve durum çubuğunu gizleyerek metin alanını büyütür; aynı düğmeyle normal düzene dönebilirsin.

| Kısayol | İşlev |
| --- | --- |
| `Alt + ↓` veya `F7` | Sonraki değişikliğe git |
| `Alt + ↑` veya `Shift + F7` | Önceki değişikliğe git |
| `↓` / `↑` | Editörde yazmıyorken değişiklikler arasında ilerle |
| `Ctrl + Alt + S` | Karşılaştırmayı oturum olarak kaydet |
| `Alt + N` | Yeni karşılaştırma başlat |
| `Ctrl + S` | Etkin metni dosyaya indir; seçim yoksa sağ metni kullanır |
| `Ctrl + F` | Odaktaki editörde ara |
| `Ctrl + Z` | Odaktaki editörde geri al |
| `Ctrl + B` | Sol menüyü aç / kapat |
| `Alt + Enter` | Odak modunu aç / kapat |

Editördeki normal ok tuşları metin imlecini hareket ettirir. Yazarken değişikliklere atlamak için `Alt` ile ok tuşlarını veya `F7` kısayollarını kullanın.

## Verileriniz

Karşılaştırma tarayıcınızda yapılır. Metinler bir sunucuya, bulut hesabına veya analiz servisine gönderilmez. Yerel sunucu yalnızca uygulama dosyalarını sunar ve sadece bu bilgisayardan erişilebilir. Kurulum tamamlandıktan sonra kullanım internet bağlantısı gerektirmez.

Yerel taslaklar şifrelenmez; tarayıcı profilinizin verilerinde saklanır. Tarayıcı verilerini silmek, farklı bir tarayıcı kullanmak veya adresi/portu değiştirmek kaydedilen çalışmaya erişimi etkiler. Saklamak istediğiniz önemli metinleri ayrıca dosyaya kaydedin.

Geçerli metinleri kaldırmak için ayarlardaki **Mevcut taslağı temizle** işlemini kullanın; işlem onay ister. Kaydedilen oturumları kitaplıktan ayrı ayrı silebilirsiniz. JSON yedekleri karşılaştırdığınız metinleri içerir; bunları metin dosyalarınız gibi saklayın.

## Geliştirme

```powershell
npm.cmd install
npm.cmd run dev
```

Geliştirme adresi `http://127.0.0.1:5173` olur. Günlük kullanım adresindeki taslaklar farklı origin olduğu için burada görünmez.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

Kaynak kodda değişiklik yaptıktan sonra `npm.cmd run build` ile `dist` klasörünü güncelleyin. Başlatıcı mevcut derlemeyi kullanır. Test veya otomasyon için `KIYAS_NO_OPEN=1` tarayıcının otomatik açılmasını kapatır. İhtiyaç halinde `PORT` ortam değişkeniyle başka bir port seçilebilir; bu adresin tarayıcı depolaması ayrı olur.

Teknolojiler: TypeScript, Vite, Monaco Editor ve `diff`. Yerel sunucu Node.js'in yerleşik HTTP modülünü kullanır.
