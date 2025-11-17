// import { addKeyword } from '@builderbot/bot';
// import { updateUserSession, getUserSession, ExtendedContext, canSendOnce } from './userTrackingSystem';

// // ======== NUEVO: Espacios para imágenes (URLs opcionales) ========
// const IMAGE_HERO = 'https://TU_URL_HERO.jpg'; // TODO: reemplaza
// const IMAGE_CATEGORY: Record<string, string> = {
//   memorias: 'https://TU_URL_CATEGORIA_MEMORIAS.jpg',     // TODO: reemplaza
//   cables: 'https://TU_URL_CATEGORIA_CABLES.jpg',
//   audio: 'https://TU_URL_CATEGORIA_AUDIO.jpg',
//   protección: 'https://TU_URL_CATEGORIA_PROTECCION.jpg',
//   conectividad: 'https://TU_URL_CATEGORIA_CONECTIVIDAD.jpg',
//   smart: 'https://TU_URL_CATEGORIA_SMART.jpg'
// };
// const IMAGE_ITEM: Record<string, string> = {
//   'USB 64GB': 'https://TU_URL_USB64.jpg',                 // TODO: reemplaza
//   'Cable USB-C 1m': 'https://TU_URL_CABLE_USBC_1M.jpg',
//   'Audífonos in-ear': 'https://TU_URL_INEAR.jpg',
//   'Hub USB 3.0 4 puertos': 'https://TU_URL_HUB4.jpg'
//   // agrega más si deseas
// };

// // ======== NUEVO: Stock/lead times (opcional) ========
// const STOCK: Record<string, { qty: number; leadDays?: number }> = {
//   'USB 32GB': { qty: 15 },
//   'USB 64GB': { qty: 22 },
//   'USB 128GB': { qty: 10 },
//   'USB 256GB': { qty: 6, leadDays: 1 },
//   'Cable USB-C 1m': { qty: 40 },
//   'Cargador 20W': { qty: 18 },
//   'Hub USB 3.0 4 puertos': { qty: 8 },
//   'Lector SD/MicroSD': { qty: 12 }
//   // añade más si deseas
// };

// // ======== NUEVO: Reglas de bundles/upsell (sencillas) ========
// const BUNDLE_RULES: Array<{
//   ifIncludes: string[];
//   suggest: string[];
//   message: string;
// }> = [
//   {
//     ifIncludes: ['USB 64GB','USB 128GB','USB 256GB'],
//     suggest: ['Cable USB-C 1m','Funda USB'],
//     message: 'Pack recomendado: memoria + cable + funda (ahorras 8%).'
//   },
//   {
//     ifIncludes: ['Hub USB 3.0 4 puertos'],
//     suggest: ['Cable HDMI 1.8m','Adaptador USB-C a USB'],
//     message: 'Completa tu setup: hub + HDMI + adaptador USB-C.'
//   },
//   {
//     ifIncludes: ['Audífonos in-ear'],
//     suggest: ['Cargador 20W','Organizador de cables'],
//     message: 'Mejora tu día: audio + carga rápida + orden.'
//   }
// ];

// // ======== Estructura de catálogo y precios (tu base) ========
// const TECH_CATEGORIES = [
//   { key: 'memorias', label: 'Memorias/Almacenamiento', items: [
//     'USB 32GB','USB 64GB','USB 128GB','USB 256GB',
//     'MicroSD 64GB','MicroSD 128GB','MicroSD 256GB',
//     'SSD Externo 500GB','SSD Externo 1TB'
//   ]},
//   { key: 'cables', label: 'Cables/Cargadores (Power)', items: [
//     'Cable USB-C 1m','Cable USB-C 2m','Cable Lightning','Cable Lightning 2m',
//     'Cable 3en1','Cable MicroUSB','Cargador 20W','Cargador 30W',
//     'Power Bank 10,000mAh','Power Bank 20,000mAh'
//   ]},
//   { key: 'audio', label: 'Audífonos/Audio', items: [
//     'Audífonos in-ear','Diadema BT','Manos libres con micrófono',
//     'Parlante BT portátil','Soundbar Mini'
//   ]},
//   { key: 'protección', label: 'Protección/Accesorios', items: [
//     'Funda USB','Llavero LED','Organizador de cables','Soporte celular',
//     'Trípode mini','Kit limpieza pantalla'
//   ]},
//   { key: 'conectividad', label: 'Conectividad/Adaptadores', items: [
//     'Hub USB 3.0 4 puertos','Adaptador USB-C a USB','Adaptador USB-C a HDMI',
//     'Lector SD/MicroSD','Switch HDMI 3x1','Cable HDMI 1.8m'
//   ]},
//   { key: 'smart', label: 'Smart/Home/Oficina', items: [
//     'Lámpara LED escritorio','Tomacorriente inteligente','Soporte laptop',
//     'Mouse inalámbrico','Teclado inalámbrico'
//   ]},
// ];

