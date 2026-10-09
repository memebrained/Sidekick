const TOKEN = window.SI_TOKEN_CONFIG;
const marks = {pumpfun:'P',defined:'D',axiom:'A',terminal:'T',gmgn:'G',fomo:'F',bananagun:'B',photon:'P',telemetry:'T',trojan:'T'};
const PERIOD_LABELS = {m1:'1m',m5:'5m',h1:'1h',h24:'24h'};
const CANDLE_REQUESTS = {
  m1:{timeframe:'minute',aggregate:1,limit:90},
  m5:{timeframe:'minute',aggregate:5,limit:90},
  h1:{timeframe:'hour',aggregate:1,limit:72},
  h24:{timeframe:'day',aggregate:1,limit:30}
};
const DEFAULTS = {siEnabled:true,siTextEffects:true,siMascotReactions:true,siPinataEnabled:true,siConfettiEnabled:true,siLifetime:0,siTheme:'dark'};

const elements = {
  price:document.getElementById('price'),change:document.getElementById('change'),marketCap:document.getElementById('marketCap'),
  liquidity:document.getElementById('liquidity'),volume:document.getElementById('volume'),trades:document.getElementById('trades'),
  flowText:document.getElementById('flowText'),buyFlow:document.getElementById('buyFlow'),updated:document.getElementById('updated'),
  copyLabel:document.getElementById('copyLabel'),status:document.getElementById('status'),chartLoading:document.getElementById('chartLoading'),
  volumeLabel:document.getElementById('volumeLabel'),tradesLabel:document.getElementById('tradesLabel'),flowLabel:document.getElementById('flowLabel')
};
const periods = [...document.querySelectorAll('.period')];
const panelSettingsButton = document.getElementById('panelSettingsButton');
const marketView = document.getElementById('marketView');
const settingsView = document.getElementById('settingsView');
const panelMasterToggle = document.getElementById('panelMasterToggle');
const panelLightMode = document.getElementById('panelLightMode');
const panelControls = {
  siTextEffects:document.getElementById('panelTextEffects'),
  siMascotReactions:document.getElementById('panelMascotReactions'),
  siPinataEnabled:document.getElementById('panelPinataEnabled'),
  siConfettiEnabled:document.getElementById('panelConfettiEnabled')
};
let selectedPeriod = 'h24';
let latestPair = null;
let chart = null;
let candleSeries = null;
let latestCandleMetrics = null;
const candleCache = new Map();

function animateText(element,value) {
  if (element.textContent === value) return;
  element.textContent = value;
  element.classList.remove('metric-pop');
  void element.offsetWidth;
  element.classList.add('metric-pop');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  panelLightMode.checked = theme === 'light';
  if (chart) {
    const light = theme === 'light';
    chart.applyOptions({
      layout:{background:{type:LightweightCharts.ColorType.Solid,color:light ? '#ffffff' : '#0f1611'},textColor:light ? '#637169' : '#829087'},
      grid:{vertLines:{color:light ? '#e5ebe6' : '#18221b'},horzLines:{color:light ? '#e5ebe6' : '#18221b'}},
      rightPriceScale:{borderColor:light ? '#ccd6ce' : '#263128'},
      timeScale:{borderColor:light ? '#ccd6ce' : '#263128'}
    });
  }
}

