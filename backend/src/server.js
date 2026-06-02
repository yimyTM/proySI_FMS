const express = require("express");
const cors = require("cors");
require("dotenv").config();
const pool = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const profesorRoutes = require("./routes/profesorRoutes");
const gestionRoutes = require("./routes/gestionRoutes");
const estructuraRoutes = require("./routes/estructuraRoutes");
const materiaRoutes = require("./routes/materiaRoutes");
const horarioRoutes = require("./routes/horarioRoutes");
const estudianteRoutes = require("./routes/estudianteRoutes");
const tutorRoutes = require("./routes/tutorRoutes");
const inscripcionRoutes = require("./routes/inscripcionRoutes");
const expedienteRoutes = require("./routes/expedienteRoutes");
const bitacoraRoutes = require("./routes/bitacoraRoutes");
const seguridadRoutes = require("./routes/seguridadRoutes");
const asistenciaRoutes = require("./routes/asistenciaRoutes");
const pagoRoutes = require("./routes/pagoRoutes");
const inventarioRoutes = require("./routes/inventarioRoutes");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://proyectosi1-rhk7cxxko-pierreelpro19-gmailcoms-projects.vercel.app",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("No permitido por CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/profesores", profesorRoutes);
app.use("/api/gestiones", gestionRoutes);
app.use("/api/estructura", estructuraRoutes);
app.use("/api/materias", materiaRoutes);
app.use("/api/curso", require("./routes/cursoRoutes"));
app.use("/api/materia-asig", require("./routes/materiaAsigRoutes"));
app.use("/api/horarios", horarioRoutes);
app.use("/api/estudiantes", estudianteRoutes);
app.use("/api/tutores", tutorRoutes);
app.use("/api/inscripciones", inscripcionRoutes);
app.use("/api/expedientes", expedienteRoutes);
app.use("/api/bitacora", bitacoraRoutes);
app.use("/api/seguridad", seguridadRoutes);
app.use("/api/asistencias", asistenciaRoutes);
app.use("/api/pagos", pagoRoutes);
app.use("/api/inventario", inventarioRoutes);

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Conectado a PostgreSQL");

    const server = app.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
    });

    server.on("error", (error) => {
      console.error("❌ Error al iniciar el servidor:", error);
    });
  } catch (error) {
    console.error("❌ Error conectando a la BD:", error);
    process.exit(1);
  }
};

startServer();
