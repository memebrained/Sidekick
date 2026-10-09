(() => {
  if (window.__siMascotV03 || !document.body) return;
  window.__siMascotV03 = true;

  const SKIP = 'script,style,noscript,textarea,input,select,option,code,pre,kbd,samp,svg,math,[contenteditable],.si-word,#si-mascot-host,#si-pinata-host,#si-confetti-host';
  const RE = /\bAI\b/g;
  const DEFAULTS = {siEnabled:true,siTextEffects:true,siMascotReactions:true,siPinataEnabled:true,siConfettiEnabled:true,siLifetime:0,siMascotPosition:null};
  let settings = {...DEFAULTS}, count = 0, dragging = false, queued = false, pos = null;
  let reactionTimeout = null, counterTimeout = null, milestoneTimeout = null;
  const pending = new Set();

  const host = document.createElement('div');
  host.id = 'si-mascot-host';
  host.innerHTML = `<div class="si-shell" title="Drag Señor Inteligente" role="group" aria-label="Señor Inteligente mascot and correction counter"><div class="si-alert" aria-hidden="true">¡SÍ!</div><img class="si-mascot" draggable="false" alt="Señor Inteligente mascot" src="${chrome.runtime.getURL('assets/mascot.png')}"><div class="si-counter" aria-live="polite">SÍ × <span class="si-count">0</span></div></div>`;
  const number = host.querySelector('.si-count');
  const counter = host.querySelector('.si-counter');
  const shell = host.querySelector('.si-shell');

  const pinataHost = document.createElement('div');
  pinataHost.id = 'si-pinata-host';
  pinataHost.innerHTML = `<div class="si-pendulum"><div class="si-rope" aria-hidden="true"></div><button class="si-pinata-button" type="button" title="Tap the piñata" aria-label="Tap the hanging piñata"><img class="si-pinata-image" draggable="false" alt=""><span class="si-pinata-fallback" aria-hidden="true">🪅</span></button></div>`;
  const pinata = pinataHost.querySelector('.si-pinata-button');
  const pendulum = pinataHost.querySelector('.si-pendulum');
  const pinataImage = pinataHost.querySelector('.si-pinata-image');
  pinataImage.addEventListener('load', () => {
    pinataHost.classList.remove('si-pinata-error');
    pinataHost.classList.add('si-pinata-loaded');
  });
  pinataImage.addEventListener('error', () => pinataHost.classList.add('si-pinata-error'));
  pinataImage.src = chrome.runtime.getURL('assets/pinata-v2.png');
  let pinataAngle = 0, pinataVelocity = 0, pinataFrame = 0;

  const confettiHost = document.createElement('div');
  confettiHost.id = 'si-confetti-host';
  confettiHost.setAttribute('aria-hidden', 'true');

  function positionMascot() {
    const w = host.offsetWidth || 116, h = host.offsetHeight || 144;
    if (!pos) pos = {x: innerWidth - w - 16, y: innerHeight - h - 16};
    pos.x = Math.max(0, Math.min(pos.x, innerWidth - w));
    pos.y = Math.max(0, Math.min(pos.y, innerHeight - h));
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;
  }

  function restartClass(element, className, duration, type) {
    element.classList.remove(className);
    requestAnimationFrame(() => {
      element.classList.add(className);
      if (type === 'reaction') {
        clearTimeout(reactionTimeout);
        reactionTimeout = setTimeout(() => element.classList.remove(className), duration);
      } else {
        clearTimeout(counterTimeout);
        counterTimeout = setTimeout(() => element.classList.remove(className), duration);
      }
    });
  }

  function react() {
    if (settings.siMascotReactions) restartClass(shell, 'si-react', 750, 'reaction');
    restartClass(counter, 'si-count-pop', 520, 'counter');
  }

  function celebrate() {
    clearTimeout(milestoneTimeout);
    shell.classList.remove('si-milestone');
    requestAnimationFrame(() => {
      shell.classList.add('si-milestone');
      milestoneTimeout = setTimeout(() => shell.classList.remove('si-milestone'), 1250);
    });
    if (!settings.siConfettiEnabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confettiHost.replaceChildren();
    const mascotRect = shell.getBoundingClientRect();
    const originX = mascotRect.left + mascotRect.width / 2;
    const originY = mascotRect.top + mascotRect.height * .48;
    const colors = ['#00843d','#bce8c8','#ce1126','#f4c542','#e84393','#16a6c9'];
    for (let i = 0; i < 48; i++) {
      const piece = document.createElement('i');
      const direction = (Math.PI * 2 * i / 48) + (Math.random() - .5) * .35;
      const distance = 95 + Math.random() * 145;
      piece.style.setProperty('--start-x', `${originX}px`);
      piece.style.setProperty('--start-y', `${originY}px`);
      const dx = Math.cos(direction) * distance;
      const dy = Math.sin(direction) * distance - 55;
      const spin = 360 + Math.random() * 900;
      piece.style.setProperty('--dx', `${dx}px`);
      piece.style.setProperty('--dy', `${dy + 110}px`);
      piece.style.setProperty('--mid-x', `${dx * .68}px`);
      piece.style.setProperty('--mid-y', `${dy * .72}px`);
      piece.style.setProperty('--delay', `${Math.random() * .14}s`);
      piece.style.setProperty('--burst', `${1.05 + Math.random() * .65}s`);
      piece.style.setProperty('--spin', `${spin}deg`);
      piece.style.setProperty('--mid-spin', `${spin * .65}deg`);
      piece.style.background = colors[i % colors.length];
      confettiHost.appendChild(piece);
    }
    confettiHost.classList.add('si-celebrate');
    setTimeout(() => confettiHost.replaceChildren(), 2100);
  }

  function increment() {
    count += 1;
    settings.siLifetime += 1;
    number.textContent = count.toLocaleString();
    react();
    if (settings.siLifetime % 20 === 0) celebrate();
    chrome.storage.local.set({siLifetime: settings.siLifetime});
  }

  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !settings.siEnabled) continue;
      const span = entry.target;
      io.unobserve(span);
      if (!span.isConnected || span.dataset.siDone) continue;
      span.dataset.siDone = '1';
      span.textContent = 'SÍ';
      span.classList.add('si-transformed');
      if (settings.siTextEffects) span.classList.add('si-flash');
      increment();
      setTimeout(() => span.classList.remove('si-flash'), 900);
    }
  }, {threshold:0});

  function eligible(node) {
    if (!node.nodeValue || !node.parentElement || node.parentElement.closest(SKIP)) return false;
    RE.lastIndex = 0;
    return RE.test(node.nodeValue);
  }

  function transformNode(node) {
    if (!eligible(node)) return;
    const text = node.nodeValue, fragment = document.createDocumentFragment();
    RE.lastIndex = 0;
    let match, last = 0;
    while ((match = RE.exec(text))) {
      fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
      const span = document.createElement('span');
      span.className = 'si-word';
      span.textContent = 'AI';
      fragment.appendChild(span);
      pending.add(span);
      last = match.index + 2;
    }
    fragment.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(fragment);
  }

  function scan(root) {
    if (!settings.siEnabled || !root || !root.isConnected || root.closest?.(SKIP)) return;
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) {
      if (eligible(root)) nodes.push(root);
    } else {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) if (eligible(walk.currentNode)) nodes.push(walk.currentNode);
    }
    nodes.forEach(transformNode);
    for (const span of pending) { io.observe(span); pending.delete(span); }
  }

  function scheduleScan() {
    if (queued || !settings.siEnabled) return;
    queued = true;
    setTimeout(() => { queued = false; scan(document.body); }, 350);
  }

  const observer = new MutationObserver(records => {
    if (!settings.siEnabled) return;
    for (const record of records) {
      if (record.type === 'characterData' && !record.target.parentElement?.closest(SKIP)) { scheduleScan(); return; }
      if ([...record.addedNodes].some(node => node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && !node.closest(SKIP)))) { scheduleScan(); return; }
    }
  });

  shell.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = true;
    shell.classList.add('si-dragging');
    const startX = event.clientX, startY = event.clientY, originX = pos.x, originY = pos.y;
    shell.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      if (!dragging) return;
      pos = {x: originX + moveEvent.clientX - startX, y: originY + moveEvent.clientY - startY};
      positionMascot();
    };
    const done = () => {
      dragging = false;
      shell.classList.remove('si-dragging');
      shell.removeEventListener('pointermove', move);
      shell.removeEventListener('pointerup', done);
      shell.removeEventListener('pointercancel', done);
      chrome.storage.local.set({siMascotPosition:{x:pos.x,y:pos.y}});
    };
    shell.addEventListener('pointermove', move);
    shell.addEventListener('pointerup', done, {once:true});
    shell.addEventListener('pointercancel', done, {once:true});
  });

  function runPinataPhysics() {
    pinataVelocity += -Math.sin(pinataAngle * Math.PI / 180) * .24;
    pinataVelocity *= .985;
    pinataAngle += pinataVelocity;
    pinataAngle = Math.max(-48, Math.min(48, pinataAngle));
    pendulum.style.setProperty('--angle', `${pinataAngle}deg`);
    if (Math.abs(pinataVelocity) > .02 || Math.abs(pinataAngle) > .08) {
      pinataFrame = requestAnimationFrame(runPinataPhysics);
    } else {
      pinataAngle = 0; pinataVelocity = 0; pinataFrame = 0;
      pendulum.style.setProperty('--angle', '0deg');
    }
  }

  function wakePinata() { if (!pinataFrame) pinataFrame = requestAnimationFrame(runPinataPhysics); }
  pinata.addEventListener('click', () => { pinataVelocity += pinataAngle > 0 ? -6 : 6; wakePinata(); });
  pinata.addEventListener('keydown', event => {
    if (![' ','Enter'].includes(event.key)) return;
    event.preventDefault();
    pinataVelocity += pinataAngle > 0 ? -6 : 6;
    wakePinata();
  });

  function applySettings(next) {
    settings = {...settings, ...next};
    host.hidden = !settings.siEnabled;
    pinataHost.hidden = !settings.siEnabled || !settings.siPinataEnabled;
    if (!settings.siEnabled) confettiHost.replaceChildren();
    document.documentElement.classList.toggle('si-text-effects-off', !settings.siTextEffects);
    if (settings.siEnabled) scan(document.body);
  }

  window.addEventListener('resize', positionMascot);
  chrome.storage.local.get(DEFAULTS, data => {
    settings = {...settings, ...data};
    pos = settings.siMascotPosition;
    document.documentElement.append(host, pinataHost, confettiHost);
    if (pinataImage.complete) pinataHost.classList.add(pinataImage.naturalWidth ? 'si-pinata-loaded' : 'si-pinata-error');
    positionMascot();
    applySettings(settings);
    observer.observe(document.body, {subtree:true,childList:true,characterData:true});
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
    if (message.type === 'SI_SET_SETTINGS') {
      const allowed = ['siEnabled','siTextEffects','siMascotReactions','siPinataEnabled','siConfettiEnabled'];
      const next = {};
      for (const key of allowed) if (typeof message.settings?.[key] === 'boolean') next[key] = message.settings[key];
      applySettings(next);
      reply({ok:true,count});
    }
    if (message.type === 'SI_GET_COUNT') reply({count,enabled:settings.siEnabled});
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const changedSettings = {};
    for (const key of ['siEnabled','siTextEffects','siMascotReactions','siPinataEnabled','siConfettiEnabled']) {
      if (changes[key]) changedSettings[key] = changes[key].newValue;
    }
    if (Object.keys(changedSettings).length) applySettings(changedSettings);
  });
})();
