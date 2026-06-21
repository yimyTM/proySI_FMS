require("dotenv").config();
const transporter = require("./src/config/mailer"); // 👈 Importa tu config

async function testMail() {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "un-correo-de-prueba@gmail.com", // Cámbialo por un correo real
      subject: "Prueba de Nodemailer",
      text: "Si ves esto, ¡el envío funciona correctamente!",
    });
    console.log("✅ Correo enviado con éxito");
    console.log("📧 ID del mensaje:", info.messageId);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testMail();