// const PRICE_MAP: Record<string, string> = {
//   'USB 32GB': '$39.900','USB 64GB': '$59.900','USB 128GB': '$89.900','USB 256GB': '$139.900',
//   'MicroSD 64GB': '$54.900','MicroSD 128GB': '$89.900','MicroSD 256GB': '$149.900',
//   'SSD Externo 500GB': '$289.900','SSD Externo 1TB': '$449.900',
//   'Cable USB-C 1m': '$19.900','Cable USB-C 2m': '$24.900','Cable Lightning': '$24.900','Cable Lightning 2m': '$34.900',
//   'Cable 3en1': '$29.900','Cable MicroUSB': '$14.900','Cargador 20W': '$39.900','Cargador 30W': '$59.900',
//   'Power Bank 10,000mAh': '$89.900','Power Bank 20,000mAh': '$129.900',
//   'Audífonos in-ear': '$39.900','Diadema BT': '$89.900','Manos libres con micrófono': '$49.900',
//   'Parlante BT portátil': '$79.900','Soundbar Mini': '$149.900',
//   'Funda USB': '$14.900','Llavero LED': '$9.900','Organizador de cables': '$14.900',
//   'Soporte celular': '$19.900','Trípode mini': '$29.900','Kit limpieza pantalla': '$19.900',
//   'Hub USB 3.0 4 puertos': '$49.900','Adaptador USB-C a USB': '$29.900','Adaptador USB-C a HDMI': '$69.900',
//   'Lector SD/MicroSD': '$34.900','Switch HDMI 3x1': '$59.900','Cable HDMI 1.8m': '$29.900',
//   'Lámpara LED escritorio': '$69.900','Tomacorriente inteligente': '$79.900','Soporte laptop': '$89.900',
//   'Mouse inalámbrico': '$49.900','Teclado inalámbrico': '$69.900',
// };

// const ALIAS: Record<string, string[]> = {
//   'Cable USB-C 1m': ['usb c 1m','type c 1m','c cable 1m'],
//   'Cable USB-C 2m': ['usb c 2m','type c 2m','c cable 2m'],
//   'Cable Lightning': ['iphone cable','lightning 1m','cable iphone'],
//   'Cable Lightning 2m': ['lightning 2m','iphone 2m'],
//   'Cable 3en1': ['3 en 1','3en1','triple cable'],
//   'Cable MicroUSB': ['micro usb','microusb'],
//   'Cargador 20W': ['20w','cargador rapido','charger 20w'],
//   'Cargador 30W': ['30w','charger 30w'],
//   'Power Bank 10,000mAh': ['powerbank 10000','bateria 10000'],
//   'Power Bank 20,000mAh': ['powerbank 20000','bateria 20000'],
//   'Hub USB 3.0 4 puertos': ['hub 4','hub usb','hub 3.0'],
//   'Adaptador USB-C a USB': ['usbc a usb','c a usb'],
//   'Adaptador USB-C a HDMI': ['usbc a hdmi','c a hdmi'],
//   'Lector SD/MicroSD': ['lector sd','lector microsd','card reader'],
//   'Switch HDMI 3x1': ['switch hdmi','conmutador hdmi'],
//   'Cable HDMI 1.8m': ['hdmi 1.8','cable hdmi'],
//   'Diadema BT': ['audifonos grandes','over ear bt','headset bt'],
//   'Audífonos in-ear': ['in ear','in-ear'],
//   'Parlante BT portátil': ['parlante bt','bocina bt','speaker bt'],
//   'Soundbar Mini': ['barra de sonido','sound bar'],
//   'Funda USB': ['estuche usb'],
//   'Organizador de cables': ['organizador'],
//   'Llavero LED': ['llavero luz'],
//   'Lámpara LED escritorio': ['lampara led'],
//   'Tomacorriente inteligente': ['enchufe inteligente','smart plug'],
//   'Mouse inalámbrico': ['mouse inalambrico'],
//   'Teclado inalámbrico': ['teclado inalambrico'],
//   'Soporte laptop': ['base laptop','stand laptop'],
//   'Trípode mini': ['tripode mini'],
//   'Kit limpieza pantalla': ['kit limpieza','limpiador pantalla'],
//   'USB 256GB': ['usb 256'],
//   'SSD Externo 500GB': ['ssd 500','ssd externo 500'],
//   'SSD Externo 1TB': ['ssd 1tb','ssd externo 1tb'],
//   'MicroSD 128GB': ['microsd 128'],
//   'MicroSD 256GB': ['microsd 256'],
// };

// // ======== Helpers UI/Copy ========
// function normalize(s: string) {
//   return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// }

// function badgeLine() {
//   return '✅ Garantía • 🚚 Envío rápido • 💬 Soporte';
// }

// function renderHero() {
//   // Nota: WhatsApp no soporta imagen directa por texto; deja este texto y si tu provider soporta media, puedes enviar IMAGE_HERO aparte.
//   return [
//     '🧰 Tecnología y Accesorios — TechAura',
//     badgeLine(),
//     IMAGE_HERO ? '(Imagen destacada disponible)' : ''
//   ].filter(Boolean).join('\n');
// }

// function renderCarouselCategories() {
//   // Carrusel textual (simulado) con CTA corto
//   const slides = TECH_CATEGORIES.map((c) => `• ${c.label} — escribe "${c.key}"` + (IMAGE_CATEGORY[c.key] ? ' [img]' : ''));
//   return [
//     'Explora por categoría:',
//     ...slides,
//     '',
//     'Tip: escribe el número o el nombre de la categoría.'
//   ].join('\n');
// }

// function renderCategoryList() {
//   return [
//     renderHero(),
//     '',
//     renderCarouselCategories()
//   ].join('\n');
// }

