"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { API_URL } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CreditCard, FileText, RefreshCw } from "lucide-react"

type DeudaEstudiante = {
  id_deuda: number
  id_estudiante: number
  estudiante: string
  nombre_concepto: string
  monto: string
  mes: string
  anio: number
  estado_deuda: "pendiente" | "pagado" | "mora"
  id_pago?: number | null
  monto_pagado?: string | null
  metodo_pago?: string | null
  estado_pago?: string | null
  fecha_pago?: string | null
  id_stripe_payment?: string | null
  numero_comprobante?: string | null
  comprobante_url?: string | null
}

type StripeInstance = {
  elements: (options: { clientSecret: string }) => StripeElements
  confirmPayment: (options: {
    elements: StripeElements
    confirmParams: { return_url: string }
    redirect: "if_required"
  }) => Promise<{ error?: { message?: string }; paymentIntent?: { id: string; status: string } }>
}

type StripeElements = {
  create: (type: "payment") => { mount: (selector: string) => void; unmount: () => void }
}

declare global {
  interface Window {
    Stripe?: (key: string) => StripeInstance
  }
}

const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
})

const loadStripeScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.Stripe) {
      resolve()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>("script[src='https://js.stripe.com/v3/']")
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Stripe")))
      return
    }

    const script = document.createElement("script")
    script.src = "https://js.stripe.com/v3/"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("No se pudo cargar Stripe"))
    document.body.appendChild(script)
  })

export default function MisPagosPage() {
  const [deudas, setDeudas] = useState<DeudaEstudiante[]>([])
  const [stripePublicKey, setStripePublicKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [selected, setSelected] = useState<DeudaEstudiante | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const stripeRef = useRef<StripeInstance | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)
  const paymentElementRef = useRef<{ mount: (selector: string) => void; unmount: () => void } | null>(null)

  const pendientes = useMemo(
    () => deudas.filter((deuda) => deuda.estado_deuda !== "pagado"),
    [deudas],
  )

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/pagos/mis-pagos`, { headers: getHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Error al cargar pagos")
      setDeudas(data.deudas || [])
      setStripePublicKey(data.stripe_public_key || null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cargar pagos")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!clientSecret || !stripePublicKey) return

    let mounted = true
    const mountElement = async () => {
      try {
        await loadStripeScript()
        if (!mounted || !window.Stripe) return
        stripeRef.current = window.Stripe(stripePublicKey)
        elementsRef.current = stripeRef.current.elements({ clientSecret })
        paymentElementRef.current?.unmount()
        paymentElementRef.current = elementsRef.current.create("payment")
        paymentElementRef.current.mount("#payment-element")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo cargar Stripe")
      }
    }

    mountElement()
    return () => {
      mounted = false
      paymentElementRef.current?.unmount()
      paymentElementRef.current = null
      elementsRef.current = null
    }
  }, [clientSecret, stripePublicKey])

  const iniciarPago = async (deuda: DeudaEstudiante) => {
    if (deuda.estado_deuda === "pagado") {
      toast.info("La deuda ya esta pagada")
      return
    }

    setProcessing(true)
    setSelected(deuda)
    setClientSecret(null)
    try {
      const res = await fetch(`${API_URL}/api/pagos/stripe/payment-intent`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ id_deuda: deuda.id_deuda }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "No se pudo iniciar el proceso de pago. Intente nuevamente")
      setStripePublicKey(data.stripe_public_key || stripePublicKey)
      setClientSecret(data.client_secret)
    } catch (error) {
      setSelected(null)
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar el proceso de pago. Intente nuevamente")
    } finally {
      setProcessing(false)
    }
  }

  const confirmarPago = async () => {
    if (!stripeRef.current || !elementsRef.current) {
      toast.error("El formulario de pago aun no esta listo")
      return
    }

    setProcessing(true)
    try {
      const result = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      })

      if (result.error) {
        toast.error(result.error.message || "Pago rechazado por Stripe")
        return
      }

      if (result.paymentIntent?.status === "succeeded") {
        await fetch(`${API_URL}/api/pagos/stripe/sincronizar`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ payment_intent_id: result.paymentIntent.id }),
        })
        toast.success("Pago completado correctamente")
        setSelected(null)
        setClientSecret(null)
        await load()
      } else {
        toast.info(`Stripe reporto estado: ${result.paymentIntent?.status || "pendiente"}`)
      }
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis Pagos</h1>
        <p className="text-muted-foreground">Consulta tus deudas y comprobantes de pago.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pendientes</p><p className="text-2xl font-bold">{pendientes.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total pendiente</p><p className="text-2xl font-bold">Bs. {pendientes.reduce((acc, item) => acc + Number(item.monto), 0).toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pagadas</p><p className="text-2xl font-bold">{deudas.filter((item) => item.estado_deuda === "pagado").length}</p></CardContent></Card>
      </div>

      {!loading && pendientes.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">No tienes pagos pendientes</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Deudas</CardTitle>
          <CardDescription>Selecciona una deuda pendiente para pagar con tarjeta.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Periodo</TableHead><TableHead>Concepto</TableHead><TableHead>Monto</TableHead><TableHead>Estado</TableHead><TableHead>Comprobante</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {deudas.map((deuda) => (
                  <TableRow key={deuda.id_deuda}>
                    <TableCell>{deuda.mes} {deuda.anio}</TableCell>
                    <TableCell>{deuda.nombre_concepto}</TableCell>
                    <TableCell className="font-mono">Bs. {Number(deuda.monto).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={deuda.estado_deuda === "pagado" ? "default" : "secondary"}>{deuda.estado_deuda}</Badge></TableCell>
                    <TableCell>{deuda.numero_comprobante || deuda.id_stripe_payment || "Sin comprobante"}</TableCell>
                    <TableCell className="text-right">
                      {deuda.estado_deuda === "pagado" ? (
                        <Button variant="outline" size="sm" className="gap-2" disabled={!deuda.comprobante_url} onClick={() => deuda.comprobante_url && window.open(deuda.comprobante_url, "_blank")}>
                          <FileText className="h-4 w-4" />
                          Ver
                        </Button>
                      ) : (
                        <Button size="sm" className="gap-2" disabled={processing} onClick={() => iniciarPago(deuda)}>
                          <CreditCard className="h-4 w-4" />
                          Pagar ahora
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {deudas.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No hay deudas registradas.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>Pago seguro con Stripe</CardTitle>
            <CardDescription>{selected.nombre_concepto} · {selected.mes} {selected.anio} · Bs. {Number(selected.monto).toFixed(2)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!stripePublicKey ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                Stripe no esta configurado. Falta definir la llave publica en el backend.
              </div>
            ) : (
              <div id="payment-element" className="rounded-md border p-4" />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSelected(null); setClientSecret(null) }}>Cancelar</Button>
              <Button className="gap-2" onClick={confirmarPago} disabled={processing || !clientSecret || !stripePublicKey}>
                <RefreshCw className="h-4 w-4" />
                Confirmar pago
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
