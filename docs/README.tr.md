# Turing Machine Workbench

**Deterministik, tek bantlı Turing makineleri için görsel simülatör ve editör.**

Durumları sürükleyerek bir diyagram oluşturabilir, durumları oklarla bağlayarak geçiş kuralları ekleyebilir ve verdiğiniz girdi üzerinde makinenin çalışmasını adım adım inceleyebilirsiniz. Tüm işlemler tarayıcıda çalışır; üyelik veya sunucu gerekmez.

[English README](../README.md)

## Özellikler

- **Görsel durum diyagramı:** Durum ekleme, isimlendirme, taşıma ve silme; başlangıç, kabul ve ret durumları tanımlama; oklarla geçiş kuralları kurma.
- **Bant simülasyonu:** İki yönde sonsuz bant, etkin hücrenin altında okuma/yazma kafası, anlık durum, adım sayısı ve geçmiş geçişler. Son 2.000 adım içinde geri sarma.
- **Hazır örnekler:** İkili ve tekli sayı artırıcılar, ikili palindrom, `0ⁿ1ⁿ` tanıyıcı, eşit sayıda sıfır/bir, çift parite ve iki durumlu Busy Beaver.
- **Kaydetme:** Tarayıcıda yerel saklama ile JSON içe/dışa aktarma.
- **İkili kodlama:** Makinenin `⟨M⟩` kodunu veya bir girdiyle beraber `⟨M,w⟩` temsilini üretme ve geri çözme.
- **İki dil:** Türkçe ve İngilizce arayüz.

## Yerel çalıştırma

Bağımlılık ve derleme aşaması yoktur. Proje klasöründe statik HTTP sunucusu başlatın:

```bash
python3 -m http.server 8000
```

Ardından `http://localhost:8000` adresine gidin. Otomatik testler için Node.js 20+ gerekir:

```bash
npm test
npm run check
```

## Makine tanımlama

Bir geçişte **kaynak durum, okunan sembol, yazılan sembol, yön ve hedef durum** bulunur.

```text
δ(scan, 1) = (scan, 1, R)
δ(scan, □) = (accept, 1, S)
```

`□` boş bant sembolüdür. Hareketler `L` (sol), `R` (sağ) ve `S` (yerinde kal) olarak tanımlanır. Her `(durum, okunan sembol)` çifti için **en fazla bir** kural bulunabilir. Kabul veya ret durumuna ulaşılınca çalışma biter. Normal bir durumda uygulanacak kural yoksa ayrı bir **Eşleşen kural yok** sonucuyla durur; bu, açıkça tanımlanmış ret durumu değildir.

Diyagramda bir geçiş çizmek için **Durumları bağla** seçeneğine basıp kaynak ve hedef durumlara tıklayın, ardından kural alanlarını doldurun. Yeni durum eklemek için diyagramda boş bir yere çift tıklayabilirsiniz.

## Makinenin ikili gösterimi

**TM01** bu projeye özgü, sürümlenmiş, öneksiz ve geri çözülebilir bir kodlama biçimidir. Durumları, başlangıç durumunu, bant alfabesini ve geçişleri içerir. `⟨M,w⟩` kodlamasında, makinenin kodunun uzunluğu ve girdi de kodlanır.

Turing makineleri için herkesin kullandığı tek bir ikili gösterim standardı bulunmaz. `A_TM` gibi bir dili tanıyan evrensel makine, verilen kodun **aynı biçimini** çözebilmelidir. Ayrıntılar için [TM01 kodlama belirtimi](./encoding.md) sayfasına bakın.

## Katkı

Hata bildirimleri ve katkı istekleri kabul edilir. Proje, **deterministik tek bantlı** Turing makinesi modeline odaklanır. Yeni davranışlar için olabildiğince simülasyon çekirdeği kullanılır ve test eklenir. Arayüz harici JavaScript kütüphaneleri, CDN yazı tipleri veya analitik servisleri gerektirmez.