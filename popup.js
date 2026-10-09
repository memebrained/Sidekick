const TOKEN = window.SI_TOKEN_CONFIG;
const DEFAULTS = {siEnabled:true,siTextEffects:true,siMascotReactions:true,siPinataEnabled:true,siConfettiEnabled:true,siLifetime:0,siTheme:'dark'};
const PERIOD_LABELS = {m1:'1m',m5:'5m',h1:'1h',h24:'24h'};
const CANDLE_REQUESTS = {m1:['minute',1],m5:['minute',5],h1:['hour',1],h24:['day',1]};

const settingsButton = document.getElementById('settingsButton');
const settingsPanel = document.getElementById('settingsPanel');
const toggle = document.getElementById('toggle');
const lifetime = document.getElementById('lifetime');
const marketCap = document.getElementById('marketCap');
const priceChange = document.getElementById('priceChange');
const periods = [...document.querySelectorAll('.period')];
const contractAddress = document.getElementById('contractAddress');
const caAction = document.getElementById('caAction');
const copyStatus = document.getElementById('copyStatus');
const openPanel = document.getElementById('openPanel');
const lightMode = document.getElementById('lightMode');
const controls = {
  siTextEffects:document.getElementById('textEffects'),
  siMascotReactions:document.getElementById('mascotReactions'),
  siPinataEnabled:document.getElementById('pinataEnabled'),
  siConfettiEnabled:document.getElementById('confettiEnabled')
};
let selectedPeriod = 'h24';
let latestPair = null;
let candleChange = null;
const candleCache = new Map();

async function activateCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) return false;
    const [{result:alreadyActive} = {}] = await chrome.scripting.executeScript({
      target:{tabId:tab.id},
      func:() => Boolean(window.__siMascotV03)
    });
    if (!alreadyActive) {
      await chrome.scripting.insertCSS({target:{tabId:tab.id},files:['content.css']});
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    }
    return true;
  } catch (error) {
    console.warn('SIdekick could not activate on this page:',error);
    return false;
  }
}

function animateText(element,value) {
  if (element.textContent === value) return;
  element.textContent = value;
  element.classList.remove('metric-pop');
  void element.offsetWidth;
  element.classList.add('metric-pop');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  lightMode.checked = theme === 'light';
}

function renderPlatforms() {
  const container = document.getElementById('platforms');
  const marks = {pumpfun:'P',defined:'D',axiom:'A',terminal:'T',gmgn:'G',fomo:'F',bananagun:'B',photon:'P',telemetry:'T',trojan:'T'};
  for (const link of TOKEN.links) {
    const destination = link.referralUrl || link.url;
    const anchor = document.createElement(destination ? 'a' : 'div');
    anchor.className = `platform${destination ? '' : ' is-pending'}`;
    if (destination) {
      anchor.href = destination;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    } else {
      anchor.setAttribute('aria-disabled','true');
    }
    anchor.style.setProperty('--platform',link.color);
    anchor.setAttribute('aria-label',`${link.label}: ${link.action}`);
    const mark = document.createElement('span');
    mark.className = 'platform-mark';
    if (link.icon) {
      const logo = document.createElement('img');
      logo.src = chrome.runtime.getURL(link.icon);
      logo.alt = '';
      logo.addEventListener('error',() => { logo.remove(); mark.textContent = marks[link.id] || link.label.slice(0,1); });
      mark.appendChild(logo);
    } else {
      mark.textContent = marks[link.id] || link.label.slice(0,1);
    }
    anchor.appendChild(mark);
    container.appendChild(anchor);
  }
}

function compactUsd(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(value);
}

function renderChange() {
  const change = candleChange?.period === selectedPeriod ? candleChange.value : Number(latestPair?.priceChange?.[selectedPeriod]);
  if (!Number.isFinite(change)) {
    priceChange.className = 'change neutral';
    animateText(priceChange,`— ${PERIOD_LABELS[selectedPeriod]}`);
    return;
  }
  priceChange.className = `change ${change >= 0 ? 'up' : 'down'}`;
  animateText(priceChange,`${change >= 0 ? '+' : ''}${change.toFixed(2)}% ${PERIOD_LABELS[selectedPeriod]}`);
}

async function selectPeriod(period) {
  selectedPeriod = period;
  for (const button of periods) button.setAttribute('aria-pressed', String(button.dataset.period === period));
  renderChange();
  await updateCandleChange();
}

