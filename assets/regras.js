// Regras de preço da Roque Log — mesma fonte da aba REGRAS da planilha LANÇAMENTOS v4.
// Para mudar um preço (ex.: reajuste de janeiro), acrescente uma linha com a nova data de início.
window.REGRAS = {
  atualizado: '2026-11-20',
  whatsapp: '5531996991408',
  tabela: [
    // trecho, categoria, mínimo por nota (R$), franquia (kg), R$/kg, ad valorem (%), início
    { trecho: 'CAN > BHTE', categoria: 'QUEIJO', minimo: 50, franquia: 10, kg: 5, adValorem: 0, inicio: '2026-07-01' },
    { trecho: 'CAN > BHTE', categoria: 'OUTROS', minimo: 80, franquia: 10, kg: 8, adValorem: 0, inicio: '2026-07-01' },
    { trecho: 'BHTE > CAN', categoria: 'QUEIJO', minimo: 50, franquia: 0, kg: 3, adValorem: 0, inicio: '2026-07-01' },
    { trecho: 'BHTE > CAN', categoria: 'OUTROS', minimo: 50, franquia: 0, kg: 3, adValorem: 0, inicio: '2026-07-01' }
  ],
  // Valor da entrega (CAN > BHTE) ou da coleta (BHTE > CAN) por zona do mapa
  zonas: { 'AZUL': 35, 'VERDE': 45, 'AMARELA': 70, 'LILÁS': 90, 'LARANJA': 110 },
  entregaMinima: 15, // retirada combinada: Mercado Central, no carro, ou no endereço indicado pela Roque Log
  // Distância (metros) da divisa Verde/Azul em que o valor é confirmado pela Roque Log
  margemDivisa: 120
};
