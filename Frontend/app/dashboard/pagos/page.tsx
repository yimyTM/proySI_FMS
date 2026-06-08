"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { API_URL } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { CalendarClock, CreditCard, DollarSign, Plus, RefreshCw } from "lucide-react"

interface DeudaPago {
  id_deuda: number
  id_estudiante: number
  estudiante: string
  estudiante_ci?: string
  id_gestion: number
  anio: number
  id_concepto: number
  nombre_concepto: string
  monto: string
  mes: string
  estado_deuda: "pendiente" | "pagado" | "mora"
  id_pago?: number
  monto_pagado?: string
  metodo_pago?: string
  estado_pago?: string
  fecha_pago?: string
  id_stripe_payment?: string
  stripe_status?: string
  numero_comprobante?: string
}

interface Concepto {
  id_concepto: number
  nombre_concepto: string
}

interface Estudiante {
  id_estudiante: number
  nombre: string
  apellido: string
  ci?: string
}

interface Gestion {
  id_gestion: number
  anio: number
  estado: string
}

interface MesPeriodo {
  numero: number
  nombre: string
}

interface ContextoDeudasMensuales {
  gestion_activa: Gestion | null
  periodo_actual: { mes_numero: number; mes_nombre: string; anio: number }
  meses: MesPeriodo[]
}

interface ResumenGeneracion {
  periodo: string
  generadas: number
  omitidas_existentes: number
  omitidas_arancel: number
  total_estudiantes: number
  errores: Array<{ id_estudiante: number; estudiante: string; nivel: string; motivo: string }>
}

const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
})