// function renderItemsFor(categoryKey: string) {
//   const cat = TECH_CATEGORIES.find(c => c.key === categoryKey);
//   if (!cat) return 'Categoría no encontrada.';
//   const lines = cat.items.map((item) => {
//     const price = PRICE_MAP[item] || 'Consultar';
//     const stock = STOCK[item]?.qty;
//     const lead = STOCK[item]?.leadDays ? ` (disp. en ${STOCK[item]?.leadDays} día${STOCK[item]?.leadDays!>1?'s':''})` : '';
//     const stockText = typeof stock === 'number' ? (stock > 8 ? 'En stock' : `Últimas ${stock}`) : 'Disponible';
//     const img = IMAGE_ITEM[item] ? ' [img]' : '';
//     return `• ${item} — ${price} • ${stockText}${lead}${img}`;
//   });
//   return [
//     `📦 ${cat.label}` + (IMAGE_CATEGORY[categoryKey] ? ' [img]' : ''),
//     ...lines,
//     '',
//     badgeLine(),
//     'CTA: escribe el nombre del producto para agregarlo, o "volver" para cambiar de categoría.'
//   ].join('\n');
// }

// function matchProduct(input: string): string | undefined {
//   const n = normalize(input);
//   for (const item of Object.keys(PRICE_MAP)) {
//     if (n.includes(normalize(item))) return item;
//   }
//   for (const [item, aliases] of Object.entries(ALIAS)) {
//     if (aliases.some(a => n.includes(normalize(a)))) return item;
//   }
//   return undefined;
// }

// function detectCategory(input: string): string | null {
//   const norm = normalize(input);
//   const direct = TECH_CATEGORIES.find(c => norm.includes(normalize(c.key)));
//   if (direct) return direct.key;
//   const numeric = parseInt(norm, 10);
//   if (!isNaN(numeric) && numeric >= 1 && numeric <= TECH_CATEGORIES.length) {
//     return TECH_CATEGORIES[numeric - 1].key;
//   }
//   return null;
// }

// // ======== NUEVO: motor de bundles simple ========
// function getBundleSuggestion(items: Array<{ name: string }>): { text: string; suggestions: string[] } | null {
//   const names = new Set(items.map(i => i.name));
//   for (const rule of BUNDLE_RULES) {
//     if (rule.ifIncludes.some(req => names.has(req))) {
//       return { text: rule.message, suggestions: rule.suggest };
//     }
//   }
//   return null;
// }

// const menuTech = addKeyword(['tecnologia','accesorios','cables','power','audifonos','audífonos','proteccion','protección','adaptador','hub','hdmi','ssd'])
// .addAction(async (ctx: ExtendedContext, { flowDynamic }) => {
//   const session = await getUserSession(ctx.from);
//   await updateUserSession(ctx.from, ctx.body, 'catalogFlow', 'tech_catalog', false, { metadata: { category: 'tech' } });

//   const intro = [
//     renderHero(),
//     '',
//     'Elegimos productos útiles y duraderos.',
//     renderCarouselCategories()
//   ].join('\n');

//   if (canSendOnce(session, 'tech_menu_intro', 10)) {
//     await flowDynamic([intro]);
//   } else {
//     await flowDynamic([renderCategoryList()]);
//   }
// })
// .addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic }) => {
//   const session = await getUserSession(ctx.from);
//   const msg = (ctx.body || '').trim();

//   // Detección de categoría
//   const cat = detectCategory(msg);
//   if (cat) {
//     await updateUserSession(ctx.from, msg, 'catalogFlow', `tech_${cat}`, false, { metadata: { category: cat } });
//     await flowDynamic([renderItemsFor(cat)]);
//     return;
//   }

//   if (/volver|atras|atrás|menu|menú/i.test(msg)) {
//     await flowDynamic([renderCategoryList()]);
//     return;
//   }

//   // Selección de producto
//   const chosen = matchProduct(msg);
//   if (chosen) {
//     const price = PRICE_MAP[chosen] || 'Consultar';
//     // Control de stock básico
//     const currentStock = typeof STOCK[chosen]?.qty === 'number' ? STOCK[chosen].qty : 99;
//     if (currentStock <= 0) {
//       await flowDynamic([`⚠️ ${chosen} está agotado temporalmente. ¿Deseas que te avise cuando llegue o ver alternativas?`]);
//       return;
//     }

//     session.orderData = session.orderData || { items: [], status: 'draft' } as any;
//     session.orderData.items = session.orderData.items || [];
//     session.orderData.items.push({
//       id: `TECH-${Date.now()}`,
//       productId: `TECH-${chosen.replace(/\s+/g,'_').toUpperCase()}`,
//       name: chosen,
//       price: Number((price.match(/\d+/g) || ['0']).join('')) || 0,
//       quantity: 1,
//       unitPrice: Number((price.match(/\d+/g) || ['0']).join('')) || 0
//     });
//     session.orderData.totalPrice = (session.orderData.totalPrice || 0) + (session.orderData.items.slice(-1)[0].price || 0);
//     await updateUserSession(ctx.from, `added_${chosen}`, 'catalogFlow', 'tech_item_added', false, { metadata: { product: chosen, price } });

//     // Upsell/bundle
//     const bundle = getBundleSuggestion(session.orderData.items);
//     const upsellLines = bundle
//       ? [
//           `🎯 ${bundle.text}`,
//           `Sugerencias: ${bundle.suggestions.join(' • ')}`,
//           'Añade escribiendo el nombre del producto.'
//         ]
//       : ['Sugerencia: añade un cable o protección para completar tu kit.'];

