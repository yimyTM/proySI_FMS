"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Search,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Users,
  Baby,
  History,
} from "lucide-react"

interface Student {
  id: number
  name: string
  grade: string
  level: string
  status: "pending" | "delivered" | "alert"
  scheduledTime: string
  deliveredTime?: string
  tutor?: string
  tutorRelation?: string
}

const students: Student[] = [
  {
    id: 1,
    name: "María García López",
    grade: "Kinder A",
    level: "Kinder",
    status: "delivered",
    scheduledTime: "12:00",
    deliveredTime: "12:05",
    tutor: "Ana García",
    tutorRelation: "Madre",
  },
  {
    id: 2,
    name: "Juan Pérez Mamani",
    grade: "Pre-Kinder B",
    level: "Pre-Kinder",
    status: "pending",
    scheduledTime: "12:00",
  },
  {
    id: 3,
    name: "Sofía Rodríguez Quispe",
    grade: "Kinder B",
    level: "Kinder",
    status: "pending",
    scheduledTime: "12:30",
  },
  {
    id: 4,
    name: "Carlos Mendoza Flores",
    grade: "Pre-Kinder A",
    level: "Pre-Kinder",
    status: "alert",
    scheduledTime: "12:00",
  },
  {
    id: 5,
    name: "Ana Martínez Choque",
    grade: "Kinder A",
    level: "Kinder",
    status: "delivered",
    scheduledTime: "12:00",
    deliveredTime: "12:10",
    tutor: "Luis Martínez",
    tutorRelation: "Padre",
  },
]

const statusConfig = {
  pending: {
    label: "Pendiente",
    icon: Clock,
    color: "bg-warning/10 text-warning-foreground",
  },
  delivered: {
    label: "Entregado",
    icon: CheckCircle2,
    color: "bg-success/10 text-success",
  },
  alert: {
    label: "Sin tutor",
    icon: AlertTriangle,
    color: "bg-destructive/10 text-destructive",
  },
}

export default function EntregasPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [levelFilter, setLevelFilter] = useState("all")
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const filteredStudents = students.filter((student) => {
    const matchesSearch = student.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
    const matchesLevel =
      levelFilter === "all" || student.level === levelFilter
    return matchesSearch && matchesLevel
  })

  const pendingCount = students.filter((s) => s.status === "pending").length
  const deliveredCount = students.filter((s) => s.status === "delivered").length
  const alertCount = students.filter((s) => s.status === "alert").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Control de Entregas
          </h1>
          <p className="text-muted-foreground">
            Gestión segura de entrega de estudiantes (Kinder y Pre-Kinder)
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <History className="h-4 w-4" />
          Ver Historial
        </Button>
      </div>

      {/* Alert Card */}
      {alertCount > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-destructive">
                  Atención: {alertCount} estudiante(s) sin tutor asignado
                </p>
                <p className="text-sm text-muted-foreground">
                  Verifique la información de tutores autorizados antes de proceder.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Hoy</p>
                <p className="text-2xl font-bold">{students.length}</p>
              </div>
              <Baby className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendientes</p>
                <p className="text-2xl font-bold text-warning-foreground">
                  {pendingCount}
                </p>
              </div>
              <Clock className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Entregados</p>
                <p className="text-2xl font-bold text-success">
                  {deliveredCount}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertas</p>
                <p className="text-2xl font-bold text-destructive">
                  {alertCount}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Students List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Estudiantes</CardTitle>
                  <CardDescription>
                    Horario de salida: 12:00 - 12:30
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar estudiante..."
                      className="pl-9 w-full sm:w-48"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={levelFilter} onValueChange={setLevelFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="Pre-Kinder">Pre-Kinder</SelectItem>
                      <SelectItem value="Kinder">Kinder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {filteredStudents.map((student) => {
                  const config = statusConfig[student.status]
                  return (
                    <div key={student.id} className="rounded-lg border p-4 space-y-2">
                      <p className="font-medium">{student.name}</p>
                      <p className="text-sm text-muted-foreground">{student.grade}</p>
                      <p className="text-sm"><span className="font-medium">Hora:</span> {student.deliveredTime || student.scheduledTime}</p>
                      <Badge variant="secondary" className={`gap-1 ${config.color}`}>{config.label}</Badge>
                    </div>
                  )
                })}
              </div>
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estudiante</TableHead>
                      <TableHead>Grado</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => {
                      const config = statusConfig[student.status]
                      const Icon = config.icon
                      return (
                        <TableRow key={student.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                  {student.name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((n) => n[0])
                                    .join("")}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{student.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{student.grade}</TableCell>
                          <TableCell className="font-mono">
                            {student.deliveredTime || student.scheduledTime}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`gap-1 ${config.color}`}
                            >
                              <Icon className="h-3 w-3" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {student.status === "pending" && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    onClick={() => setSelectedStudent(student)}
                                  >
                                    Entregar
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Registrar Entrega</DialogTitle>
                                    <DialogDescription>
                                      Verifique la identidad del tutor autorizado
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                                      <Avatar className="h-12 w-12">
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                          {student.name
                                            .split(" ")
                                            .slice(0, 2)
                                            .map((n) => n[0])
                                            .join("")}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="font-medium">{student.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {student.grade}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">
                                        Tutor que recoge
                                      </label>
                                      <Select>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Seleccionar tutor autorizado" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="madre">
                                            María Pérez (Madre)
                                          </SelectItem>
                                          <SelectItem value="padre">
                                            Pedro Pérez (Padre)
                                          </SelectItem>
                                          <SelectItem value="abuela">
                                            Rosa Mamani (Abuela)
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">
                                        CI del tutor
                                      </label>
                                      <Input placeholder="Número de carnet" />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline">Cancelar</Button>
                                    <Button className="gap-2">
                                      <Shield className="h-4 w-4" />
                                      Confirmar Entrega
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            )}
                            {student.status === "delivered" && (
                              <span className="text-xs text-muted-foreground">
                                {student.tutor}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Security Info */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Protocolo de Seguridad
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>1. Verificar identidad del tutor</p>
              <p>2. Confirmar parentesco autorizado</p>
              <p>3. Solicitar documento de identidad</p>
              <p>4. Registrar hora de entrega</p>
            </CardContent>
          </Card>

          {/* Recent Deliveries */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-5 w-5" />
                Últimas Entregas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px]">
                <div className="space-y-3">
                  {students
                    .filter((s) => s.status === "delivered")
                    .map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                      >
                        <div>
                          <p className="text-sm font-medium">{student.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {student.tutor} ({student.tutorRelation})
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {student.deliveredTime}
                        </Badge>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
