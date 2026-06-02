"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Plus,
  Megaphone,
  Bell,
  Calendar,
  Users,
  Clock,
  Eye,
  Send,
  MessageSquare,
} from "lucide-react"

interface Notice {
  id: number
  title: string
  content: string
  date: string
  author: string
  target: string
  status: "sent" | "scheduled" | "draft"
  views: number
}

const notices: Notice[] = [
  {
    id: 1,
    title: "Reunión de Padres de Familia",
    content:
      "Se convoca a todos los padres de familia a la reunión trimestral que se llevará a cabo el día 15 de abril a las 18:00 horas en el salón de actos.",
    date: "2025-04-10",
    author: "Dirección",
    target: "Todos los niveles",
    status: "sent",
    views: 185,
  },
  {
    id: 2,
    title: "Feriado - Día del Trabajador",
    content:
      "Se comunica que el día 1 de mayo no habrá clases por ser feriado nacional. Las actividades se reanudan el 2 de mayo.",
    date: "2025-04-08",
    author: "Dirección",
    target: "Todos los niveles",
    status: "sent",
    views: 220,
  },
  {
    id: 3,
    title: "Festival de Primavera",
    content:
      "Invitamos a toda la comunidad educativa al Festival de Primavera que se realizará el 21 de septiembre. Los estudiantes participarán en diversas actividades.",
    date: "2025-04-05",
    author: "Coordinación",
    target: "Kinder y Pre-Kinder",
    status: "scheduled",
    views: 0,
  },
  {
    id: 4,
    title: "Recordatorio de pagos",
    content:
      "Se recuerda a los padres de familia que la fecha límite para el pago de mensualidades es el día 10 de cada mes.",
    date: "2025-04-01",
    author: "Administración",
    target: "Todos los niveles",
    status: "sent",
    views: 198,
  },
]

const statusConfig = {
  sent: { label: "Enviado", color: "bg-success/10 text-success" },
  scheduled: { label: "Programado", color: "bg-warning/10 text-warning-foreground" },
  draft: { label: "Borrador", color: "bg-muted text-muted-foreground" },
}

export default function ComunicacionPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const sentNotices = notices.filter((n) => n.status === "sent")
  const totalViews = sentNotices.reduce((acc, n) => acc + n.views, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comunicación</h1>
          <p className="text-muted-foreground">
            Gestión de avisos y notificaciones para padres de familia
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Aviso
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Aviso</DialogTitle>
              <DialogDescription>
                Complete la información del aviso que será enviado a los padres de familia.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título del aviso</Label>
                <Input id="title" placeholder="Ej: Reunión de padres" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Contenido</Label>
                <Textarea
                  id="content"
                  placeholder="Escriba el contenido del aviso..."
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dirigido a</Label>
                  <Select defaultValue="all">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los niveles</SelectItem>
                      <SelectItem value="prekinder">Pre-Kinder</SelectItem>
                      <SelectItem value="kinder">Kinder</SelectItem>
                      <SelectItem value="primaria">Primaria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fecha de envío</Label>
                  <Input type="date" />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Guardar borrador
              </Button>
              <Button className="gap-2">
                <Send className="h-4 w-4" />
                Enviar ahora
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avisos Enviados</p>
                <p className="text-2xl font-bold">{sentNotices.length}</p>
              </div>
              <Megaphone className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vistas Totales</p>
                <p className="text-2xl font-bold">{totalViews}</p>
              </div>
              <Eye className="h-8 w-8 text-info/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Programados</p>
                <p className="text-2xl font-bold text-warning-foreground">
                  {notices.filter((n) => n.status === "scheduled").length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tutores</p>
                <p className="text-2xl font-bold">215</p>
              </div>
              <Users className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notices List */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Avisos Publicados</CardTitle>
              <CardDescription>Historial de comunicados enviados</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {notices.map((notice) => {
                    const config = statusConfig[notice.status]
                    return (
                      <Card key={notice.id} className="bg-muted/30">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{notice.title}</h3>
                                <Badge
                                  variant="secondary"
                                  className={config.color}
                                >
                                  {config.label}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {notice.content}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(notice.date).toLocaleDateString("es-BO")}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {notice.target}
                                </span>
                                {notice.status === "sent" && (
                                  <span className="flex items-center gap-1">
                                    <Eye className="h-3 w-3" />
                                    {notice.views} vistas
                                  </span>
                                )}
                              </div>
                            </div>
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {notice.author.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Quick Send */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-5 w-5" />
                Envío Rápido
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mensaje rápido</Label>
                <Textarea placeholder="Escriba un mensaje breve..." rows={3} />
              </div>
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los niveles</SelectItem>
                  <SelectItem value="prekinder">Pre-Kinder</SelectItem>
                  <SelectItem value="kinder">Kinder</SelectItem>
                  <SelectItem value="primaria">Primaria</SelectItem>
                </SelectContent>
              </Select>
              <Button className="w-full gap-2">
                <Send className="h-4 w-4" />
                Enviar Notificación
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-5 w-5" />
                Actividad Reciente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { action: "Aviso enviado", time: "Hace 2 horas" },
                  { action: "Notificación vista por 45 tutores", time: "Hace 3 horas" },
                  { action: "Nuevo borrador guardado", time: "Hace 5 horas" },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{item.action}</span>
                    <span className="text-muted-foreground text-xs">{item.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