//     await flowDynamic([
//       [
//         `✅ Agregado: ${chosen} — ${price}${STOCK[chosen]?.leadDays ? ` • Listo en ${STOCK[chosen]?.leadDays} día(s)` : ''}`,
//         ...upsellLines,
//         '',
//         'Opciones:',
//         '• Seguir comprando tecnología (escribe "menú")',
//         '• Ver USBs: música | películas | videos',
//         '• Confirmar pedido: escribe "pagar"'
//       ].join('\n')
//     ]);
//     return;
//   }

//   // Comando pagar
//   if (/pagar|checkout|finalizar|confirmar/i.test(msg)) {
//     await flowDynamic([
//       '🧾 Preparando tu pedido...',
//       '¿Prefieres transferencia/Nequi/Daviplata o contraentrega?'
//     ]);
//     await updateUserSession(ctx.from, 'tech_checkout', 'orderFlow', 'payment_flow', false, { metadata: { origin: 'menuTech' } });
//     return;
//   }

//   // Fallback persuasivo sin invadir
//   await flowDynamic([
//     [
//       'No entendí. Elige una categoría o escribe "menú" para ver opciones.',
//       'Tip: tenemos packs con descuento al combinar memoria + cable + protección.',
//       renderCategoryList()
//     ].join('\n')
//   ]);
// });

// export default menuTech;


import { addKeyword } from '@builderbot/bot';
import { updateUserSession, getUserSession, ExtendedContext, canSendOnce } from './userTrackingSystem';

// ======== CONFIGURACIÓN DE IMÁGENES ========
const IMAGE_HERO = 'https://TU_URL_HERO.jpg';
const IMAGE_CATEGORY: Record<string, string> = {
  memorias: 'https://TU_URL_CATEGORIA_MEMORIAS.jpg',
  cables: 'https://TU_URL_CATEGORIA_CABLES.jpg',
  audio: 'https://TU_URL_CATEGORIA_AUDIO.jpg',
  protección: 'https://TU_URL_CATEGORIA_PROTECCION.jpg',
  conectividad: 'https://TU_URL_CATEGORIA_CONECTIVIDAD.jpg',
  smart: 'https://TU_URL_CATEGORIA_SMART.jpg'
};
const IMAGE_ITEM: Record<string, string> = {
  'USB 64GB': 'https://TU_URL_USB64.jpg',
  'Cable USB-C 1m': 'https://TU_URL_CABLE_USBC_1M.jpg',
  'Audífonos in-ear': 'https://TU_URL_INEAR.jpg',
  'Hub USB 3.0 4 puertos': 'https://TU_URL_HUB4.jpg'
};

// ======== GESTIÓN DE STOCK ========
const STOCK: Record<string, { qty: number; leadDays?: number }> = {
  'USB 32GB': { qty: 15 },
  'USB 64GB': { qty: 22 },
  'USB 128GB': { qty: 10 },
  'USB 256GB': { qty: 6, leadDays: 1 },
  'Cable USB-C 1m': { qty: 40 },
  'Cargador 20W': { qty: 18 },
  'Hub USB 3.0 4 puertos': { qty: 8 },
  'Lector SD/MicroSD': { qty: 12 }
};

// ======== ESTRATEGIAS DE UPSELL ========
const BUNDLE_RULES: Array<{
  ifIncludes: string[];
  suggest: string[];
  message: string;
  discount?: number;
}> = [
  {
    ifIncludes: ['USB 64GB','USB 128GB','USB 256GB'],
    suggest: ['Cable USB-C 1m','Funda USB'],
    message: '🔥 Pack recomendado: memoria + cable + funda (¡Ahorras 8% en el combo!)',
    discount: 8
  },
  {
    ifIncludes: ['Hub USB 3.0 4 puertos'],
    suggest: ['Cable HDMI 1.8m','Adaptador USB-C a USB'],
    message: '🚀 Completa tu setup profesional: hub + HDMI + adaptador USB-C con envío gratis',
    discount: 5
  },
  {
    ifIncludes: ['Audífonos in-ear'],
    suggest: ['Cargador 20W','Organizador de cables'],
    message: '🎧 Mejora tu experiencia: audio premium + carga rápida + organización (3x2 en organizador)',
    discount: 10
  }
];

// ======== CATÁLOGO Y PRECIOS ========
const TECH_CATEGORIES = [
  { 
    key: 'memorias', 
    label: '💾 Memorias y Almacenamiento', 
    description: 'Almacena tus recuerdos y trabajo con máxima velocidad',
    items: [
      'USB 32GB','USB 64GB','USB 128GB','USB 256GB',
      'MicroSD 64GB','MicroSD 128GB','MicroSD 256GB',
      'SSD Externo 500GB','SSD Externo 1TB'
    ]
  },
  { 
    key: 'cables', 
    label: '🔌 Cables y Cargadores', 
    description: 'Carga rápida y conexiones confiables para todos tus dispositivos',
    items: [
      'Cable USB-C 1m','Cable USB-C 2m','Cable Lightning','Cable Lightning 2m',
      'Cable 3en1','Cable MicroUSB','Cargador 20W','Cargador 30W',
      'Power Bank 10,000mAh','Power Bank 20,000mAh'
    ]
  },
  { 
    key: 'audio', 
    label: '🎧 Audio y Audífonos', 
    description: 'Sumérgete en el sonido con nuestra calidad premium',
    items: [
      'Audífonos in-ear','Diadema BT','Manos libres con micrófono',
      'Parlante BT portátil','Soundbar Mini'
    ]
  },
  { 
    key: 'protección', 
    label: '🛡️ Protección y Accesorios', 
    description: 'Protege y organiza tu tecnología como un profesional',
    items: [
      'Funda USB','Llavero LED','Organizador de cables','Soporte celular',
      'Trípode mini','Kit limpieza pantalla'
    ]
  },
  { 
    key: 'conectividad', 
    label: '🌐 Conectividad', 
    description: 'Conecta todos tus dispositivos sin límites',
    items: [
      'Hub USB 3.0 4 puertos','Adaptador USB-C a USB','Adaptador USB-C a HDMI',
      'Lector SD/MicroSD','Switch HDMI 3x1','Cable HDMI 1.8m'
    ]
  },
  { 
    key: 'smart', 
    label: '🏠 Smart Home & Oficina', 
    description: 'Transforma tu espacio con tecnología inteligente',
    items: [
      'Lámpara LED escritorio','Tomacorriente inteligente','Soporte laptop',
      'Mouse inalámbrico','Teclado inalámbrico'
    ]
  },
];

