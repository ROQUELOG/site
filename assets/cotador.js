// Cotador Roque Log — calcula frete peso + entrega/coleta pelas regras (regras.js) e zonas (zonas.js).
(function () {
  const R = window.REGRAS, Z = window.ZONAS;
  const $ = (s) => document.querySelector(s);
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hoje = new Date().toISOString().slice(0, 10);

  const st = { trecho: 'CAN > BHTE', categoria: 'QUEIJO', modo: 'endereco', ponto: null, endTexto: '', notas: [{ peso: '', valor: '' }] };
  let mapa = null, marcador = null;

  // ---------- regras ----------
  function linhaTabela(trecho, categoria) {
    const v = R.tabela.filter((l) => l.trecho === trecho && l.categoria === categoria && l.inicio <= hoje && (!l.fim || l.fim >= hoje));
    return v[v.length - 1];
  }
  function fretePeso(peso, t) {
    if (!(peso > 0)) return 0;
    return peso <= t.franquia ? t.minimo : Math.max(t.minimo, peso * t.kg);
  }

  // ---------- geometria ----------
  function dentro(lat, lng, poly) {
    let ok = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i], [yj, xj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ok = !ok;
    }
    return ok;
  }
  function distBorda(lat, lng, poly) {
    const k = 111320, kx = k * Math.cos((lat * Math.PI) / 180);
    let min = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = (poly[j][1] - lng) * kx, ay = (poly[j][0] - lat) * k, bx = (poly[i][1] - lng) * kx, by = (poly[i][0] - lat) * k;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return min;
  }
  function zonaDoPonto(p) {
    const em = Z.filter((z) => dentro(p.lat, p.lng, z.coords));
    const nomes = [...new Set(em.map((z) => z.zona))];
    const temAzul = nomes.includes('AZUL'), temVerde = nomes.includes('VERDE');
    if (temAzul && temVerde) return { divisa: true, nomes: ['AZUL', 'VERDE'] };
    if (temAzul || temVerde) {
      const outra = Z.find((z) => z.zona === (temAzul ? 'VERDE' : 'AZUL'));
      if (outra && distBorda(p.lat, p.lng, outra.coords) < R.margemDivisa) return { divisa: true, nomes: ['AZUL', 'VERDE'] };
    }
    if (!nomes.length) return { fora: true };
    const z = nomes.sort((a, b) => R.zonas[a] - R.zonas[b])[0];
    return { zona: z, valor: R.zonas[z] };
  }

  // ---------- mapa ----------
  const CORES = { 'AZUL': '#2f6fd6', 'VERDE': '#2e9e4f', 'AMARELA': '#e7b416', 'LILÁS': '#9b59b6', 'LARANJA': '#f07c1e' };
  function iniciarMapa() {
    if (!window.L) { $('#mapa').innerHTML = '<p class="miudo" style="padding:12px">Mapa indisponível agora. Use o CEP ou o endereço.</p>'; return; }
    mapa = L.map('mapa', { scrollWheelZoom: false }).setView([-19.93, -43.95], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
    Z.forEach((z) => L.polygon(z.coords, { color: CORES[z.zona], weight: 1.5, fillOpacity: 0.18 }).addTo(mapa).bindTooltip(z.zona + ' · ' + brl(R.zonas[z.zona])));
    mapa.on('click', (e) => definirPonto(e.latlng.lat, e.latlng.lng, 'Ponto marcado no mapa'));
  }
  function definirPonto(lat, lng, texto) {
    st.ponto = { lat, lng };
    if (texto) st.endTexto = texto;
    if (mapa) {
      if (!marcador) { marcador = L.marker([lat, lng], { draggable: true }).addTo(mapa); marcador.on('dragend', () => { const p = marcador.getLatLng(); definirPonto(p.lat, p.lng, 'Ponto ajustado no mapa'); }); }
      else marcador.setLatLng([lat, lng]);
      mapa.setView([lat, lng], Math.max(mapa.getZoom(), 14));
    }
    calcular();
  }

  // ---------- endereço ----------
  async function buscarCep() {
    const cep = $('#cep').value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    msgEnd('Buscando o CEP…');
    try {
      const r = await (await fetch('https://viacep.com.br/ws/' + cep + '/json/')).json();
      if (r.erro) return msgEnd('CEP não encontrado. Confira ou digite o endereço.', true);
      $('#endereco').value = [r.logradouro, r.bairro, r.localidade + ' - ' + r.uf].filter(Boolean).join(', ');
      msgEnd('Endereço do CEP preenchido. Informe o número e clique em Localizar.');
      $('#numero').focus();
    } catch (e) { msgEnd('Não consegui consultar o CEP agora. Digite o endereço.', true); }
  }
  async function localizar() {
    const end = $('#endereco').value.trim(), num = $('#numero').value.trim();
    if (!end) return msgEnd('Digite o endereço, o CEP ou marque o ponto no mapa.', true);
    const partes = end.split(',').map((s) => s.trim());
    const q = (num ? partes[0] + ', ' + num + (partes.length > 1 ? ', ' + partes.slice(1).join(', ') : '') : end) + (/minas|mg\b/i.test(end) ? '' : ', Minas Gerais') + ', Brasil';
    msgEnd('Localizando…');
    try {
      const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(q);
      const r = await (await fetch(u, { headers: { 'Accept': 'application/json' } })).json();
      if (!r.length) return msgEnd('Não encontrei esse endereço. Confira, tente sem o bairro ou marque o ponto no mapa.', true);
      definirPonto(parseFloat(r[0].lat), parseFloat(r[0].lon), end + (num ? ', ' + num : ''));
      msgEnd('Endereço localizado. Se o alfinete não estiver no lugar certo, arraste-o no mapa.');
    } catch (e) { msgEnd('Não consegui localizar agora. Marque o ponto no mapa.', true); }
  }
  function minhaLocalizacao() {
    if (!navigator.geolocation) return msgEnd('Seu navegador não informa a localização.', true);
    msgEnd('Pegando sua localização…');
    navigator.geolocation.getCurrentPosition((p) => { definirPonto(p.coords.latitude, p.coords.longitude, 'Minha localização'); msgEnd('Localização marcada.'); }, () => msgEnd('Não foi possível pegar a localização. Use o CEP ou o mapa.', true), { enableHighAccuracy: true, timeout: 10000 });
  }
  function voz() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, b = $('#btn-voz');
    if (!SR) return msgEnd('Seu navegador não aceita ditado. Digite o endereço.', true);
    const rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false;
    b.classList.add('ouvindo'); msgEnd('Pode falar o endereço…');
    rec.onresult = (e) => { $('#endereco').value = e.results[0][0].transcript; b.classList.remove('ouvindo'); localizar(); };
    rec.onerror = rec.onend = () => b.classList.remove('ouvindo');
    rec.start();
  }
  function msgEnd(t, erro) { const m = $('#msg-end'); m.textContent = t; m.style.color = erro ? 'var(--vermelho)' : 'var(--cinza)'; }

  // ---------- notas ----------
  function desenharNotas() {
    const box = $('#notas'); box.innerHTML = '';
    st.notas.forEach((n, i) => {
      const d = document.createElement('div'); d.className = 'nota';
      d.innerHTML = '<input type="number" min="0" step="0.1" inputmode="decimal" placeholder="Peso bruto (kg)" aria-label="Peso bruto da nota ' + (i + 1) + '" value="' + n.peso + '">' +
        '<input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Valor NF (R$)" aria-label="Valor da nota ' + (i + 1) + '" value="' + n.valor + '">' +
        '<button type="button" aria-label="Remover nota" ' + (st.notas.length === 1 ? 'disabled' : '') + '>×</button>';
      const [p, v, b] = d.children;
      p.oninput = () => { n.peso = p.value; calcular(); };
      v.oninput = () => { n.valor = v.value; calcular(); };
      b.onclick = () => { st.notas.splice(i, 1); desenharNotas(); calcular(); };
      box.appendChild(d);
    });
  }

  // ---------- cálculo ----------
  function calcular() {
    const t = linhaTabela(st.trecho, st.categoria);
    const ida = st.trecho === 'CAN > BHTE';
    const palavra = ida ? 'Entrega' : 'Coleta';
    const out = $('#resultado'); const itens = []; let total = 0, frete = 0, adv = 0, pesoTotal = 0, nNotas = 0;
    st.notas.forEach((n) => {
      const p = parseFloat(String(n.peso).replace(',', '.'));
      if (p > 0) { nNotas++; pesoTotal += p; frete += fretePeso(p, t); adv += (parseFloat(String(n.valor).replace(',', '.')) || 0) * (t.adValorem / 100); }
    });
    frete = Math.round(frete * 100) / 100; adv = Math.round(adv * 100) / 100;
    let ent = null, status = '', cls = 'ok', confirmar = false;
    if (st.modo === 'retirada') { ent = R.entregaMinima; status = (ida ? 'Entrega' : 'Coleta') + ' combinada em ponto fixo (Mercado Central ou endereço indicado pela Roque Log).'; }
    else if (!st.ponto) { status = 'Informe o endereço de ' + palavra.toLowerCase() + ' para calcular a ' + palavra.toLowerCase() + '.'; cls = 'alerta'; }
    else {
      const z = zonaDoPonto(st.ponto);
      if (z.fora) { status = palavra + ' indisponível para este endereço. Podemos combinar retirada ou indicar um parceiro: fale com a gente no WhatsApp.'; cls = 'erro'; }
      else if (z.divisa) { ent = R.zonas.VERDE; confirmar = true; cls = 'alerta'; status = 'Endereço na divisa das zonas Azul e Verde: a ' + palavra.toLowerCase() + ' fica entre ' + brl(R.zonas.AZUL) + ' e ' + brl(R.zonas.VERDE) + '. Confirmamos pelo WhatsApp.'; }
      else { ent = z.valor; status = 'Zona ' + z.zona + ' · ' + palavra.toLowerCase() + ' ' + brl(z.valor) + '.'; }
    }
    if (nNotas) itens.push(['Frete peso (' + nNotas + (nNotas > 1 ? ' notas' : ' nota') + ', ' + pesoTotal.toLocaleString('pt-BR') + ' kg)', frete]);
    if (adv > 0) itens.push(['Ad valorem', adv]);
    if (ent !== null) itens.push([palavra + (confirmar ? ' (até)' : ''), ent]);
    total = itens.reduce((s, i) => s + i[1], 0);
    st.ultimo = { t, frete, adv, ent, total, status, confirmar, pesoTotal, nNotas, palavra };
    out.innerHTML =
      '<p class="miudo" style="margin:0">' + (nNotas ? (confirmar ? 'Total estimado (até)' : 'Total estimado') : 'Informe o peso para ver o valor') + '</p>' +
      '<div class="total">' + (nNotas ? brl(total) : '—') + '</div>' +
      itens.map((i) => '<div class="item"><span>' + i[0] + '</span><strong>' + brl(i[1]) + '</strong></div>').join('') +
      '<div class="status ' + cls + '">' + status + '</div>' +
      '<p class="miudo">' + regraTexto(t, ida) + '</p>';
    $('#btn-zap').disabled = !nNotas;
  }
  function regraTexto(t, ida) {
    const base = t.franquia > 0 ? brl(t.minimo) + ' por nota até ' + t.franquia + ' kg; acima, peso total × ' + brl(t.kg) + '/kg' : 'mínimo de ' + brl(t.minimo) + ' por nota ou ' + brl(t.kg) + '/kg bruto, o que for maior';
    return 'Regra: ' + base + '. Cada nota fiscal (remetente) é um serviço; quando várias notas vão para o mesmo destinatário na mesma viagem, a ' + (ida ? 'entrega' : 'coleta') + ' é cobrada uma vez só. Valores estimados: o preço final é confirmado na triagem, pelo peso bruto e endereço da nota.';
  }
  function whatsapp() {
    const u = st.ultimo; if (!u || !u.nNotas) return;
    const linhas = [
      'Olá, Roque Log! Fiz uma cotação no site:',
      '• Trecho: ' + st.trecho + ' · ' + (st.categoria === 'QUEIJO' ? 'queijos e derivados do leite' : 'outros produtos'),
      '• ' + u.nNotas + (u.nNotas > 1 ? ' notas' : ' nota') + ', ' + u.pesoTotal.toLocaleString('pt-BR') + ' kg no total',
      '• ' + u.palavra + ': ' + (st.modo === 'retirada' ? 'ponto combinado' : (st.endTexto || 'endereço a informar')) + (u.ent !== null ? ' (' + brl(u.ent) + (u.confirmar ? ', a confirmar' : '') + ')' : ' (a confirmar)'),
      '• Total estimado: ' + brl(u.total) + (u.ent === null ? ' + ' + u.palavra.toLowerCase() : ''),
      'Pode confirmar?'
    ];
    location.href = 'https://wa.me/' + R.whatsapp + '?text=' + encodeURIComponent(linhas.join('\n'));
  }

  // ---------- eventos ----------
  function ligar() {
    document.querySelectorAll('input[name=trecho]').forEach((r) => r.onchange = () => { st.trecho = r.value; rotulos(); calcular(); });
    document.querySelectorAll('input[name=categoria]').forEach((r) => r.onchange = () => { st.categoria = r.value; calcular(); });
    document.querySelectorAll('input[name=modo]').forEach((r) => r.onchange = () => { st.modo = r.value; $('#bloco-endereco').hidden = st.modo !== 'endereco'; calcular(); if (mapa) setTimeout(() => mapa.invalidateSize(), 50); });
    $('#cep').oninput = () => { if ($('#cep').value.replace(/\D/g, '').length === 8) buscarCep(); };
    $('#btn-localizar').onclick = localizar;
    $('#endereco').onkeydown = $('#numero').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); localizar(); } };
    $('#btn-voz').onclick = voz;
    $('#btn-gps').onclick = minhaLocalizacao;
    $('#btn-nota').onclick = () => { st.notas.push({ peso: '', valor: '' }); desenharNotas(); };
    $('#btn-zap').onclick = whatsapp;
  }
  function rotulos() {
    const ida = st.trecho === 'CAN > BHTE';
    $('#titulo-end').textContent = ida ? '2. Onde entregar (destinatário em BH e região)' : '2. Onde coletar (remetente em BH e região)';
    $('#rot-endereco').textContent = ida ? 'Entregar no endereço do destinatário' : 'Coletar no endereço do remetente';
    $('#rot-retirada').textContent = (ida ? 'Retirada' : 'Entrega na Roque Log') + ' em ponto combinado · ' + brl(R.entregaMinima);
  }

  window.CotadorTeste = { zonaDoPonto, fretePeso, linhaTabela };
  document.addEventListener('DOMContentLoaded', () => { ligar(); rotulos(); desenharNotas(); iniciarMapa(); calcular(); });
})();
