import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

app.use(cors({
origin: ['https://techauraz.com', 'https://techauraz.com/pages/usb-al-gusto'],
methods: ['POST'],
allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '200kb' }));

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:', missingVars.join(', '));
  console.error('   Please configure these variables in your .env file');
  process.exit(1);
}

// Pool MySQL
const pool = mysql.createPool({
host: process.env.DB_HOST,
user: process.env.DB_USER,
password: process.env.DB_PASS,
database: process.env.DB_NAME,
waitForConnections: true,
connectionLimit: 5,
namedPlaceholders: true
});

// Transport para correo (Gmail con App Password o usa SendGrid/Mailgun)
const transporter = nodemailer.createTransport({
service: 'gmail',
auth: {
user: process.env.MAIL_USER,      // tu correo remitente
pass: process.env.MAIL_PASS       // App Password (NO tu clave normal)
}
});

// ========================================
// VALIDATION & NORMALIZATION FUNCTIONS
// ========================================

/**
 * Normalize text: trim and collapse spaces
 */
function normalizeText(str = '') {
  return String(str).trim().replace(/\s+/g, ' ').slice(0, 500);
}

/**
 * Normalize phone number (remove spaces, dashes, parentheses, plus sign)
 */
function normalizePhone(phone = '') {
  const cleaned = String(phone).replace(/[\s\-\(\)\+]/g, '');
  // Colombia: if 10 digits and doesn't start with 57, add 57
  if (cleaned.length === 10 && !cleaned.startsWith('57')) {
    return '57' + cleaned;
  }
  return cleaned;
}

/**
 * Validate and normalize USB order data
 */
function validateUsbOrder(data) {
  const errors = [];
  const normalized = {};
  
  // Valid capacities
  const validCapacities = ['8GB', '16GB', '32GB', '64GB', '128GB', '256GB', '512GB'];
  
  // Validate capacity
  if (!data.usbCapacity) {
    errors.push({ field: 'usbCapacity', message: 'USB capacity is required' });
  } else {
    const capacity = String(data.usbCapacity).trim().toUpperCase();
    if (!validCapacities.includes(capacity)) {
      errors.push({ field: 'usbCapacity', message: `Invalid capacity. Must be one of: ${validCapacities.join(', ')}` });
    } else {
      normalized.usbCapacity = capacity;
    }
  }
  
  // Validate price
  const price = parseInt(data.usbPrice, 10);
  if (!data.usbPrice || isNaN(price) || price < 1000) {
    errors.push({ field: 'usbPrice', message: 'Valid price is required (minimum 1000)' });
  } else {
    normalized.usbPrice = price;
  }
  
  // Validate name
  if (!data.name || normalizeText(data.name).length < 2) {
    errors.push({ field: 'name', message: 'Valid name is required (minimum 2 characters)' });
  } else {
    normalized.name = normalizeText(data.name);
  }
  
  // Validate phone
  const phoneNormalized = normalizePhone(data.phone);
  if (!data.phone || (phoneNormalized.length !== 10 && phoneNormalized.length !== 12)) {
    errors.push({ field: 'phone', message: 'Valid phone number is required' });
  } else {
    normalized.phone = phoneNormalized;
  }
  
  // Validate email (optional)
  if (data.email) {
    const email = String(data.email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    } else {
      normalized.email = email;
    }
  }
  
  // Validate address fields
  const addressFields = ['department', 'city', 'address', 'neighborhood', 'house'];
  for (const field of addressFields) {
    if (!data[field] || normalizeText(data[field]).length === 0) {
      errors.push({ field, message: `${field} is required` });
    } else {
      normalized[field] = normalizeText(data[field]);
    }
  }
  
  // Parse selected content
  if (data.selectedContent) {
    try {
      normalized.selectedContent = typeof data.selectedContent === 'string' 
        ? JSON.parse(data.selectedContent) 
        : data.selectedContent;
    } catch (e) {
      errors.push({ field: 'selectedContent', message: 'Invalid JSON format' });
    }
  } else {
    normalized.selectedContent = {};
  }
  
  return { valid: errors.length === 0, errors, data: normalized };
}

app.post('/api/pedidos', async (req, res) => {
try {
// Validate and normalize input
const validation = validateUsbOrder(req.body || {});

if (!validation.valid) {
  return res.status(400).json({ 
    ok: false, 
    error: 'Validation failed', 
    details: validation.errors 
  });
}

const data = validation.data;

const data = validation.data;

// Parsear contenido seleccionado
const parsedContent = data.selectedContent;

const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
const ua = req.headers['user-agent'];

// Insertar en DB con datos validados y normalizados
const conn = await pool.getConnection();
try {
  const sql = `
    INSERT INTO usb_orders
    (usb_capacity, usb_price, name, phone, department, city, address, neighborhood, house, email, selected_content, ip_address, user_agent)
    VALUES (?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON),?,?)
  `;
  await conn.execute(sql, [
    data.usbCapacity,
    data.usbPrice,
    data.name,
    data.phone,
    data.department,
    data.city,
    data.address,
    data.neighborhood,
    data.house,
    data.email || null,
    JSON.stringify(parsedContent),
    ip || '',
    ua || ''
  ]);
  
  console.log(`✅ Pedido registrado: ${data.name} - ${data.phone} - ${data.usbCapacity}`);
} finally {
  conn.release();
}

// Preparar resumen para correo
const contentLines = Object.entries(parsedContent).map(([k,v]) => `${k}: ${v||'(variado)'}`).join('\n');
const mailHtml = `
  <h2>Nuevo pedido USB</h2>
  <p><strong>Capacidad:</strong> ${data.usbCapacity}</p>
  <p><strong>Precio:</strong> $${Number(data.usbPrice).toLocaleString('es-CO')} COP</p>
  <h3>Cliente</h3>
  <p>${data.name} - ${data.phone}</p>
  <p>${data.address}, ${data.neighborhood}, ${data.house}, ${data.city}, ${data.department}</p>
  <p>Email: ${data.email || '(no proporcionado)'}</p>
  <h3>Contenido solicitado</h3>
  <pre style="background:#f5f5f5;padding:10px;border:1px solid #ddd;">${contentLines || 'N/A'}</pre>
  <p style="font-size:12px;color:#666;">IP: ${ip} | UA: ${ua}</p>
`;

// Enviar correo solo si las credenciales están configuradas
if (process.env.MAIL_USER && process.env.MAIL_PASS) {
  try {
    await transporter.sendMail({
      from: `"Pedidos USB" <${process.env.MAIL_USER}>`,
      to: 'blasterm236@gmail.com',
      subject: `Nuevo pedido USB ${data.usbCapacity} - $${Number(data.usbPrice).toLocaleString('es-CO')} COP`,
      html: mailHtml
    });
    console.log('✅ Email de notificación enviado');
  } catch (emailError) {
    console.error('⚠️ Error enviando email:', emailError.message);
    // No fallar la request si el email falla
  }
} else {
  console.log('⚠️ Credenciales de email no configuradas, saltando envío de notificación');
}

return res.json({ ok:true });
} catch (err) {
console.error('❌ Error procesando pedido:', err);
return res.status(500).json({ ok:false, error:'Error interno del servidor' });
}
}
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log('API pedidos escuchando en puerto '+PORT));