const PRICE_MAP: Record<string, string> = {
  'USB 32GB': '$39.900','USB 64GB': '$59.900','USB 128GB': '$89.900','USB 256GB': '$139.900',
  'MicroSD 64GB': '$54.900','MicroSD 128GB': '$89.900','MicroSD 256GB': '$149.900',
  'SSD Externo 500GB': '$289.900','SSD Externo 1TB': '$449.900',
  'Cable USB-C 1m': '$19.900','Cable USB-C 2m': '$24.900','Cable Lightning': '$24.900','Cable Lightning 2m': '$34.900',
  'Cable 3en1': '$29.900','Cable MicroUSB': '$14.900','Cargador 20W': '$39.900','Cargador 30W': '$59.900',
  'Power Bank 10,000mAh': '$89.900','Power Bank 20,000mAh': '$129.900',
  'Audífonos in-ear': '$39.900','Diadema BT': '$89.900','Manos libres con micrófono': '$49.900',
  'Parlante BT portátil': '$79.900','Soundbar Mini': '$149.900',
  'Funda USB': '$14.900','Llavero LED': '$9.900','Organizador de cables': '$14.900',
  'Soporte celular': '$19.900','Trípode mini': '$29.900','Kit limpieza pantalla': '$19.900',
  'Hub USB 3.0 4 puertos': '$49.900','Adaptador USB-C a USB': '$29.900','Adaptador USB-C a HDMI': '$69.900',
  'Lector SD/MicroSD': '$34.900','Switch HDMI 3x1': '$59.900','Cable HDMI 1.8m': '$29.900',
  'Lámpara LED escritorio': '$69.900','Tomacorriente inteligente': '$79.900','Soporte laptop': '$89.900',
  'Mouse inalámbrico': '$49.900','Teclado inalámbrico': '$69.900',
};

const ALIAS: Record<string, string[]> = {
  'Cable USB-C 1m': ['usb c 1m','type c 1m','c cable 1m'],
  'Cable USB-C 2m': ['usb c 2m','type c 2m','c cable 2m'],
  'Cable Lightning': ['iphone cable','lightning 1m','cable iphone'],
  'Cable Lightning 2m': ['lightning 2m','iphone 2m'],
  'Cable 3en1': ['3 en 1','3en1','triple cable'],
  'Cable MicroUSB': ['micro usb','microusb'],
  'Cargador 20W': ['20w','cargador rapido','charger 20w'],
  'Cargador 30W': ['30w','charger 30w'],
  'Power Bank 10,000mAh': ['powerbank 10000','bateria 10000'],
  'Power Bank 20,000mAh': ['powerbank 20000','bateria 20000'],
  'Hub USB 3.0 4 puertos': ['hub 4','hub usb','hub 3.0'],
  'Adaptador USB-C a USB': ['usbc a usb','c a usb'],
  'Adaptador USB-C a HDMI': ['usbc a hdmi','c a hdmi'],
  'Lector SD/MicroSD': ['lector sd','lector microsd','card reader'],
  'Switch HDMI 3x1': ['switch hdmi','conmutador hdmi'],
  'Cable HDMI 1.8m': ['hdmi 1.8','cable hdmi'],
  'Diadema BT': ['audifonos grandes','over ear bt','headset bt'],
  'Audífonos in-ear': ['in ear','in-ear'],
  'Parlante BT portátil': ['parlante bt','bocina bt','speaker bt'],
  'Soundbar Mini': ['barra de sonido','sound bar'],
  'Funda USB': ['estuche usb'],
  'Organizador de cables': ['organizador'],
  'Llavero LED': ['llavero luz'],
  'Lámpara LED escritorio': ['lampara led'],
  'Tomacorriente inteligente': ['enchufe inteligente','smart plug'],
  'Mouse inalámbrico': ['mouse inalambrico'],
  'Teclado inalámbrico': ['teclado inalambrico'],
  'Soporte laptop': ['base laptop','stand laptop'],
  'Trípode mini': ['tripode mini'],
  'Kit limpieza pantalla': ['kit limpieza','limpiador pantalla'],
  'USB 256GB': ['usb 256'],
  'SSD Externo 500GB': ['ssd 500','ssd externo 500'],
  'SSD Externo 1TB': ['ssd 1tb','ssd externo 1tb'],
  'MicroSD 128GB': ['microsd 128'],
  'MicroSD 256GB': ['microsd 256'],
};

