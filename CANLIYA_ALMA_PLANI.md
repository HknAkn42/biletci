# Canlıya Alma Planı (İç Kullanım / Admin)

## Sıra
1. Ön kontrol: dosya/syntax hataları ve kritik sayfa erişimi
2. Tam yedek: proje klasörü kopyası + uygulama içi JSON backup
3. Kullanıcı temizliği: gereksiz test hesaplarını pasif/sil
4. Son smoke test: login, satış, check-in, rapor, müşteri akışı
5. Canlı açılış: operasyon başlangıç saatinde tek admin ile aç
6. İlk gün izleme: loglar, borç akışı, yedek doğrulama

## Canlı Açılış Kriteri (GO)
- Hata kontrolünde kritik hata yok
- Yedek başarıyla alındı
- Satış + check-in + rapor akışı test edildi
- Admin hesabı ile giriş/çıkış sorunsuz

## Not
- Bu plan tek firma/tek organizasyon iç kullanımına göre hazırlanmıştır.
- Çoklu firma (SaaS tenant) geçişi sonraki fazdadır.
