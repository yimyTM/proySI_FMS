"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Search,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { API_URL } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type EstadoJustificacion = "sin_solicitud" | "pendiente" | "aprobada" | "rechazada"

type Inasistencia = {
  id_asistencia: number
  id_justificacion?: number | null
  id_estudiante: number
  id_curso: number
  estudiante: string
  estudiante_ci?: string
  nombre_nivel: string
  nombre_grado: string
  paralelo: string
  turno: string
  fecha: string
  registrado_por?: string
  observacion_asistencia?: string | null
  estado_justificacion?: Exclude<EstadoJustificacion, "sin_solicitud"> | null
  motivo?: string | null
  documento_referencia?: string | null
  observaciones_justificacion?: string | null
  solicitante?: string | null
  revisor?: string | null
}

const estadoLabel: Record<EstadoJustificacion, string> = {
  sin_solicitud: "Sin solicitud",
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
}

const estadoVariant: Record<EstadoJustificacion, "default" | "secondary" | "outline" | "destructive"> = {
  sin_solicitud: "outline",
  pendiente: "secondary",
  aprobada: "default",
  rechazada: "destructive",
}

const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
})

const getEstado = (item: Inasistencia): EstadoJustificacion =>
  item.estado_justificacion || "sin_solicitud"

const getCurso = (item: Inasistencia) =>
  `${item.nombre_nivel} - ${item.nombre_grado} ${item.paralelo} · ${item.turno}`

