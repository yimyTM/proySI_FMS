"use client"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  Download,
  Users,
  DollarSign,
  Package,
  ClipboardList,
  UserCheck,
  BarChart3,
  Calendar,
  Printer,
} from "lucide-react"

const reportTypes = [
  {
    id: "students",
    title: "Reporte de Estudiantes",
    description: "Listado completo de estudiantes inscritos por nivel y grado",
    icon: Users,
    color: "text-primary",
    bg: "bg-primary/10",
    formats: ["PDF", "Excel"],
  },
  {
    id: "payments",
    title: "Reporte de Pagos",
    description: "Estado de cuenta, pagos realizados y deudas pendientes",
    icon: DollarSign,
    color: "text-success",
    bg: "bg-success/10",
    formats: ["PDF", "Excel"],
  },
  {
    id: "inventory",
    title: "Reporte de Inventario",
    description: "Stock actual, movimientos y materiales con bajo inventario",
    icon: Package,
    color: "text-info",
    bg: "bg-info/10",
    formats: ["PDF", "Excel"],
  },
  {
    id: "grades",
    title: "Reporte de Calificaciones",
    description: "Notas por trimestre, promedio por curso y estudiante",
    icon: ClipboardList,
    color: "text-warning-foreground",
    bg: "bg-warning/10",
    formats: ["PDF"],
  },
  {
    id: "deliveries",
    title: "Reporte de Entregas",
    description: "Historial de entregas de estudiantes y tutores",
    icon: UserCheck,
    color: "text-accent-foreground",
    bg: "bg-accent",
    formats: ["PDF", "Excel"],
  },
  {
    id: "general",
    title: "Reporte General",
    description: "Resumen ejecutivo con estadísticas globales del colegio",
    icon: BarChart3,
    color: "text-muted-foreground",
    bg: "bg-muted",
    formats: ["PDF"],
  },
]

export default function ReportesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground">
            Generación de reportes y exportación de datos
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium mb-2 block">
                Gestión Académica
              </label>
              <Select defaultValue="2025">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium mb-2 block">Período</label>
              <Select defaultValue="abril">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enero">Enero</SelectItem>
                  <SelectItem value="febrero">Febrero</SelectItem>
                  <SelectItem value="marzo">Marzo</SelectItem>
                  <SelectItem value="abril">Abril</SelectItem>
                  <SelectItem value="trimestre1">1er Trimestre</SelectItem>
                  <SelectItem value="trimestre2">2do Trimestre</SelectItem>
                  <SelectItem value="trimestre3">3er Trimestre</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium mb-2 block">Nivel</label>
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
          </div>
        </CardContent>
      </Card>

      {/* Report Types Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => {
          const IconComponent = report.icon
          return (
          <Card key={report.id} className="group hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${report.bg}`}
                >
                  <IconComponent className={`h-6 w-6 ${report.color}`} />
                </div>
                <div className="flex gap-1">
                  {report.formats.map((format) => (
                    <Badge key={format} variant="outline" className="text-xs">
                      {format}
                    </Badge>
                  ))}
                </div>
              </div>
              <CardTitle className="text-lg mt-4">{report.title}</CardTitle>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" size="sm">
                  <Download className="h-4 w-4" />
                  Descargar
                </Button>
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Reportes Recientes</CardTitle>
          <CardDescription>
            Últimos reportes generados por el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                name: "Reporte de Pagos - Abril 2025",
                date: "10/04/2025 14:30",
                user: "Administrador",
                format: "PDF",
              },
              {
                name: "Lista de Estudiantes - Primaria",
                date: "08/04/2025 10:15",
                user: "Secretaria",
                format: "Excel",
              },
              {
                name: "Inventario General",
                date: "05/04/2025 16:45",
                user: "Administrador",
                format: "PDF",
              },
              {
                name: "Calificaciones 1er Trimestre - 3ro A",
                date: "01/04/2025 09:00",
                user: "Prof. Rodr��guez",
                format: "PDF",
              },
            ].map((report, idx) => (
              <div
                key={idx}
                className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{report.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {report.date}
                      <span>|</span>
                      {report.user}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Badge variant="outline">{report.format}</Badge>
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