// ======== SISTEMA DE ANÁLISIS DE CONTEXTO ========
interface ContextAnalysis {
  intent: 'browsing' | 'purchase' | 'support' | 'unknown';
  urgency: 'low' | 'medium' | 'high';
  userMood: 'positive' | 'neutral' | 'negative';
  previousInteractions: number;
}

function isBusinessHours(date = new Date()) {
const h = date.getHours();
// Ejemplo: 8:00–18:00
return h >= 8 && h < 18;
}

async function analyzeContext(ctx: ExtendedContext, session: any): Promise<ContextAnalysis> {
  const message = (ctx.body || '').toLowerCase();
  const interactions = session.interactionCount || 0;
  
  let intent: ContextAnalysis['intent'] = 'unknown';
  let urgency: ContextAnalysis['urgency'] = 'low';
  let userMood: ContextAnalysis['userMood'] = 'neutral';

  // Detección de intención
  if (message.includes('comprar') || message.includes('precio') || message.includes('cuánto') || 
      message.includes('cuesta') || message.includes('stock')) {
    intent = 'purchase';
  } else if (message.includes('ayuda') || message.includes('soporte') || message.includes('problema')) {
    intent = 'support';
  } else if (message.includes('ver') || message.includes('catalogo') || message.includes('productos')) {
    intent = 'browsing';
  }

  // Detección de urgencia
  if (message.includes('urgente') || message.includes('rápido') || message.includes('ya')) {
    urgency = 'high';
  } else if (message.includes('hoy') || message.includes('pronto')) {
    urgency = 'medium';
  }

  // Análisis de sentimiento básico
  const positiveWords = ['gracias', 'excelente', 'genial', 'perfecto', 'bueno'];
  const negativeWords = ['mal', 'problema', 'error', 'decepcionado', 'molesto'];
  
  if (positiveWords.some(word => message.includes(word))) {
    userMood = 'positive';
  } else if (negativeWords.some(word => message.includes(word))) {
    userMood = 'negative';
  }

  return { intent, urgency, userMood, previousInteractions: interactions };
}

// ======== SISTEMA DE MENSAJES PERSUASIVOS ========
function generatePersuasiveMessage(type: 'welcome' | 'productAdded' | 'category' | 'checkout' | 'error', data?: any): string {
  const messages = {
    welcome: [
      `🌟 ¡Hola! Soy tu asistente de TechAura. ¿Listo para encontrar los mejores accesorios tecnológicos?`,
      `🚀 Bienvenido a TechAura - Donde la tecnología encuentra su mejor versión. ¿En qué te puedo ayudar hoy?`,
      `¡Hola! 👋 Veo que te interesa la tecnología. Tenemos los accesorios más innovadores del mercado.`
    ],
    productAdded: [
      `🎉 ¡Excelente elección! "${data.product}" agregado a tu carrito. ¿Sabías que este producto tiene garantía de 12 meses?`,
      `✅ ¡Listo! "${data.product}" está en tu carrito. Nuestros clientes aman este producto ⭐⭐⭐⭐⭐`,
      `🔥 ¡Gran selección! "${data.product}" añadido. ¿Necesitas algo más para complementarlo?`
    ],
    category: [
      `📦 Explorando ${data.category}: Encontramos los mejores productos para ti...`,
      `🔍 En la categoría ${data.category}: Productos cuidadosamente seleccionados para calidad garantizada`,
      `💡 ${data.category}: Descubre por qué nuestros clientes prefieren estos productos`
    ],
    checkout: [
      `🎊 ¡Fantástico! Estás a un paso de tener tus productos. ¿Cómo prefieres pagar?`,
      `🚚 ¡Excelente decision! Tu pedido está casi listo. Elige tu método de pago favorito`,
      `💰 Momento de pagar: Transferencia, Nequi o contraentrega - tú decides con total seguridad`
    ],
    error: [
      `🤔 No estoy seguro de entender. ¿Podrías decirlo de otra manera?`,
      `💡 Tip: Puedes decir "menú" para ver categorías o el nombre de un producto específico`,
      `🔍 No encontré eso en nuestro catálogo. ¿Quieres que te ayude a explorar nuestras categorías?`
    ]
  };

  const selectedMessages = messages[type];
  return selectedMessages[Math.floor(Math.random() * selectedMessages.length)];
}

// ======== HELPERS MEJORADOS ========
function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function badgeLine() {
  return '✅ Garantía 12 meses • 🚚 Envío en 24h • 💬 Soporte premium';
}

function renderHero() {
  return [
    '🛍️ TechAura - Tecnología con Confianza',
    badgeLine(),
    '✨ Productos testados y aprobados por expertos',
    IMAGE_HERO ? '(Imagen destacada disponible)' : ''
  ].filter(Boolean).join('\n');
}

function renderCarouselCategories() {
  const slides = TECH_CATEGORIES.map((c, index) => 
    `${index + 1}. ${c.label} - "${c.key}"` + (IMAGE_CATEGORY[c.key] ? ' 📸' : '')
  );
  return [
    '🌈 Nuestras categorías premium:',
    ...slides,
    '',
    '💡 Tip: Escribe el número o nombre de la categoría que más te interese',
    '🎯 Ejemplo: "1" o "memorias" para ver almacenamiento'
  ].join('\n');
}