async function updateCandleChange(force = false) {
  const period = selectedPeriod;
  const cached = candleCache.get(period);
  if (!force && cached && Date.now() - cached.fetchedAt < 55000) {
    candleChange = {period,value:cached.value};
    renderChange();
    return;
  }
  try {
    const [timeframe,aggregate] = CANDLE_REQUESTS[period];
    const params = new URLSearchParams({aggregate:String(aggregate),limit:'1',currency:'usd',token:'base'});
    const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${TOKEN.candlePoolAddress}/ohlcv/${timeframe}?${params}`,{headers:{accept:'application/json;version=20230302'},cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const candle = (await response.json()).data?.attributes?.ohlcv_list?.[0];
    if (!candle) throw new Error('No candle returned');
    const open = Number(candle[1]), close = Number(candle[4]);
    const value = open ? ((close - open) / open) * 100 : NaN;
    candleCache.set(period,{value,fetchedAt:Date.now()});
    if (period === selectedPeriod) {
      candleChange = {period,value};
      renderChange();
    }
  } catch (error) {
    console.warn('Could not load SÍ candle change:',error);
  }
}

async function updateMarket() {
  try {
    const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/${TOKEN.chain}/${TOKEN.address}`,{cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pairs = await response.json();
    latestPair = pairs
      .filter(pair => pair.baseToken?.address === TOKEN.address)
      .sort((a,b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (!latestPair) throw new Error('No active market found');
    animateText(marketCap,compactUsd(Number(latestPair.marketCap ?? latestPair.fdv)));
    renderChange();
  } catch (error) {
    marketCap.textContent = 'Unavailable';
    priceChange.textContent = 'Retrying shortly';
    priceChange.className = 'change neutral';
    console.warn('Could not load SÍ market data:', error);
  }
}

async function copyTokenAddress() {
  try {
    await navigator.clipboard.writeText(TOKEN.address);
    caAction.textContent = 'COPIED ✓';
    copyStatus.textContent = 'Contract address copied';
    setTimeout(() => { caAction.textContent = 'COPY'; }, 1400);
  } catch {
    caAction.textContent = 'FAILED';
    copyStatus.textContent = 'Could not copy contract address';
    setTimeout(() => { caAction.textContent = 'COPY'; }, 1400);
  }
}

function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsButton.setAttribute('aria-expanded', String(open));
  settingsButton.setAttribute('aria-label', open ? 'Close settings' : 'Open settings');
}

function renderMaster(on) {
  toggle.textContent = on ? 'SÍ MODE: ON ✓' : 'SÍ MODE: OFF';
  toggle.dataset.on = String(on);
  toggle.setAttribute('aria-pressed', String(on));
}

function notifyPage(settings) {
  chrome.tabs.query({active:true,currentWindow:true}, tabs => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id,{type:'SI_SET_SETTINGS',settings},() => { void chrome.runtime.lastError; });
  });
}

settingsButton.addEventListener('click', () => setSettingsOpen(settingsPanel.hidden));
openPanel.addEventListener('click', async () => {
  const currentWindow = await chrome.windows.getCurrent();
  await chrome.sidePanel.open({windowId:currentWindow.id});
  window.close();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !settingsPanel.hidden) { setSettingsOpen(false); settingsButton.focus(); }
});
contractAddress.addEventListener('click', copyTokenAddress);
for (const button of periods) button.addEventListener('click', () => selectPeriod(button.dataset.period));

activateCurrentTab();
renderPlatforms();
updateMarket();
updateCandleChange();
setInterval(updateMarket,30000);
setInterval(() => updateCandleChange(true),60000);
chrome.storage.local.get(DEFAULTS,data => {
  applyTheme(data.siTheme);
  renderMaster(data.siEnabled);
  lifetime.textContent = data.siLifetime.toLocaleString();
  for (const [key,input] of Object.entries(controls)) input.checked = data[key];
});
lightMode.addEventListener('change',() => chrome.storage.local.set({siTheme:lightMode.checked ? 'light' : 'dark'}));
toggle.addEventListener('click',() => {
  const siEnabled = toggle.dataset.on !== 'true';
  chrome.storage.local.set({siEnabled},() => { renderMaster(siEnabled); notifyPage({siEnabled}); });
});
for (const [key,input] of Object.entries(controls)) {
  input.addEventListener('change',() => {
    const settings = {[key]:input.checked};
    chrome.storage.local.set(settings,() => notifyPage(settings));
  });
}
chrome.storage.onChanged.addListener((changes,area) => {
  if (area !== 'local') return;
  if (changes.siLifetime) lifetime.textContent = changes.siLifetime.newValue.toLocaleString();
  if (changes.siEnabled) renderMaster(changes.siEnabled.newValue);
  if (changes.siTheme) applyTheme(changes.siTheme.newValue);
  for (const [key,input] of Object.entries(controls)) if (changes[key]) input.checked = changes[key].newValue;
});
