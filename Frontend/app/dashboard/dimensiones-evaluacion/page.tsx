"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type Subpunto = {
  id_subpunto?: number
  nombre: string
  descripcion?: string | null
  regla_promedio?: boolean
}

type Dimension = {
  id_dimension_eval: number
  nombre_dimension: "Ser" | "Saber" | "Hacer" | "Autoevaluacion"
  puntaje_maximo: string | number
  subpuntos: Subpunto[]
}

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

type ContextoResponse = {
  gestion: { id_gestion: number; anio: number; estado: string }
  cursos: Curso[]
}

const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
})

const dimensionDescripcion: Record<Dimension["nombre_dimension"], string> = {
  Ser: "Actitudes, valores, convivencia, responsabilidad y participación.",
  Saber: "Conocimientos, comprensión de contenidos y dominio teórico.",
  Hacer: "Práctica, producción, resolución de problemas y proyectos.",
  Autoevaluacion: "Valoración del propio desempeño del estudiante.",
}

const dimensionLabel: Record<Dimension["nombre_dimension"], string> = {
  Ser: "Ser",
  Saber: "Saber",
  Hacer: "Hacer",
  Autoevaluacion: "Autoevaluación",
}

export default function DimensionesEvaluacionPage() {
  const [contexto, setContexto] = useState<ContextoResponse | null>(null)
  const [idCurso, setIdCurso] = useState("")
  const [idCursoMateria, setIdCursoMateria] = useState("")
  const [trimestre, setTrimestre] = useState("1")
  const [dimensiones, setDimensiones] = useState<Dimension[]>([])
  const [bloqueadoPorNotas, setBloqueadoPorNotas] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const cursoSeleccionado = contexto?.cursos.find((curso) => String(curso.id_curso) === idCurso)
  const materiaSeleccionada = cursoSeleccionado?.materias.find(
    (materia) => String(materia.id_curso_materia) === idCursoMateria,
  )

  const totalScore = dimensiones.reduce((acc, dimension) => acc + Number(dimension.puntaje_maximo), 0)
  const totalSubpuntos = dimensiones.reduce((acc, dimension) => acc + dimension.subpuntos.length, 0)

  const loadContexto = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dimensiones/contexto`, { headers: getHeaders() })
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

  const loadEstructura = useCallback(async () => {
    if (!idCursoMateria) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        id_curso_materia: idCursoMateria,
        trimestre,
      })
      const res = await fetch(`${API_URL}/api/dimensiones?${params}`, { headers: getHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al cargar dimensiones")
      setDimensiones(data.dimensiones)
      setBloqueadoPorNotas(Boolean(data.bloqueado_por_notas))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar dimensiones")
      setDimensiones([])
      setBloqueadoPorNotas(false)
    } finally {
      setLoading(false)
    }
  }, [idCursoMateria, trimestre])

  useEffect(() => {
    loadContexto()
  }, [loadContexto])

  useEffect(() => {
    loadEstructura()
  }, [loadEstructura])

  const cursosConMaterias = useMemo(
    () => contexto?.cursos.filter((curso) => curso.materias.length > 0) || [],
    [contexto],
  )

  const updateSubpunto = (
    idDimension: number,
    index: number,
    patch: Partial<Subpunto>,
  ) => {
    setDimensiones((prev) =>
      prev.map((dimension) =>
        dimension.id_dimension_eval === idDimension
          ? {
              ...dimension,
              subpuntos: dimension.subpuntos.map((subpunto, i) =>
                i === index ? { ...subpunto, ...patch } : subpunto,
              ),
            }
          : dimension,
      ),
    )
  }

  const addSubpunto = (idDimension: number) => {
    setDimensiones((prev) =>
      prev.map((dimension) =>
        dimension.id_dimension_eval === idDimension
          ? {
              ...dimension,
              subpuntos: [...dimension.subpuntos, { nombre: "", descripcion: "", regla_promedio: true }],
            }
          : dimension,
      ),
    )
  }

  const removeSubpunto = (idDimension: number, index: number) => {
    setDimensiones((prev) =>
      prev.map((dimension) =>
        dimension.id_dimension_eval === idDimension
          ? {
              ...dimension,
              subpuntos: dimension.subpuntos.filter((_, i) => i !== index),
            }
          : dimension,
      ),
    )
  }

  const save = async () => {
    if (!idCursoMateria) return

    for (const dimension of dimensiones) {
      for (const subpunto of dimension.subpuntos) {
        if (!subpunto.nombre.trim()) {
          toast.error("Todos los sub-puntos deben tener nombre")
          return
        }
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/dimensiones/configuracion`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          id_curso_materia: Number(idCursoMateria),
          trimestre: Number(trimestre),
          dimensiones: dimensiones.map((dimension) => ({
            id_dimension_eval: dimension.id_dimension_eval,
            subpuntos: dimension.subpuntos.map((subpunto) => ({
              nombre: subpunto.nombre.trim(),
              descripcion: subpunto.descripcion?.trim() || null,
            })),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al guardar configuración")
      toast.success(data.message || "Estructura guardada correctamente")
      await loadEstructura()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar configuración")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">CU17</Badge>
            <Badge variant="outline">Modelo boliviano 10-45-40-5</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Dimensiones de Evaluación</h1>
          <p className="text-muted-foreground">
            Configuración de sub-puntos por curso, materia y trimestre.
          </p>
        </div>
        <Button className="gap-2" onClick={save} disabled={saving || bloqueadoPorNotas || !idCursoMateria}>
          <Save className="h-4 w-4" />
          Guardar configuración
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
              <p className="text-sm text-muted-foreground">Puntaje total</p>
              {totalScore === 100 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <p className="mt-1 text-2xl font-bold">{totalScore}/100</p>
            <p className="text-xs text-muted-foreground">{contexto?.gestion ? `Gestión ${contexto.gestion.anio}` : "Sin gestión activa"}</p>
          </CardContent>
        </Card>
      </div>

      {bloqueadoPorNotas ? (
        <Badge variant="destructive" className="w-fit">
          Edición bloqueada porque ya existen calificaciones registradas en este trimestre
        </Badge>
      ) : null}

      <Tabs defaultValue="configuracion" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configuracion" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Configuración
          </TabsTrigger>
          <TabsTrigger value="vista-previa" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Vista previa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configuracion" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {dimensiones.map((dimension) => (
              <Card key={dimension.id_dimension_eval}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{dimensionLabel[dimension.nombre_dimension]}</CardTitle>
                      <CardDescription>{dimensionDescripcion[dimension.nombre_dimension]}</CardDescription>
                    </div>
                    <Badge variant="secondary">{Number(dimension.puntaje_maximo)}%</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    Los porcentajes están fijados por normativa. La dimensión se calcula como promedio de sus sub-puntos.
                  </div>

                  <div className="space-y-3">
                    {dimension.subpuntos.map((subpunto, index) => (
                      <div key={subpunto.id_subpunto || index} className="rounded-md border p-3">
                        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                          <div className="grid gap-2">
                            <Label>Nombre del sub-punto</Label>
                            <Input
                              value={subpunto.nombre}
                              onChange={(event) =>
                                updateSubpunto(dimension.id_dimension_eval, index, { nombre: event.target.value })
                              }
                              placeholder="Actitudes"
                              disabled={bloqueadoPorNotas}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="self-end"
                            onClick={() => removeSubpunto(dimension.id_dimension_eval, index)}
                            disabled={bloqueadoPorNotas}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <Label>Descripción</Label>
                          <Textarea
                            value={subpunto.descripcion || ""}
                            onChange={(event) =>
                              updateSubpunto(dimension.id_dimension_eval, index, { descripcion: event.target.value })
                            }
                            placeholder="Detalle del criterio de evaluación..."
                            disabled={bloqueadoPorNotas}
                          />
                        </div>
                      </div>
                    ))}

                    {dimension.subpuntos.length === 0 ? (
                      <div className="rounded-md border p-5 text-center text-sm text-muted-foreground">
                        Sin sub-puntos configurados.
                      </div>
                    ) : null}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => addSubpunto(dimension.id_dimension_eval)}
                    disabled={bloqueadoPorNotas}
                  >
                    <Plus className="h-4 w-4" />
                    Nuevo sub-punto
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="vista-previa" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estructura disponible para CU18</CardTitle>
              <CardDescription>
                {materiaSeleccionada
                  ? `${materiaSeleccionada.nombre_materia} · Trimestre ${trimestre}`
                  : "Seleccione un curso y materia"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dimensión</TableHead>
                      <TableHead>Puntaje</TableHead>
                      <TableHead>Sub-puntos</TableHead>
                      <TableHead>Regla</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dimensiones.map((dimension) => (
                      <TableRow key={dimension.id_dimension_eval}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-primary" />
                            <span className="font-medium">{dimensionLabel[dimension.nombre_dimension]}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{Number(dimension.puntaje_maximo)}</TableCell>
                        <TableCell>
                          {dimension.subpuntos.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {dimension.subpuntos.map((subpunto, index) => (
                                <Badge key={`${subpunto.nombre}-${index}`} variant="outline">
                                  {subpunto.nombre || "Sin nombre"}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Sin sub-puntos</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">Promedio automático</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Separator className="my-4" />
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                {loading ? "Cargando estructura..." : `${totalSubpuntos} sub-puntos configurados`}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