function renderCategoryList() {
  return [
    renderHero(),
    '',
    '¿Qué tipo de accesorios te interesa hoy?',
    renderCarouselCategories()
  ].join('\n');
}

function renderItemsFor(categoryKey: string) {
  const cat = TECH_CATEGORIES.find(c => c.key === categoryKey);
  if (!cat) return '⚠️ Categoría no encontrada. ¿Podrías intentar con otra?';
  
  const lines = cat.items.map((item) => {
    const price = PRICE_MAP[item] || 'Consultar precio';
    const stock = STOCK[item]?.qty;
    const lead = STOCK[item]?.leadDays ? ` ⏰ (disponible en ${STOCK[item]?.leadDays} día${STOCK[item]?.leadDays!>1?'s':''})` : '';
    const stockText = typeof stock === 'number' ? 
      (stock > 15 ? '✅ En stock' : stock > 5 ? `⚠️ Últimas ${stock} unidades` : `🚨 Solo ${stock} left!`) : 
      '📦 Disponible';
    const img = IMAGE_ITEM[item] ? ' 📸' : '';
    return `• ${item} — ${price} • ${stockText}${lead}${img}`;
  });
  
  return [
    `🎯 ${cat.label}`,
    `📝 ${cat.description}`,
    ...lines,
    '',
    badgeLine(),
    '💬 Para agregar: escribe el nombre completo del producto',
    '↩️ Para volver: escribe "volver" o "menú"'
  ].join('\n');
}

function matchProduct(input: string): string | undefined {
  const n = normalize(input);
  
  // Búsqueda exacta primero
  for (const item of Object.keys(PRICE_MAP)) {
    if (normalize(item) === n) return item;
  }
  
  // Búsqueda parcial
  for (const item of Object.keys(PRICE_MAP)) {
    if (n.includes(normalize(item))) return item;
  }
  
  // Aliases
  for (const [item, aliases] of Object.entries(ALIAS)) {
    if (aliases.some(a => n === normalize(a))) return item;
    if (aliases.some(a => n.includes(normalize(a)))) return item;
  }
  
  return undefined;
}

function detectCategory(input: string): string | null {
  const norm = normalize(input);
  const direct = TECH_CATEGORIES.find(c => norm === normalize(c.key));
  if (direct) return direct.key;
  
  const partial = TECH_CATEGORIES.find(c => norm.includes(normalize(c.key)));
  if (partial) return partial.key;
  
  const numeric = parseInt(norm, 10);
  if (!isNaN(numeric) && numeric >= 1 && numeric <= TECH_CATEGORIES.length) {
    return TECH_CATEGORIES[numeric - 1].key;
  }
  
  return null;
}

function getBundleSuggestion(items: Array<{ name: string }>): { text: string; suggestions: string[]; discount?: number } | null {
  const names = new Set(items.map(i => i.name));
  for (const rule of BUNDLE_RULES) {
    if (rule.ifIncludes.some(req => names.has(req))) {
      return { 
        text: rule.message, 
        suggestions: rule.suggest,
        discount: rule.discount
      };
    }
  }
  return null;
}