export default function JustificarInasistenciaPage() {
  const [inasistencias, setInasistencias] = useState<Inasistencia[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [estado, setEstado] = useState<EstadoJustificacion | "todos">("todos")
  const [motivo, setMotivo] = useState("")
  const [documento, setDocumento] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [observacionRevision, setObservacionRevision] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selected = inasistencias.find((item) => item.id_asistencia === selectedId) || inasistencias[0]

  const loadInasistencias = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("search", search.trim())
      if (estado !== "todos") params.set("estado", estado)

      const res = await fetch(`${API_URL}/api/justificaciones/inasistencias?${params}`, {
        headers: getHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al cargar inasistencias")

      setInasistencias(data)
      setSelectedId((prev) => {
        if (prev && data.some((item: Inasistencia) => item.id_asistencia === prev)) return prev
        return data[0]?.id_asistencia ?? null
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar inasistencias")
      setInasistencias([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [estado, search])

  useEffect(() => {
    const timeout = setTimeout(loadInasistencias, 250)
    return () => clearTimeout(timeout)
  }, [loadInasistencias])

  useEffect(() => {
    setMotivo(selected?.motivo || "")
    setDocumento(selected?.documento_referencia || "")
    setObservaciones(selected?.observaciones_justificacion || "")
    setObservacionRevision("")
  }, [selected?.id_asistencia, selected?.motivo, selected?.documento_referencia, selected?.observaciones_justificacion])

  const stats = useMemo(() => {
    return {
      total: inasistencias.length,
      sinSolicitud: inasistencias.filter((item) => getEstado(item) === "sin_solicitud").length,
      pendientes: inasistencias.filter((item) => getEstado(item) === "pendiente").length,
      aprobadas: inasistencias.filter((item) => getEstado(item) === "aprobada").length,
    }
  }, [inasistencias])

  const submitRequest = async () => {
    if (!selected) return
    if (!motivo.trim()) {
      toast.error("El motivo es obligatorio")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/justificaciones`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          id_asistencia: selected.id_asistencia,
          motivo: motivo.trim(),
          documento_referencia: documento.trim() || null,
          observaciones: observaciones.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al registrar justificación")
      toast.success(data.message || "Justificación registrada correctamente")
      await loadInasistencias()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al registrar justificación")
    } finally {
      setSaving(false)
    }
  }

  const resolve = async (nuevoEstado: "aprobada" | "rechazada") => {
    if (!selected?.id_justificacion) {
      toast.error("Primero debe existir una justificación pendiente")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/justificaciones/${selected.id_justificacion}/resolver`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({
          estado: nuevoEstado,
          observaciones: observacionRevision.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al resolver justificación")
      toast.success(data.message || "Justificación actualizada correctamente")
      await loadInasistencias()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al resolver justificación")
    } finally {
      setSaving(false)
    }
  }

  const selectedEstado = selected ? getEstado(selected) : "sin_solicitud"
  const canRegister = selected && selectedEstado === "sin_solicitud"
  const canResolve = selected && selectedEstado === "pendiente"
  const statCards: { label: string; value: number; icon: LucideIcon }[] = [
    { label: "Total", value: stats.total, icon: FileText },
    { label: "Sin solicitud", value: stats.sinSolicitud, icon: AlertCircle },
    { label: "Pendientes", value: stats.pendientes, icon: Clock },
    { label: "Aprobadas", value: stats.aprobadas, icon: CheckCircle2 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">CU16</Badge>
            <Badge variant="outline">Conectado a backend</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Justificar Inasistencia</h1>
          <p className="text-muted-foreground">
            Registro, revisión y resolución de ausencias justificadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => resolve("rechazada")} disabled={!canResolve || saving}>
            <XCircle className="h-4 w-4" />
            Rechazar
          </Button>
          <Button className="gap-2" onClick={() => resolve("aprobada")} disabled={!canResolve || saving}>
            <ShieldCheck className="h-4 w-4" />
            Aprobar justificación
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
              <Icon className="h-7 w-7 text-primary/40" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Inasistencias</CardTitle>
            <CardDescription>{loading ? "Cargando..." : "Ausencias registradas con estado A."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar estudiante, CI o curso"
                  className="pl-9"
                />
              </div>
              <Select value={estado} onValueChange={(value) => setEstado(value as EstadoJustificacion | "todos")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="sin_solicitud">Sin solicitud</SelectItem>
                  <SelectItem value="pendiente">Pendientes</SelectItem>
                  <SelectItem value="aprobada">Aprobadas</SelectItem>
                  <SelectItem value="rechazada">Rechazadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {inasistencias.map((item) => {
                const itemEstado = getEstado(item)
                return (
                  <button
                    key={item.id_asistencia}
                    type="button"
                    onClick={() => setSelectedId(item.id_asistencia)}
                    className={`w-full rounded-md border p-3 text-left transition hover:bg-muted ${
                      item.id_asistencia === selected?.id_asistencia ? "border-primary bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.estudiante}</p>
                        <p className="text-xs text-muted-foreground">{getCurso(item)}</p>
                      </div>
                      <Badge variant={estadoVariant[itemEstado]}>{estadoLabel[itemEstado]}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.fecha} · CI {item.estudiante_ci || "-"}
                    </p>
                  </button>
                )
              })}
              {!loading && inasistencias.length === 0 && (
                <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                  No hay inasistencias con esos filtros.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{selected?.estudiante || "Sin selección"}</CardTitle>
                <CardDescription>
                  {selected ? `${getCurso(selected)} · ${selected.fecha} · Registrado por ${selected.registrado_por || "-"}` : "Seleccione una ausencia"}
                </CardDescription>
              </div>
              <Badge variant={estadoVariant[selectedEstado]}>{estadoLabel[selectedEstado]}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {selected ? (
              <Tabs defaultValue="solicitud" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="solicitud" className="gap-2">
                    <FileCheck2 className="h-4 w-4" />
                    Solicitud
                  </TabsTrigger>
                  <TabsTrigger value="revision" className="gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Revisión
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="solicitud" className="space-y-4">
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">Observación de asistencia</p>
                    <p className="mt-1 text-muted-foreground">{selected.observacion_asistencia || "Sin observación"}</p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Respaldo</Label>
                    <Input
                      value={documento}
                      onChange={(event) => setDocumento(event.target.value)}
                      placeholder="certificado_medico.pdf"
                      disabled={!canRegister}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Motivo de justificación</Label>
                    <Textarea
                      value={motivo}
                      onChange={(event) => setMotivo(event.target.value)}
                      placeholder="Describa el motivo presentado por el tutor o estudiante..."
                      className="min-h-32"
                      disabled={!canRegister}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Observaciones</Label>
                    <Textarea
                      value={observaciones}
                      onChange={(event) => setObservaciones(event.target.value)}
                      placeholder="Observaciones opcionales"
                      disabled={!canRegister}
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => { setMotivo(""); setDocumento(""); setObservaciones("") }} disabled={!canRegister}>
                      Limpiar
                    </Button>
                    <Button onClick={submitRequest} className="gap-2" disabled={!canRegister || saving}>
                      <FileCheck2 className="h-4 w-4" />
                      Registrar solicitud
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="revision" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Solicitante</p>
                        <p className="mt-1 font-medium">{selected.solicitante || "Pendiente"}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Revisado por</p>
                        <p className="mt-1 font-medium">{selected.revisor || "Pendiente"}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Resultado</p>
                        <p className="mt-1 font-medium">{estadoLabel[selectedEstado]}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Separator />

                  <div className="grid gap-2">
                    <Label>Observación de revisión</Label>
                    <Textarea
                      value={observacionRevision}
                      onChange={(event) => setObservacionRevision(event.target.value)}
                      placeholder="Opcional para aprobación o rechazo"
                      disabled={!canResolve}
                    />
                  </div>

                  <div className="rounded-md border p-4">
                    <p className="text-sm font-medium">Vista previa del cambio</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Si la justificación se aprueba, la asistencia cambiará de
                      <span className="font-medium text-foreground"> Ausente </span>
                      a
                      <span className="font-medium text-foreground"> Justificado </span>
                      y el expediente lo reflejará en el historial de asistencia.
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => resolve("rechazada")} disabled={!canResolve || saving}>
                      <XCircle className="h-4 w-4" />
                      Rechazar solicitud
                    </Button>
                    <Button className="gap-2" onClick={() => resolve("aprobada")} disabled={!canResolve || saving}>
                      <CheckCircle2 className="h-4 w-4" />
                      Aprobar y justificar
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                No hay una inasistencia seleccionada.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
