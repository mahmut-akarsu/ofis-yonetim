# Ofis Yönetim

Ofisteki Windows bilgisayarları tek merkezden yönetmek için yerel web uygulaması. PC listesi, hızlı işlemler (disk durumu, çalışan programlar vb.), dosya gönderme ve özel PowerShell komutları desteklenir.

**Visual Studio veya Rust gerekmez** — sadece Node.js yeterlidir.

## Gereksinimler

### Yönetim bilgisayarı (bu uygulamayı çalıştırdığınız PC)

- [Node.js](https://nodejs.org/) 20 veya üzeri
- Windows 10/11
- [Tailscale](https://tailscale.com/) (tüm PC'ler aynı ağda olmalı)
- PowerShell (Windows ile birlikte gelir)

### Hedef bilgisayarlar (yönetilecek 15 PC)

Her birinde:

1. **Tailscale** kurulu ve yönetim PC ile aynı Tailnet'te
2. **WinRM** açık (uzaktan komut için)

Yönetici PowerShell ile hedef PC'de bir kez:

```powershell
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
```

> Güvenlik için production ortamında `TrustedHosts` değerini sadece Tailscale IP aralığınızla sınırlayın.

## Kurulum

```bash
cd ofis-yonetim
npm install
```

## Çalıştırma

```bash
npm run start
```

Bu komut:

1. Yerel API'yi başlatır → `http://127.0.0.1:9876`
2. Arayüzü başlatır → `http://localhost:1420`
3. Varsayılan tarayıcıda uygulamayı açar

Uygulamayı kapatmak için terminalde `Ctrl+C` kullanın.

### Diğer komutlar

| Komut | Açıklama |
|-------|----------|
| `npm run server` | Sadece arka plan API'si |
| `npm run dev` | Sadece arayüz (geliştirme) |
| `npm run build` | Production build (dist/) |
| `npm run typecheck` | TypeScript kontrolü |

## İlk kullanım

1. `npm run start` ile uygulamayı açın
2. Sol panelden **+** ile PC ekleyin
   - **Ad:** Örn. `Muhasebe-1`
   - **Tailscale IP:** Örn. `100.x.x.x` (Tailscale uygulamasından bakın)
3. PC'leri seçin (checkbox)
4. Orta panelden işlem yapın:
   - **Hızlı İşlemler** — Butona tıklayın, komut otomatik çalışır
   - **Dosya Gönder** — Dosya seçip hedef klasöre gönderin
   - **Özel Komut** — İleri düzey PowerShell komutu yazın
5. Sonuçlar sağ panelde görünür

## Bağlantı kontrolü

Sol paneldeki **yenile** ikonuna tıklayarak seçili PC'lerin erişilebilir olup olmadığını kontrol edebilirsiniz (Online / Offline).

## Sorun giderme

### "Yerel API'ye bağlanılamadı"

`npm run start` ile hem API hem arayüzün birlikte açıldığından emin olun. Port `9876` başka bir uygulama tarafından kullanılıyor olabilir.

### Komut hatası / WinRM hatası

- Hedef PC'de WinRM açık mı? (`Enable-PSRemoting -Force`)
- Tailscale IP doğru mu?
- Yönetim PC'den hedefe ping atılabiliyor mu?

```powershell
Test-Connection 100.x.x.x
Invoke-Command -ComputerName 100.x.x.x -ScriptBlock { hostname }
```

### Dosya gönderilemiyor

- Hedef klasörün uzak PC'de var olduğundan emin olun (örn. `C:\Temp`)
- WinRM oturumu ve kopyalama izinleri gerekebilir

## Mimari

```
Tarayıcı (React UI)  →  localhost:1420
        ↓
Node.js API          →  localhost:9876
        ↓
PowerShell / WinRM   →  Tailscale ağı üzerinden hedef PC'ler
```

PC listesi şu dosyada saklanır:

```
%USERPROFILE%\.ofis-yonetim\managed_pcs.json
```

## Lisans

MIT
