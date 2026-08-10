# 🎨 Estudio de Comisiones

Aplicación web local sincronizada en tiempo real con tu proyecto **"Estudio de Comisiones"** en Taskade.

## Estructura del proyecto en Taskade

| Campo        | Tipo    | Opciones                                                                |
|--------------|---------|-------------------------------------------------------------------------|
| Prioridad    | Select  | Urgente 🔴, En espera 🟡, Todo en orden 🟢                              |
| Cliente      | Texto   | —                                                                       |
| Etapa        | Select  | Nueva → Sketch → Lineart → Color base → Sombreado → En revisión → Entregado |
| Avance       | Número  | Porcentaje (%)                                                          |
| Fecha límite | Fecha   | —                                                                       |
| Siguiente paso | Texto | —                                                                       |

## Comisiones actuales

| Comisión                     | Sección       | Estado                         |
|------------------------------|---------------|--------------------------------|
| Retrato de mascota - Sofía   | 🎨 Nuevas     | Pendiente                      |
| Iconos para marca - Estudio Nube | 🎨 Nuevas | Pendiente                      |
| Dibujo de Costa Rica         | 🎨 Nuevas     | Pendiente                      |
| Ilustración editorial - Marco | 🖌️ En Proceso | Boceto✓ Lineart✓ Color base✓ Sombreado pendiente |
| Portada de podcast - Alex    | 👀 En Revisión| Pendiente revisión             |

## Instalación y uso

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
# → Abre http://localhost:3000
```

## Estructura de archivos

```
src/
├── main.jsx              # Punto de entrada
├── App.jsx               # Componente raíz
├── config.js             # IDs y configuración de Taskade
├── api/
│   └── taskade.js        # Cliente REST API v1 de Taskade
├── hooks/
│   └── useTasks.js       # Hook principal de datos
├── components/
│   ├── Header.jsx        # Cabecera con botón de sincronización
│   ├── Board.jsx         # Tablero kanban
│   ├── Column.jsx        # Columna del kanban
│   ├── CommissionCard.jsx # Tarjeta de comisión
│   └── TaskDetail.jsx    # Modal de detalle
└── styles/
    └── global.css        # Estilos completos (tema oscuro)
```

## API utilizada

- **Workspace ID**: `ctkglqr5wl8q4iwo`
- **Project ID**: `5frmN91mysJEwV1W`
- **Endpoint base**: `https://www.taskade.com/api/v1`
- **Autenticación**: Bearer token (Personal Access Token)

> ⚠️ La API key está en `src/config.js`. Para producción, muévela a una variable de entorno `.env`.
