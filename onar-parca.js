/**
 * BiletPro | Tek seferlik: oturma planı görselindeki bölünmüş (A/B) masaların listesi.
 * Sunucuda kaybolan BOŞ parçalar yöneticiye "Eksik parçaları ekle" ile geri eklenir (ana masaya ve satışlara dokunmaz).
 * Eklenince liste boşalır, uyarı çubuğu görünmez olur.
 */
(function (root) {
    'use strict';
    var RAW = '98A 99A 100A 61A 101A 80A 104A 24A 25B 28A 35A 36A 39A 30A 33A 34A 8A 12A 13A 14A 17A 60A 41A 42A 43A 71A 72A 73A 74A 75A 84A 85A 91A 92A 115A 118A 108A 109A 110A 111A';
    var LIST = RAW.split(' ').map(function (t) { var m = /^(\d+)([A-Z]+)$/.exec(t); return { root: m[1], suffix: m[2] }; });
    var api = {
        LIST: LIST,
        // Yalnızca bu plana uyan etkinlikte (listedeki ana masaların çoğu var) önerilir
        plan: function (ev, cap) {
            if (!root.MasaBol || !ev) return null;
            var p = root.MasaBol.planRestore(ev, LIST, cap || 2);
            var found = p.add.length + p.exists.length;
            return found >= 30 && p.add.length > 0 ? p : null;
        }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.ParcaOnar = api;
})(typeof window !== 'undefined' ? window : globalThis);
