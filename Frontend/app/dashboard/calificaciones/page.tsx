"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Plus,
  Save,
  ShieldAlert,
} from "lucide-react"
import { API_URL } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type MateriaAsignada = {
  id_curso_materia: number
  id_materia: number
  nombre_materia: string
}

type Curso = {
  id_curso: number
  nombre_nivel: string
  nombre_grado: string
  paralelo: string
  turno: string
  materias: MateriaAsignada[]
}

type Dimension = {
  id_dimension_eval: number
  nombre_dimension: string
  puntaje_maximo: string | number
}

type Actividad = {
  id_actividad: number
  id_dimension_eval: number
  trimestre: number
  nombre_actividad: string
  fecha_actividad?: string | null
  valor_maximo: string | number
  nombre_dimension: string
  puntaje_maximo: string | number
}

type ContextoResponse = {
  gestion: { id_gestion: number; anio: number }
  cursos: Curso[]
}

type ActividadesResponse = {
  contexto: {
    nombre_nivel: string
    nombre_grado: string
    paralelo: string
    turno: string
    nombre_materia: string
  }
  trimestre: number
  trimestre_abierto: boolean
  motivo_bloqueo?: string | null
  dimensiones: Dimension[]
  actividades: Actividad[]
}

type CalificacionRow = {
  id_estudiante: number
  nombre: string
  apellido: string
  ci?: string | null
  estado: string
  id_calificacion?: number | null
  nota?: string | number | null
  fecha_evaluacion?: string | null
  observaciones?: string | null
  bloqueado: boolean
}

type CalificacionesResponse = {
  actividad: Actividad & {
    nombre_materia: string
    nombre_nivel: string
    nombre_grado: string
    paralelo: string
    turno: string
  }
  trimestre_abierto: boolean
  motivo_bloqueo?: string | null
  estudiantes: CalificacionRow[]
}

const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
})

const today = new Date().toISOString().slice(0, 10)

