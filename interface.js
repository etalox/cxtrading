window.ICONS = {
    search: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/search.png',
    loader: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/loader.png',
    trendingUp: './svg/up.svg',
    trendingDown: './svg/up.svg',
    wifiOff: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/wifiOff.png',
    activityWin: './svg/up.svg',
    activityLoss: './svg/up.svg',
    activityNeutral: 'https://raw.githubusercontent.com/etalox/cxtrading/main/png/neutral.png',
};

window.MATERIALS = ["PLATA", "BRONZE", "IRON", "COBRE", "LITIUM", "ORE", "RODIUM", "X"];
window.ADJECTIVES = ["AIR", "01", "02", "03", "04", "05", "10", "15", "20", "25", "50", "60", "70", "80", "90", "99", "ALPHA", "BETA", "GAMMA", "DELTA", "OMEGA"];

window.sigmoid = (x) => 1 / (1 + Math.exp(-x));
