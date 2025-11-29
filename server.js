import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';

const app = express();

app.use(cors({
origin: ['https://techauraz.com', 'https://techauraz.com/pages/usb-al-gusto'],
methods: ['POST'],
allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '200kb' }));

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

function sanitize(str = '') {
return String(str).trim().replace(/\s+/g,' ').slice(0,500);
}

app.post('/api/pedidos', async (req, res) => {
try {
const {
usbCapacity, usbPrice,
name, phone, department, city,
address, neighborhood, house, email,
selectedContent
} = req.body || {};
// Validaciones básicas
if (!usbCapacity || !usbPrice || !name || !phone || !department || !city || !address || !neighborhood || !house) {
  return res.status(400).json({ ok:false, error:'Faltan campos obligatorios' });
}

// Parsear contenido seleccionado
let parsedContent = {};
if (selectedContent) {
  try { parsedContent = JSON.parse(selectedContent); } catch(e){ parsedContent = {}; }
}

const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
const ua = req.headers['user-agent'];

// Insertar en DB
const conn = await pool.getConnection();
try {
  const sql = `
    INSERT INTO usb_orders
    (usb_capacity, usb_price, name, phone, department, city, address, neighborhood, house, email, selected_content, ip_address, user_agent)
    VALUES (?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON),?,?)
  `;
  await conn.execute(sql, [
    sanitize(usbCapacity),
    parseInt(usbPrice,10),
    sanitize(name),
    sanitize(phone),
    sanitize(department),
    sanitize(city),
    sanitize(address),
    sanitize(neighborhood),
    sanitize(house),
    email ? sanitize(email) : null,
    JSON.stringify(parsedContent),
    sanitize(ip || ''),
    sanitize(ua || '')
  ]);
} finally {
  conn.release();
}

// Preparar resumen para correo
const contentLines = Object.entries(parsedContent).map(([k,v]) => `${k}: ${v||'(variado)'}`).join('\n');
const mailHtml = `
  <h2>Nuevo pedido USB</h2>
  <p><strong>Capacidad:</strong> ${usbCapacity}</p>
  <p><strong>Precio:</strong> $${Number(usbPrice).toLocaleString('es-CO')} COP</p>
  <h3>Cliente</h3>
  <p>${name} - ${phone}</p>
  <p>${address}, ${neighborhood}, ${house}, ${city}, ${department}</p>
  <p>Email: ${email || '(no proporcionado)'}</p>
  <h3>Contenido solicitado</h3>
  <pre style="background:#f5f5f5;padding:10px;border:1px solid #ddd;">${contentLines || 'N/A'}</pre>
  <p style="font-size:12px;color:#666;">IP: ${ip} | UA: ${ua}</p>
`;

await transporter.sendMail({
  from: `"Pedidos USB" <${process.env.MAIL_USER}>`,
  to: 'blasterm236@gmail.com',
  subject: `Nuevo pedido USB ${usbCapacity} - $${Number(usbPrice).toLocaleString('es-CO')} COP`,
  html: mailHtml
});

return res.json({ ok:true });
} catch (err) {
console.error(err);
return res.status(500).json({ ok:false, error:'Error interno' });
}
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log('API pedidos escuchando en puerto '+PORT));