function compactUsd(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(value) : '—';
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:value < .001 ? 8 : 5})}`;
}

function renderPlatforms() {
  const list = document.getElementById('platformList');
  for (const link of TOKEN.links) {
    const destination = link.referralUrl || link.url;
    const anchor = document.createElement(destination ? 'a' : 'div');
    anchor.className = `platform-card${destination ? '' : ' is-pending'}`;
    if (destination) {
      anchor.href = destination;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    } else {
      anchor.setAttribute('aria-disabled','true');
      anchor.title = `${link.label} link coming soon`;
    }
    anchor.style.setProperty('--brand',link.color);
    const icon = document.createElement('span');
    icon.className = 'platform-icon';
    if (link.icon) {
      const logo = document.createElement('img');
      logo.src = chrome.runtime.getURL(link.icon);
      logo.alt = '';
      logo.addEventListener('error',() => { logo.remove(); icon.textContent = marks[link.id] || link.label[0]; });
      icon.appendChild(logo);
    } else {
      icon.textContent = marks[link.id] || link.label[0];
    }
    const copy = document.createElement('span');
    copy.className = 'platform-copy';
    const label = document.createElement('strong');
    label.textContent = link.label;
    copy.appendChild(label);
    anchor.append(icon,copy);
    if (destination) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '↗';
      anchor.appendChild(arrow);
    }
    list.appendChild(anchor);
  }
}

function initChart() {
  const container = document.getElementById('candleChart');
  chart = LightweightCharts.createChart(container,{
    width:Math.max(container.clientWidth,280),height:178,
    layout:{background:{type:LightweightCharts.ColorType.Solid,color:'#0f1611'},textColor:'#829087',attributionLogo:false},
    grid:{vertLines:{color:'#18221b'},horzLines:{color:'#18221b'}},
    rightPriceScale:{borderColor:'#263128',scaleMargins:{top:.12,bottom:.12}},
    timeScale:{borderColor:'#263128',timeVisible:true,secondsVisible:false},
    crosshair:{mode:LightweightCharts.CrosshairMode.Normal}
  });
  const candleOptions = {
    upColor:'#45df83',downColor:'#ff6575',borderVisible:false,wickUpColor:'#45df83',wickDownColor:'#ff6575',
    priceFormat:{type:'price',precision:8,minMove:.00000001}
  };
  candleSeries = typeof chart.addSeries === 'function'
    ? chart.addSeries(LightweightCharts.CandlestickSeries,candleOptions)
    : chart.addCandlestickSeries(candleOptions);
  new ResizeObserver(entries => {
    const width = Math.floor(entries[0]?.contentRect.width || 0);
    if (width > 0) chart.applyOptions({width});
  }).observe(container);
}

function renderChange() {
  const change = latestCandleMetrics?.period === selectedPeriod
    ? latestCandleMetrics.change
    : Number(latestPair?.priceChange?.[selectedPeriod]);
  if (!Number.isFinite(change)) {
    elements.change.className = 'change neutral';
    animateText(elements.change,`— ${PERIOD_LABELS[selectedPeriod]}`);
    return;
  }
  elements.change.className = `change ${change >= 0 ? 'up' : 'down'}`;
  animateText(elements.change,`${change >= 0 ? '+' : ''}${change.toFixed(2)}% ${PERIOD_LABELS[selectedPeriod]}`);
}

async function selectPeriod(period) {
  selectedPeriod = period;
  for (const button of periods) button.setAttribute('aria-pressed',String(button.dataset.period === period));
  if (latestPair) renderPair(latestPair);
  await updateCandles();
}

function renderPair(pair) {
  const price = Number(pair.priceUsd);
  const periodTxns = pair.txns?.[selectedPeriod];
  const buys = Number(periodTxns?.buys) || 0;
  const sells = Number(periodTxns?.sells) || 0;
  const total = buys + sells;
  const buyPercent = total ? Math.round((buys / total) * 100) : 50;
  const periodName = PERIOD_LABELS[selectedPeriod].toUpperCase();
  animateText(elements.marketCap,compactUsd(Number(pair.marketCap ?? pair.fdv)));
  animateText(elements.price,formatPrice(price));
  renderChange();
  animateText(elements.liquidity,compactUsd(Number(pair.liquidity?.usd)));
  const candleVolume = latestCandleMetrics?.period === selectedPeriod ? latestCandleMetrics.volume : NaN;
  animateText(elements.volume,compactUsd(Number.isFinite(candleVolume) ? candleVolume : Number(pair.volume?.[selectedPeriod])));
  animateText(elements.trades,total ? total.toLocaleString() : '—');
  animateText(elements.flowText,total ? `${buyPercent}% buys · ${100 - buyPercent}% sells` : 'No data');
  elements.volumeLabel.textContent = `${periodName} VOLUME`;
  elements.tradesLabel.textContent = `${periodName} TRADES`;
  elements.flowLabel.textContent = `${periodName} ORDER FLOW`;
  elements.buyFlow.style.width = `${buyPercent}%`;
  elements.updated.textContent = `Updated ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
}