// ======== FLOW PRINCIPAL MEJORADO ========
const menuTech = addKeyword(['tecnologia','accesorios','cables','power','audifonos','audífonos','proteccion','protección','memorias','adaptador','hub','hdmi','ssd','microsd','tech'])
.addAction(async (ctx: ExtendedContext, { flowDynamic, state }) => {
  // Verificar horario comercial
  if (!isBusinessHours()) {
    await flowDynamic([
      '🌙 Gracias por tu mensaje. Actualmente estamos fuera de horario comercial (8AM-6PM).',
      'Te responderemos tan pronto como volvamos. ¡Buen descanso!'
    ]);
    return;
  }

  const session = await getUserSession(ctx.from);
  const contextAnalysis = await analyzeContext(ctx, session);
  
  await updateUserSession(ctx.from, ctx.body, 'catalogFlow', 'tech_catalog', false, { 
    metadata: { 
      category: 'tech',
      context: contextAnalysis
    } 
  });

  // Mensaje personalizado según análisis de contexto
  let welcomeMessage = generatePersuasiveMessage('welcome');
  if (contextAnalysis.userMood === 'positive') {
    welcomeMessage = '😊 ¡Me encanta tu entusiasmo! Veo que estás de buen humor. ¿En qué te puedo ayudar hoy?';
  } else if (contextAnalysis.userMood === 'negative') {
    welcomeMessage = '🤗 Lamento escuchar que algo no va bien. Estoy aquí para ayudarte a encontrar exactamente lo que necesitas.';
  }

  const intro = [
    welcomeMessage,
    '',
    renderHero(),
    '',
    'Elegimos cada producto pensando en tu satisfacción y durabilidad.',
    renderCarouselCategories()
  ].join('\n');

  if (canSendOnce(session, 'tech_menu_intro', 12)) {
    await flowDynamic([intro]);
  } else {
    await flowDynamic([renderCategoryList()]);
  }
})
.addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic, state }) => {
  const session = await getUserSession(ctx.from);
  const msg = (ctx.body || '').trim();
  const contextAnalysis = await analyzeContext(ctx, session);

  // Manejar estados emocionales
  if (contextAnalysis.userMood === 'negative') {
    await flowDynamic([
      '🤗 Entiendo que puedas estar frustrado. Permíteme ayudarte a encontrar exactamente lo que necesitas.',
      '¿Podrías contarme más sobre lo que buscas?'
    ]);
    return;
  }

  // Detección de categoría mejorada
  const cat = detectCategory(msg);
  if (cat) {
    await updateUserSession(ctx.from, msg, 'catalogFlow', `tech_${cat}`, false, { 
      metadata: { category: cat, context: contextAnalysis } 
    });
    
    const categoryMessage = generatePersuasiveMessage('category', { category: TECH_CATEGORIES.find(c => c.key === cat)?.label });
    await flowDynamic([categoryMessage]);
    await flowDynamic([renderItemsFor(cat)]);
    return;
  }

  // Comandos de navegación
  if (/volver|atras|atrás|menu|menú|inicio|home/i.test(msg)) {
    await flowDynamic(['↩️ Volviendo al menú principal...']);
    await flowDynamic([renderCategoryList()]);
    return;
  }

  if (/ayuda|soporte|asistencia/i.test(msg)) {
    await flowDynamic([
      '🛟 ¡Claro! Estoy aquí para ayudarte:',
      '• Escribe el nombre de una categoría o producto',
      '• Usa "menú" para ver todas las opciones',
      '• "Pagar" para finalizar tu compra',
      '• ¿Necesitas algo específico? ¡Dímelo!'
    ]);
    return;
  }

  // Detección de producto
  const chosen = matchProduct(msg);
  if (chosen) {
    const price = PRICE_MAP[chosen] || 'Consultar';
    const currentStock = typeof STOCK[chosen]?.qty === 'number' ? STOCK[chosen].qty : 99;
    
    if (currentStock <= 0) {
      await flowDynamic([
        `⚠️ Lamentablemente "${chosen}" está agotado temporalmente.`,
        '¿Te gustaría:',
        '1. Que te avise cuando llegue nuevo stock',
        '2. Ver productos similares disponibles',
        '3. Explorar otras categorías'
      ]);
      return;
    }

    // Actualizar sesión con el producto
    session.orderData = session.orderData || { items: [], status: 'draft', totalPrice: 0 };
    session.orderData.items.push({
      id: `TECH-${Date.now()}`,
      productId: `TECH-${chosen.replace(/\s+/g,'_').toUpperCase()}`,
      name: chosen,
      price: Number((price.match(/\d+/g) || ['0']).join('')) || 0,
      quantity: 1,
      unitPrice: Number((price.match(/\d+/g) || ['0']).join('')) || 0
    });
    session.orderData.totalPrice = session.orderData.items.reduce((sum, item) => sum + item.price, 0);

    await updateUserSession(ctx.from, `added_${chosen}`, 'catalogFlow', 'tech_item_added', false, { 
      metadata: { product: chosen, price, context: contextAnalysis } 
    });

    // Upsell inteligente basado en contexto
    const bundle = getBundleSuggestion(session.orderData.items);
    const upsellMessage = bundle ? [
      `🎁 ${bundle.text}`,
      `💡 Sugiero: ${bundle.suggestions.join(' • ')}`,
      `💰 Ahorro estimado: ${bundle.discount}% en el combo`
    ] : [
      '💡 Tip: ¿Necesitas un cable o protección para tu nuevo producto?',
      '¡Tenemos accesorios perfectamente compatibles!'
    ];

    await flowDynamic([generatePersuasiveMessage('productAdded', { product: chosen })]);
    await flowDynamic(upsellMessage);
    await flowDynamic([
      '',
      '🛒 Tu carrito:',
      ...session.orderData.items.map((item: any, index: number) => 
        `${index + 1}. ${item.name} - ${PRICE_MAP[item.name]}`),
      `💵 Total: $${session.orderData.totalPrice.toLocaleString()}`,
      '',
      '📋 Opciones:',
      '• "Seguir" para más productos',
      '• "Pagar" para finalizar',
      '• "Carrito" para ver tu selección',
      '• "Menú" para categorías'
    ].join('\n'));
    return;
  }

  // Comando de pago
  if (/pagar|checkout|finalizar|confirmar|comprar|carrito/i.test(msg)) {
    if (!session.orderData?.items?.length) {
      await flowDynamic([
        '🛒 Tu carrito está vacío.',
        '¿Te gustaría explorar nuestras categorías para encontrar algo?',
        renderCarouselCategories()
      ]);
      return;
    }

    await flowDynamic([generatePersuasiveMessage('checkout')]);
    await flowDynamic([
      '💳 Métodos de pago disponibles:',
      '• Transferencia bancaria',
      '• Nequi/Daviplata',
      '• Contraentrega',
      '',
      '🚚 Envío gratis en compras mayores a $100.000',
      '⏰ Tiempo de entrega: 24-48 horas'
    ]);
    
    await updateUserSession(ctx.from, 'tech_checkout', 'orderFlow', 'payment_flow', false, { 
      metadata: { origin: 'menuTech', context: contextAnalysis } 
    });
    return;
  }

  // Fallback contextual y persuasivo
  const errorResponse = [
    generatePersuasiveMessage('error'),
    '',
    '🎯 Para ayudarte mejor:',
    '• ¿Buscas algo específico? Dime el nombre',
    '• ¿Quieres ver categorías? Escribe "menú"',
    '• ¿Necesitas ayuda? Escribe "ayuda"',
    '',
    '💡 Ejemplos: "USB 64GB", "cargador", "memorias"'
  ].join('\n');

  await flowDynamic([errorResponse]);
});

export default menuTech;
