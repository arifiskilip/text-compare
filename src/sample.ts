export const sampleOriginal = `{
  "proje": "Belediye Portalı",
  "surum": "2.4.0",
  "ortam": "test",

  "sunucu": {
    "adres": "https://test.belediye.gov.tr",
    "port": 443,
    "zamanAsimi": 30000,
    "yenidenDeneme": 2
  },

  "veritabani": {
    "sunucu": "localhost",
    "ad": "belediye_test",
    "baglantiHavuzu": 10,
    "sorguGunlugu": true
  },

  "ozellikler": {
    "eOdeme": true,
    "smsBildirimi": false,
    "belgeDogrulama": true,
    "eskiRaporlar": true
  },

  "guvenlik": {
    "oturumSuresi": 30,
    "ikiAsamaliGiris": false,
    "izinVerilenAdresler": ["localhost"]
  },

  "gunlukleme": {
    "seviye": "debug",
    "dosyayaYaz": true,
    "saklamaGunu": 7
  },

  "bildirimler": {
    "eposta": true,
    "gonderen": "test@belediye.gov.tr"
  }
}
`;
export const sampleModified = `{
  "proje": "Belediye Portalı",
  "surum": "2.5.0",
  "ortam": "canli",

  "sunucu": {
    "adres": "https://portal.belediye.gov.tr",
    "port": 443,
    "zamanAsimi": 60000,
    "yenidenDeneme": 3
  },

  "veritabani": {
    "sunucu": "db.belediye.local",
    "ad": "belediye",
    "baglantiHavuzu": 25,
    "sorguGunlugu": false
  },

  "ozellikler": {
    "eOdeme": true,
    "smsBildirimi": true,
    "belgeDogrulama": true,
    "yeniRaporlar": true,
    "mobilBildirim": true
  },

  "guvenlik": {
    "oturumSuresi": 15,
    "ikiAsamaliGiris": true,
    "izinVerilenAdresler": ["portal.belediye.gov.tr"]
  },

  "gunlukleme": {
    "seviye": "warning",
    "dosyayaYaz": true,
    "saklamaGunu": 30
  },

  "bildirimler": {
    "eposta": true,
    "gonderen": "bilgi@belediye.gov.tr"
  }
}
`;