export default function PagosPage() {
  const [deudas, setDeudas] = useState<DeudaPago[]>([])
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([])
  const [gestiones, setGestiones] = useState<Gestion[]>([])
  const [search, setSearch] = useState("")
  const [estado, setEstado] = useState("todos")
  const [deudaOpen, setDeudaOpen] = useState(false)
  const [autoDeudaOpen, setAutoDeudaOpen] = useState(false)
  const [pagoOpen, setPagoOpen] = useState(false)
  const [selectedDeuda, setSelectedDeuda] = useState<DeudaPago | null>(null)
  const [deudaForm, setDeudaForm] = useState({ id_estudiante: "", id_gestion: "", id_concepto: "", monto: "", mes: "" })
  const [autoForm, setAutoForm] = useState({ mes: "", anio: "" })
  const [contextoDeudas, setContextoDeudas] = useState<ContextoDeudasMensuales | null>(null)
  const [resumenGeneracion, setResumenGeneracion] = useState<ResumenGeneracion | null>(null)
  const [generating, setGenerating] = useState(false)
  const [pagoForm, setPagoForm] = useState({ monto_pagado: "", metodo_pago: "efectivo", observaciones: "" })

  const load = async () => {
    const qs = new URLSearchParams()
    if (search) qs.set("search", search)
    if (estado !== "todos") qs.set("estado", estado)

    try {
      const [deudasRes, conceptosRes, estudiantesRes, gestionesRes] = await Promise.all([
        fetch(`${API_URL}/api/pagos/deudas?${qs}`, { headers: getHeaders() }),
        fetch(`${API_URL}/api/pagos/conceptos`, { headers: getHeaders() }),
        fetch(`${API_URL}/api/estudiantes`, { headers: getHeaders() }),
        fetch(`${API_URL}/api/gestiones`, { headers: getHeaders() }),
      ])
      const [deudasData, conceptosData, estudiantesData, gestionesData] = await Promise.all([
        deudasRes.json(), conceptosRes.json(), estudiantesRes.json(), gestionesRes.json()
      ])
      if (!deudasRes.ok) throw new Error(deudasData.message || "Error al cargar deudas")
      if (!conceptosRes.ok) throw new Error(conceptosData.message || "Error al cargar conceptos")
      setDeudas(deudasData)
      setConceptos(conceptosData)
      setEstudiantes(estudiantesData)
      setGestiones(gestionesData)
      const activa = gestionesData.find((g: Gestion) => g.estado === "activa") || gestionesData[0]
      if (activa && !deudaForm.id_gestion) setDeudaForm(prev => ({ ...prev, id_gestion: String(activa.id_gestion) }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar pagos")
    }
  }

  const loadContextoGeneracion = async () => {
    try {
      const res = await fetch(`${API_URL}/api/pagos/deudas/generar/contexto`, { headers: getHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al cargar contexto de deudas")
      setContextoDeudas(data)
      setAutoForm({
        mes: String(data.periodo_actual?.mes_numero || new Date().getMonth() + 1),
        anio: String(data.gestion_activa?.anio || data.periodo_actual?.anio || new Date().getFullYear()),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar contexto de deudas")
    }
  }

  useEffect(() => {
    load()
    loadContextoGeneracion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])

  const stats = useMemo(() => {
    return {
      cobrado: deudas.filter(d => d.estado_deuda === "pagado").reduce((acc, d) => acc + Number(d.monto_pagado || d.monto), 0),
      pendiente: deudas.filter(d => d.estado_deuda !== "pagado").reduce((acc, d) => acc + Number(d.monto), 0),
      pagadas: deudas.filter(d => d.estado_deuda === "pagado").length,
      mora: deudas.filter(d => d.estado_deuda === "mora").length,
    }
  }, [deudas])

  const createDeuda = async () => {
    try {
      const res = await fetch(`${API_URL}/api/pagos/deudas`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(deudaForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al generar deuda")
      toast.success("Deuda generada")
      setDeudaOpen(false)
      setDeudaForm(prev => ({ ...prev, id_estudiante: "", id_concepto: "", monto: "", mes: "" }))
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al generar deuda")
    }
  }

  const generarDeudasMensuales = async () => {
    if (!autoForm.mes || !autoForm.anio) {
      toast.error("Seleccione mes y año")
      return
    }

    setGenerating(true)
    setResumenGeneracion(null)
    try {
      const res = await fetch(`${API_URL}/api/pagos/deudas/generar-mensual`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ mes: Number(autoForm.mes), anio: Number(autoForm.anio) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al generar deudas mensuales")
      setResumenGeneracion(data.resumen)
      toast.success(data.message || "Proceso ejecutado correctamente")
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al generar deudas mensuales")
    } finally {
      setGenerating(false)
    }
  }

  const openPago = (deuda: DeudaPago) => {
    setSelectedDeuda(deuda)
    setPagoForm({ monto_pagado: String(deuda.monto), metodo_pago: "efectivo", observaciones: "" })
    setPagoOpen(true)
  }

  const registrarPago = async () => {
    if (!selectedDeuda) return
    try {
      const res = await fetch(`${API_URL}/api/pagos`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ id_deuda: selectedDeuda.id_deuda, ...pagoForm, estado: "validado" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al registrar pago")
      toast.success("Pago registrado")
      setPagoOpen(false)
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al registrar pago")
    }
  }

  const sincronizarStripe = async (deuda: DeudaPago) => {
    if (!deuda.id_stripe_payment) return
    try {
      const res = await fetch(`${API_URL}/api/pagos/stripe/sincronizar`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ id_stripe_payment: deuda.id_stripe_payment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al sincronizar pago")
      toast.success(data.message || "Pago sincronizado")
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al sincronizar pago")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Control de Pagos</h1>
          <p className="text-muted-foreground">Deudas, mensualidades y registro de pagos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={autoDeudaOpen} onOpenChange={(open) => {
            setAutoDeudaOpen(open)
            if (open) {
              setResumenGeneracion(null)
              loadContextoGeneracion()
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><CalendarClock className="h-4 w-4" />Generar deudas mensuales</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generar Deudas Mensuales</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="rounded-md bg-muted p-3 text-sm">
                  Gestión activa: {contextoDeudas?.gestion_activa ? contextoDeudas.gestion_activa.anio : "No configurada"}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Mes</Label>
                    <Select value={autoForm.mes} onValueChange={value => setAutoForm({ ...autoForm, mes: value })}>
                      <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                      <SelectContent>
                        {(contextoDeudas?.meses || []).map(mes => (
                          <SelectItem key={mes.numero} value={String(mes.numero)}>{mes.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Año</Label>
                    <Input type="number" value={autoForm.anio} onChange={e => setAutoForm({ ...autoForm, anio: e.target.value })} />
                  </div>
                </div>
                {resumenGeneracion ? (
                  <div className="grid gap-3 rounded-md border p-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div><p className="text-muted-foreground">Generadas</p><p className="text-xl font-bold">{resumenGeneracion.generadas}</p></div>
                      <div><p className="text-muted-foreground">Existentes</p><p className="text-xl font-bold">{resumenGeneracion.omitidas_existentes}</p></div>
                      <div><p className="text-muted-foreground">Sin arancel</p><p className="text-xl font-bold">{resumenGeneracion.omitidas_arancel}</p></div>
                    </div>
                    {resumenGeneracion.errores.length > 0 ? (
                      <div className="max-h-28 overflow-auto rounded bg-muted p-2 text-xs">
                        {resumenGeneracion.errores.map(error => (
                          <p key={error.id_estudiante}>{error.estudiante} · {error.nivel}: {error.motivo}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button onClick={generarDeudasMensuales} disabled={generating} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Ejecutar proceso
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={deudaOpen} onOpenChange={setDeudaOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Deuda manual</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva deuda</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Estudiante</Label>
                  <Select value={deudaForm.id_estudiante} onValueChange={value => setDeudaForm({ ...deudaForm, id_estudiante: value })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar estudiante" /></SelectTrigger>
                    <SelectContent>{estudiantes.map(e => <SelectItem key={e.id_estudiante} value={String(e.id_estudiante)}>{e.apellido} {e.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Concepto</Label>
                  <Select value={deudaForm.id_concepto} onValueChange={value => setDeudaForm({ ...deudaForm, id_concepto: value })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger>
                    <SelectContent>{conceptos.map(c => <SelectItem key={c.id_concepto} value={String(c.id_concepto)}>{c.nombre_concepto}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2"><Label>Monto</Label><Input type="number" value={deudaForm.monto} onChange={e => setDeudaForm({ ...deudaForm, monto: e.target.value })} /></div>
                  <div className="grid gap-2"><Label>Mes</Label><Input value={deudaForm.mes} onChange={e => setDeudaForm({ ...deudaForm, mes: e.target.value })} placeholder="Mayo" /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={createDeuda}>Guardar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Cobrado</p><p className="text-2xl font-bold">Bs. {stats.cobrado.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pendiente</p><p className="text-2xl font-bold">Bs. {stats.pendiente.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pagadas</p><p className="text-2xl font-bold">{stats.pagadas}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">En mora</p><p className="text-2xl font-bold">{stats.mora}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deudas y pagos</CardTitle>
          <CardDescription>Busca por estudiante, CI o concepto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_120px]">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." />
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="mora">Mora</SelectItem>
                <SelectItem value="pagado">Pagados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load}>Buscar</Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Estudiante</TableHead><TableHead>Concepto</TableHead><TableHead>Monto</TableHead><TableHead>Estado</TableHead><TableHead>Pago</TableHead><TableHead>Stripe</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {deudas.map(deuda => (
                  <TableRow key={deuda.id_deuda}>
                    <TableCell><p className="font-medium">{deuda.estudiante}</p><p className="text-xs text-muted-foreground">{deuda.estudiante_ci || "Sin CI"}</p></TableCell>
                    <TableCell>{deuda.nombre_concepto} · {deuda.mes} {deuda.anio}</TableCell>
                    <TableCell className="font-mono">Bs. {Number(deuda.monto).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={deuda.estado_deuda === "pagado" ? "default" : "secondary"}>{deuda.estado_deuda}</Badge></TableCell>
                    <TableCell>{deuda.id_pago ? `${deuda.metodo_pago} · Bs. ${Number(deuda.monto_pagado).toFixed(2)}` : "Sin pago"}</TableCell>
                    <TableCell className="max-w-44 truncate text-xs">{deuda.id_stripe_payment || deuda.numero_comprobante || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {deuda.id_stripe_payment ? <Button size="sm" variant="outline" onClick={() => sincronizarStripe(deuda)}>Sincronizar</Button> : null}
                        {deuda.estado_deuda !== "pagado" && <Button size="sm" onClick={() => openPago(deuda)} className="gap-2"><CreditCard className="h-4 w-4" />Registrar</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {deudas.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay deudas registradas.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={pagoOpen} onOpenChange={setPagoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-md bg-muted p-3 text-sm">{selectedDeuda?.estudiante} · {selectedDeuda?.nombre_concepto}</div>
            <div className="grid gap-2"><Label>Monto pagado</Label><Input type="number" value={pagoForm.monto_pagado} onChange={e => setPagoForm({ ...pagoForm, monto_pagado: e.target.value })} /></div>
            <div className="grid gap-2">
              <Label>Metodo</Label>
              <Select value={pagoForm.metodo_pago} onValueChange={value => setPagoForm({ ...pagoForm, metodo_pago: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="QR">QR</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Observaciones</Label><Textarea value={pagoForm.observaciones} onChange={e => setPagoForm({ ...pagoForm, observaciones: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={registrarPago} className="gap-2"><DollarSign className="h-4 w-4" />Guardar pago</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
