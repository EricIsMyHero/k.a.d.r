# K.A.D.R

Azərbaycan dilində şəxsi video arxivi. Server tərəfi və hesab sistemi tələb etmir.

## İşə salmaq

Bu qovluqda `python -m http.server 8000` əmrini işlədin, sonra http://localhost:8000 ünvanını açın. JSON yüklənməsi üçün HTML-i birbaşa fayl kimi açmayın. Statik hostinqdə bütün qovluğu olduğu kimi yerləşdirin.

## Video əlavə etmək

Videonu mövcud R2 bucket-ə yükləyin, sonra `data/videos.json` siyahısına qeyd əlavə edin:

```json
{
  "id": "local-24",
  "title": "Yeni video",
  "file": "qovluq/video.mp4",
  "tags": ["film-edit"],
  "uploadDate": "2026-10-25",
  "poster": "qovluq/sekil.jpg"
}
```

`id` unikal olmalıdır. `poster` istəyə bağlıdır; olmadıqda kartda qrafik örtük göstərilir. `file` və `poster` nisbi yol və ya tam HTTP/HTTPS ünvanı ola bilər. Başlıqlar və etiketlər HTML kimi işlədilmir.

Video sayı göstəricisinə toxunaraq mənbə ayarlarını açın. Kompüterdə yan menyuda da ayar düyməsi var. Mövcud R2 ünvanı ilkin dəyərdir. Öz domeninizi istifadə edirsinizsə, düzgün video MIME tipi, HTTPS və byte-range sorğularını dəstəkləyən hostinq seçin.

## İdarəetmə

- Videoya toxunmaq və ya boşluq düyməsi: oynat/dayandır.
- Axında yuxarı/aşağı oxlar: əvvəlki/növbəti video.
- Böyük pleyerdə sağ/sol oxlar: açıldığı nəticələrdə keçid. Escape: bağla.
- Ürək: sevimlilər. Paylaşma: video üçün `?video=ID` keçidi.
- İzləmə tarixçəsinə qeyd video ən az 3 saniyə və ya müddətinin yarısı izlənəndən sonra əlavə olunur.

Sevimlilər, tarixçə, səs və R2 ayarları yalnız cari brauzerdə saxlanır; cihazlararası sinxronlaşdırma yoxdur. R2 videoları ictimai mənbədədir; bu interfeys girişlə qorunma yaratmır. Mövcud `kadr_favorites`, `kadr_watched`, `kadr_r2_url` açarları qorunur. Təkrarlanan ikinci `local-16` identifikatoru `local-17` ilə düzəldilib; əvvəlki status birinci videoda saxlanır.

## Yoxlama

JavaScript sintaksisi, 23 qeydin unikal ID-ləri və məlumat yoxlamasının normal/səhv məlumat ssenariləri yoxlanılıb. Mühitin brauzer və lokal server icazə məhdudiyyətləri səbəbindən avtomatlaşdırılmış vizual və real R2 oynatma yoxlaması tamamlanmayıb. Yayımlamazdan əvvəl mobil Safari, Android Chrome və masaüstü brauzerdə real videolarla yoxlayın.