export default function CalificacionesPage() {
  const [contexto, setContexto] = useState<ContextoResponse | null>(null)
  const [idCurso, setIdCurso] = useState("")
  const [idCursoMateria, setIdCursoMateria] = useState("")
  const [trimestre, setTrimestre] = useState("1")
  const [dimensiones, setDimensiones] = useState<Dimension[]>([])
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [trimestreAbierto, setTrimestreAbierto] = useState(true)
  const [motivoBloqueo, setMotivoBloqueo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedActividadId, setSelectedActividadId] = useState<number | null>(null)
  const [actividadCalificacion, setActividadCalificacion] = useState<CalificacionesResponse["actividad"] | null>(null)
  const [calificaciones, setCalificaciones] = useState<CalificacionRow[]>([])
  const [calificacionesOriginales, setCalificacionesOriginales] = useState<Map<number, string>>(new Map())
  const [loadingCalificaciones, setLoadingCalificaciones] = useState(false)
  const [savingCalificaciones, setSavingCalificaciones] = useState(false)
  const [motivoModificacion, setMotivoModificacion] = useState("")
  const [gradeErrors, setGradeErrors] = useState<Record<number, boolean>>({})
  const [form, setForm] = useState({
    nombre_actividad: "",
    fecha_actividad: today,
    id_dimension_eval: "",
    valor_maximo: "",
  })

  const cursoSeleccionado = contexto?.cursos.find((curso) => String(curso.id_curso) === idCurso)
  const materiaSeleccionada = cursoSeleccionado?.materias.find(
    (materia) => String(materia.id_curso_materia) === idCursoMateria,
  )
  const dimensionSeleccionada = dimensiones.find(
    (dimension) => String(dimension.id_dimension_eval) === form.id_dimension_eval,
  )

  const tieneModificaciones = useMemo(
    () =>
      calificaciones.some((row) => {
        if (!row.id_calificacion) return false
        const actual = row.nota === null || row.nota === undefined ? "" : String(row.nota)
        return actual !== (calificacionesOriginales.get(row.id_estudiante) || "")
      }),
    [calificaciones, calificacionesOriginales],
  )

  const cursosConMaterias = useMemo(
    () => contexto?.cursos.filter((curso) => curso.materias.length > 0) || [],
    [contexto],
  )

  const loadContexto = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/actividades/contexto`, { headers: getHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al cargar contexto")
      setContexto(data)

      const firstCurso = data.cursos?.find((curso: Curso) => curso.materias.length > 0)
      if (firstCurso) {
        setIdCurso(String(firstCurso.id_curso))
        setIdCursoMateria(String(firstCurso.materias[0].id_curso_materia))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar contexto")
      setContexto(null)
    }
  }, [])

  const loadActividades = useCallback(async () => {
    if (!idCursoMateria) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        id_curso_materia: idCursoMateria,
        trimestre,
      })
      const res = await fetch(`${API_URL}/api/actividades?${params}`, { headers: getHeaders() })
      const data: ActividadesResponse & { message?: string } = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al cargar actividades")
      setDimensiones(data.dimensiones)
      setActividades(data.actividades)
      setTrimestreAbierto(data.trimestre_abierto)
      setMotivoBloqueo(data.motivo_bloqueo || null)
      setForm((prev) => ({
        ...prev,
        id_dimension_eval: prev.id_dimension_eval || String(data.dimensiones[0]?.id_dimension_eval || ""),
        valor_maximo: prev.valor_maximo || String(data.dimensiones[0]?.puntaje_maximo || ""),
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar actividades")
      setDimensiones([])
      setActividades([])
      setTrimestreAbierto(false)
      setMotivoBloqueo(null)
    } finally {
      setLoading(false)
    }
  }, [idCursoMateria, trimestre])

  const loadCalificaciones = useCallback(async (idActividad: number) => {
    setSelectedActividadId(idActividad)
    setLoadingCalificaciones(true)
    setGradeErrors({})
    try {
      const res = await fetch(`${API_URL}/api/calificaciones/actividad/${idActividad}`, { headers: getHeaders() })
      const data: CalificacionesResponse & { message?: string } = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al cargar calificaciones")

      const rows = data.estudiantes.map((row) => ({
        ...row,
        nota: row.nota === null || row.nota === undefined ? "" : String(row.nota),
        observaciones: row.observaciones || "",
      }))
      setActividadCalificacion(data.actividad)
      setCalificaciones(rows)
      setCalificacionesOriginales(
        new Map(rows.map((row) => [row.id_estudiante, row.nota === null || row.nota === undefined ? "" : String(row.nota)])),
      )
      setMotivoModificacion("")
      if (!data.trimestre_abierto) {
        setTrimestreAbierto(false)
        setMotivoBloqueo(data.motivo_bloqueo || "El trimestre está cerrado o la libreta fue aprobada")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar calificaciones")
      setActividadCalificacion(null)
      setCalificaciones([])
    } finally {
      setLoadingCalificaciones(false)
    }
  }, [])

  useEffect(() => {
    loadContexto()
  }, [loadContexto])

  useEffect(() => {
    loadActividades()
  }, [loadActividades])

  useEffect(() => {
    setSelectedActividadId(null)
    setActividadCalificacion(null)
    setCalificaciones([])
    setMotivoModificacion("")
    setGradeErrors({})
  }, [idCursoMateria, trimestre])

  useEffect(() => {
    if (!dimensionSeleccionada) return
    setForm((prev) => ({
      ...prev,
      valor_maximo: String(dimensionSeleccionada.puntaje_maximo),
    }))
  }, [dimensionSeleccionada?.id_dimension_eval])

  const saveActividad = async () => {
    if (!idCursoMateria) return
    if (!form.nombre_actividad.trim() || !form.id_dimension_eval || !form.valor_maximo) {
      toast.error("Todos los campos obligatorios deben ser completados")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/actividades`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          id_curso_materia: Number(idCursoMateria),
          id_dimension_eval: Number(form.id_dimension_eval),
          trimestre: Number(trimestre),
          nombre_actividad: form.nombre_actividad.trim(),
          fecha_actividad: form.fecha_actividad || null,
          valor_maximo: Number(form.valor_maximo),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al registrar actividad")
      toast.success(data.message || "Actividad registrada correctamente")
      setForm((prev) => ({ ...prev, nombre_actividad: "", fecha_actividad: today }))
      await loadActividades()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al registrar actividad")
    } finally {
      setSaving(false)
    }
  }

  const updateCalificacion = (idEstudiante: number, field: "nota" | "observaciones", value: string) => {
    setCalificaciones((prev) =>
      prev.map((row) => (row.id_estudiante === idEstudiante ? { ...row, [field]: value } : row)),
    )

    if (field === "nota" && actividadCalificacion) {
      const numericValue = value === "" ? null : Number(value)
      const invalid =
        numericValue !== null &&
        (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > Number(actividadCalificacion.valor_maximo))
      setGradeErrors((prev) => ({ ...prev, [idEstudiante]: invalid }))
    }
  }

  const saveCalificaciones = async () => {
    if (!selectedActividadId || !actividadCalificacion) return

    const hasErrors = Object.values(gradeErrors).some(Boolean)
    if (hasErrors) {
      toast.error(`Las notas deben estar entre 0 y ${Number(actividadCalificacion.valor_maximo)}`)
      return
    }

    if (tieneModificaciones && !motivoModificacion.trim()) {
      toast.error("El motivo de modificación es obligatorio para cambiar notas ya guardadas")
      return
    }

    setSavingCalificaciones(true)
    try {
      const res = await fetch(`${API_URL}/api/calificaciones/actividad/${selectedActividadId}`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          motivo_modificacion: motivoModificacion.trim(),
          calificaciones: calificaciones
            .filter((row) => !row.bloqueado)
            .map((row) => ({
              id_estudiante: row.id_estudiante,
              nota: row.nota === "" || row.nota === null || row.nota === undefined ? null : Number(row.nota),
              observaciones: row.observaciones || null,
            })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al guardar calificaciones")
      toast.success(data.message || "Calificaciones guardadas correctamente")
      await loadCalificaciones(selectedActividadId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar calificaciones")
    } finally {
      setSavingCalificaciones(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">CU18</Badge>
            <Badge variant="secondary">CU19</Badge>
            <Badge variant="outline">Registro Pedagógico</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Actividades y Calificaciones</h1>
          <p className="text-muted-foreground">
            Cree actividades y registre las notas individuales por estudiante.
          </p>
        </div>
        <Button className="gap-2" onClick={saveActividad} disabled={saving || !trimestreAbierto || !idCursoMateria}>
          <Save className="h-4 w-4" />
          Guardar actividad
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_180px_220px]">
        <Card>
          <CardContent className="grid gap-3 p-4">
            <Label>Curso</Label>
            <Select
              value={idCurso}
              onValueChange={(value) => {
                const curso = cursosConMaterias.find((item) => String(item.id_curso) === value)
                setIdCurso(value)
                setIdCursoMateria(String(curso?.materias[0]?.id_curso_materia || ""))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar curso" />
              </SelectTrigger>
              <SelectContent>
                {cursosConMaterias.map((curso) => (
                  <SelectItem key={curso.id_curso} value={String(curso.id_curso)}>
                    {curso.nombre_nivel} - {curso.nombre_grado} {curso.paralelo} · {curso.turno}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3 p-4">
            <Label>Materia</Label>
            <Select value={idCursoMateria} onValueChange={setIdCursoMateria}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar materia" />
              </SelectTrigger>
              <SelectContent>
                {cursoSeleccionado?.materias.map((materia) => (
                  <SelectItem key={materia.id_curso_materia} value={String(materia.id_curso_materia)}>
                    {materia.nombre_materia}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3 p-4">
            <Label>Trimestre</Label>
            <Select value={trimestre} onValueChange={setTrimestre}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Estado</p>
              {trimestreAbierto ? (
                <ClipboardList className="h-5 w-5 text-green-600" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              )}
            </div>
            <p className="mt-1 text-xl font-bold">{trimestreAbierto ? "Abierto" : "Cerrado"}</p>
            <p className="text-xs text-muted-foreground">{loading ? "Cargando..." : `${actividades.length} actividades`}</p>
          </CardContent>
        </Card>
      </div>

      {!trimestreAbierto ? (
        <Badge variant="destructive" className="w-fit">
          {motivoBloqueo || "El trimestre está cerrado o la libreta fue aprobada"}
        </Badge>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <CardTitle>Nueva Actividad</CardTitle>
            </div>
            <CardDescription>
              La actividad quedará disponible para registrar calificaciones individuales en CU19.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Nombre de la actividad</Label>
              <Input
                value={form.nombre_actividad}
                onChange={(event) => setForm((prev) => ({ ...prev, nombre_actividad: event.target.value }))}
                placeholder="Examen de lectura comprensiva"
                disabled={!trimestreAbierto}
              />
            </div>

            <div className="grid gap-2">
              <Label>Fecha de realización</Label>
              <Input
                type="date"
                value={form.fecha_actividad}
                onChange={(event) => setForm((prev) => ({ ...prev, fecha_actividad: event.target.value }))}
                disabled={!trimestreAbierto}
              />
            </div>

            <div className="grid gap-2">
              <Label>Dimensión</Label>
              <Select
                value={form.id_dimension_eval}
                onValueChange={(value) => setForm((prev) => ({ ...prev, id_dimension_eval: value }))}
                disabled={!trimestreAbierto}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar dimensión" />
                </SelectTrigger>
                <SelectContent>
                  {dimensiones.map((dimension) => (
                    <SelectItem key={dimension.id_dimension_eval} value={String(dimension.id_dimension_eval)}>
                      {dimension.nombre_dimension} ({Number(dimension.puntaje_maximo)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Valor máximo</Label>
              <Input
                type="number"
                min={1}
                max={Number(dimensionSeleccionada?.puntaje_maximo || 100)}
                value={form.valor_maximo}
                onChange={(event) => setForm((prev) => ({ ...prev, valor_maximo: event.target.value }))}
                disabled={!trimestreAbierto}
              />
              <p className="text-xs text-muted-foreground">
                No puede exceder el puntaje de la dimensión seleccionada.
              </p>
            </div>

            <Separator />

            <Button className="w-full gap-2" onClick={saveActividad} disabled={saving || !trimestreAbierto}>
              <Save className="h-4 w-4" />
              Guardar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Panel del Trimestre {trimestre}</CardTitle>
                <CardDescription>
                  {materiaSeleccionada ? materiaSeleccionada.nombre_materia : "Seleccione una materia"}
                </CardDescription>
              </div>
              <Badge variant={trimestreAbierto ? "default" : "destructive"}>
                {trimestreAbierto ? "Abierto" : "Bloqueado"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Actividad</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Dimensión</TableHead>
                    <TableHead>Valor máximo</TableHead>
                    <TableHead>Calificaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actividades.map((actividad) => (
                    <TableRow
                      key={actividad.id_actividad}
                      className={selectedActividadId === actividad.id_actividad ? "bg-primary/5" : ""}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-primary" />
                          <span className="font-medium">{actividad.nombre_actividad}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          {actividad.fecha_actividad || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{actividad.nombre_dimension}</TableCell>
                      <TableCell className="font-mono">{Number(actividad.valor_maximo)}</TableCell>
                      <TableCell>
                        <Button
                          variant={selectedActividadId === actividad.id_actividad ? "default" : "outline"}
                          size="sm"
                          className="gap-2"
                          onClick={() => loadCalificaciones(actividad.id_actividad)}
                        >
                          <GraduationCap className="h-4 w-4" />
                          Calificar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && actividades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No hay actividades registradas para este trimestre.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <CardTitle>Registrar Calificaciones</CardTitle>
                </div>
                <CardDescription>
                  {actividadCalificacion
                    ? `${actividadCalificacion.nombre_actividad} · ${actividadCalificacion.nombre_dimension} · máximo ${Number(actividadCalificacion.valor_maximo)}`
                    : "Seleccione una actividad para habilitar la lista de estudiantes."}
                </CardDescription>
              </div>
              <Button
                className="gap-2"
                onClick={saveCalificaciones}
                disabled={!selectedActividadId || savingCalificaciones || loadingCalificaciones || !trimestreAbierto}
              >
                <Save className="h-4 w-4" />
                Guardar calificaciones
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {tieneModificaciones ? (
              <div className="grid gap-2">
                <Label>Motivo de modificación</Label>
                <Textarea
                  value={motivoModificacion}
                  onChange={(event) => setMotivoModificacion(event.target.value)}
                  placeholder="Explique por qué se modifica una nota ya guardada"
                  rows={2}
                />
              </div>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estudiante</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-36">Nota</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead>Registro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calificaciones.map((row) => {
                    const invalid = Boolean(gradeErrors[row.id_estudiante])
                    return (
                      <TableRow key={row.id_estudiante}>
                        <TableCell>
                          <div className="font-medium">
                            {row.apellido} {row.nombre}
                          </div>
                          <div className="text-xs text-muted-foreground">{row.ci || "Sin CI"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.bloqueado ? "destructive" : "outline"}>
                            {row.bloqueado ? "Retirado" : "Activo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={Number(actividadCalificacion?.valor_maximo || 0)}
                            step="0.01"
                            value={row.nota === null || row.nota === undefined ? "" : String(row.nota)}
                            onChange={(event) => updateCalificacion(row.id_estudiante, "nota", event.target.value)}
                            disabled={row.bloqueado || !trimestreAbierto}
                            className={invalid ? "border-destructive focus-visible:ring-destructive" : ""}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.observaciones || ""}
                            onChange={(event) => updateCalificacion(row.id_estudiante, "observaciones", event.target.value)}
                            disabled={row.bloqueado || !trimestreAbierto}
                            placeholder="Opcional"
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.id_calificacion ? row.fecha_evaluacion || "Guardada" : "Sin nota"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {!loadingCalificaciones && selectedActividadId && calificaciones.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No hay estudiantes activos o inscritos para esta actividad.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!selectedActividadId ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Seleccione una actividad del panel del trimestre.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-primary">Validación de trimestre</p>
            <p className="mt-1 text-muted-foreground">
              El sistema consulta el estado del trimestre antes de crear actividades. Si la libreta fue aprobada o el trimestre se cerró,
              el botón de nueva actividad queda deshabilitado.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
