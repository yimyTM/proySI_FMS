import { API_URL } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  return typeof window !== "undefined"
    ? (localStorage.getItem("token") ?? "")
    : "";
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(
      err.error || err.message || `Error ${res.status}`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => apiRequest<T>("GET", path);
const post = <T>(path: string, body: unknown) =>
  apiRequest<T>("POST", path, body);

export const entregasApi = {
  listarMisCursos: () =>
    get<{ cursos: EntregaCurso[] }>("/api/entregas/mis-cursos").then(
      (r) => r.cursos,
    ),

  listarEstudiantes: (idCurso: number) =>
    get<{ estudiantes: EntregaEstudiante[] }>(
      `/api/entregas/cursos/${idCurso}/estudiantes`,
    ).then((r) => r.estudiantes),

  listarEntregasRegistradas: (idCurso: number) =>
    get<{ entregas: EntregaRegistro[] }>(
      `/api/entregas/cursos/${idCurso}/registradas`,
    ).then((r) => r.entregas),

  listarTutoresAutorizados: (idEstudiante: number) =>
    get<{ tutores: TutorAutorizado[] }>(
      `/api/entregas/estudiantes/${idEstudiante}/tutores-autorizados`,
    ).then((r) => r.tutores),

  // GET /api/entregas  (vista administrativa: SuperUsuario, Director, Administrativo)
  listarTodas: (params?: { fecha?: string }) => {
    const qs = params?.fecha
      ? `?fecha=${encodeURIComponent(params.fecha)}`
      : "";
    return get<{ entregas: EntregaListItem[] }>(`/api/entregas${qs}`).then(
      (r) => r.entregas,
    );
  },

  registrar: (data: RegistrarEntregaPayload) =>
    post<{
      mensaje: string;
      entrega: { id_entrega: number; fecha_hora_entrega: string };
    }>("/api/entregas", data),
};

export interface EntregaCurso {
  id_curso: number;
  paralelo: string;
  turno: string;
  nombre_grado: string;
  nombre_nivel: string;
  anio: number;
}

export interface EntregaEstudiante {
  id_estudiante: number;
  nombre: string;
  apellido: string;
  ci: string | null;
}

export interface TutorAutorizado {
  id_tutor: number;
  nombre: string;
  apellido: string;
  ci: string | null;
  parentesco: string;
}

export interface RegistrarEntregaPayload {
  id_estudiante: number;
  id_tutor: number;
  observaciones?: string;
}

export interface EntregaRegistro {
  id_entrega: number;
  id_estudiante: number;
  id_tutor: number;
  fecha_hora_entrega: string;
  observaciones: string | null;
  tutor_nombre: string;
  tutor_apellido: string;
  parentesco: string | null;
}

// Item del listado administrativo global de entregas.
export interface EntregaListItem {
  id_entrega: number;
  fecha_hora_entrega: string;
  observaciones: string | null;
  id_estudiante: number;
  estudiante_nombre: string;
  estudiante_apellido: string;
  estudiante_ci: string | null;
  id_tutor: number;
  tutor_nombre: string;
  tutor_apellido: string;
  parentesco: string | null;
  id_docente: number;
  docente_username: string;
  docente_nombre: string | null;
  docente_apellido: string | null;
  id_curso: number | null;
  nombre_grado: string | null;
  paralelo: string | null;
  turno: string | null;
}