async function updateCandles(force = false) {
  const period = selectedPeriod;
  const spec = CANDLE_REQUESTS[period];
  const cached = candleCache.get(period);
  if (!force && cached && Date.now() - cached.fetchedAt < 55000) {
    displayCandles(period,cached.candles);
    return;
  }
  elements.chartLoading.hidden = false;
  elements.chartLoading.textContent = 'Loading candles…';
  try {
    const params = new URLSearchParams({aggregate:String(spec.aggregate),limit:String(spec.limit),currency:'usd',token:'base'});
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${TOKEN.candlePoolAddress}/ohlcv/${spec.timeframe}?${params}`;
    const response = await fetch(url,{headers:{accept:'application/json;version=20230302'},cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const candles = (payload.data?.attributes?.ohlcv_list || [])
      .map(([time,open,high,low,close,volume]) => ({time:Number(time),open:Number(open),high:Number(high),low:Number(low),close:Number(close),volume:Number(volume)}))
      .filter(candle => Number.isFinite(candle.time) && Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low) && Number.isFinite(candle.close))
      .sort((a,b) => a.time - b.time);
    if (!candles.length) throw new Error('No candles returned');
    candleCache.set(period,{candles,fetchedAt:Date.now()});
    if (period === selectedPeriod) displayCandles(period,candles);
  } catch (error) {
    if (period === selectedPeriod) {
      elements.chartLoading.hidden = false;
      elements.chartLoading.textContent = 'Candles temporarily unavailable';
    }
    console.warn('Could not load candle data:',error);
  }
}

function displayCandles(period,candles) {
  if (period !== selectedPeriod || !candleSeries) return;
  candleSeries.setData(candles.map(({time,open,high,low,close}) => ({time,open,high,low,close})));
  chart.timeScale().fitContent();
  const current = candles.at(-1);
  latestCandleMetrics = {
    period,
    change:current.open ? ((current.close - current.open) / current.open) * 100 : NaN,
    volume:Number(current.volume)
  };
  elements.chartLoading.hidden = true;
  if (latestPair) renderPair(latestPair);
}

function setSettingsView(open) {
  marketView.hidden = open;
  settingsView.hidden = !open;
  panelSettingsButton.textContent = open ? '←' : '⚙';
  panelSettingsButton.setAttribute('aria-expanded',String(open));
  panelSettingsButton.setAttribute('aria-label',open ? 'Back to market' : 'Open settings');
}

function renderMaster(on) {
  panelMasterToggle.textContent = on ? 'SÍ MODE: ON ✓' : 'SÍ MODE: OFF';
  panelMasterToggle.dataset.on = String(on);
  panelMasterToggle.setAttribute('aria-pressed',String(on));
}

function notifyPage(settings) {
  chrome.tabs.query({active:true,currentWindow:true},tabs => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id,{type:'SI_SET_SETTINGS',settings},() => { void chrome.runtime.lastError; });
  });
}

async function updateMarket() {
  try {
    const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/${TOKEN.chain}/${TOKEN.address}`,{cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pairs = await response.json();
    latestPair = pairs.filter(item => item.baseToken?.address === TOKEN.address && Number(item.priceUsd)).sort((a,b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (!latestPair) throw new Error('No active market found');
    renderPair(latestPair);
  } catch (error) {
    elements.updated.textContent = 'Market data unavailable';
    elements.status.textContent = 'Could not refresh market data';
    console.warn('Could not load SÍ market data:',error);
  }
}

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(TOKEN.address);
    elements.copyLabel.textContent = 'COPIED ✓';
    elements.status.textContent = 'Contract address copied';
  } catch {
    elements.copyLabel.textContent = 'FAILED';
  }
  setTimeout(() => { elements.copyLabel.textContent = 'COPY'; },1400);
}

document.getElementById('addressText').textContent = `${TOKEN.address.slice(0,4)}…${TOKEN.address.slice(-4)}`;
document.getElementById('copyAddress').addEventListener('click',copyAddress);
for (const button of periods) button.addEventListener('click',() => selectPeriod(button.dataset.period));
panelSettingsButton.addEventListener('click',() => setSettingsView(settingsView.hidden));
panelLightMode.addEventListener('change',() => chrome.storage.local.set({siTheme:panelLightMode.checked ? 'light' : 'dark'}));
panelMasterToggle.addEventListener('click',() => {
  const siEnabled = panelMasterToggle.dataset.on !== 'true';
  chrome.storage.local.set({siEnabled},() => { renderMaster(siEnabled); notifyPage({siEnabled}); });
});
for (const [key,input] of Object.entries(panelControls)) {
  input.addEventListener('change',() => chrome.storage.local.set({[key]:input.checked},() => notifyPage({[key]:input.checked})));
}
chrome.storage.local.get(DEFAULTS,data => {
  applyTheme(data.siTheme);
  renderMaster(data.siEnabled);
  document.getElementById('panelLifetime').textContent = data.siLifetime.toLocaleString();
  for (const [key,input] of Object.entries(panelControls)) input.checked = data[key];
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area !== 'local') return;
  if (changes.siTheme) applyTheme(changes.siTheme.newValue);
  if (changes.siEnabled) renderMaster(changes.siEnabled.newValue);
  if (changes.siLifetime) document.getElementById('panelLifetime').textContent = changes.siLifetime.newValue.toLocaleString();
  for (const [key,input] of Object.entries(panelControls)) if (changes[key]) input.checked = changes[key].newValue;
});
renderPlatforms();
initChart();
updateMarket();
updateCandles();
setInterval(updateMarket,30000);
setInterval(() => updateCandles(true),60000);
