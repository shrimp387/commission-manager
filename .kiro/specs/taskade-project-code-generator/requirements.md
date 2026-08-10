# Requirements Document

## Introduction

Esta funcionalidad conecta con Taskade a través de su servidor MCP para leer la estructura completa y los datos internos de un proyecto específico dentro de un espacio de trabajo dado. A partir de esos datos, el sistema genera automáticamente todos los archivos de código fuente necesarios en la carpeta local del usuario. El caso de uso inicial apunta al espacio de trabajo `ctkgkq5wl8q4iwo` y el proyecto "Estudio de Comisiones".

## Glossary

- **Generator**: El sistema principal que orquesta la conexión a Taskade, la extracción de datos y la generación de archivos de código fuente.
- **Taskade_MCP_Client**: El componente responsable de establecer y gestionar la conexión con el servidor MCP de Taskade.
- **Project_Reader**: El componente que lee y deserializa la estructura jerárquica y los datos internos de un proyecto de Taskade.
- **Code_Synthesizer**: El componente que transforma los datos del proyecto en archivos de código fuente.
- **File_Writer**: El componente que persiste los archivos de código generados en el sistema de archivos local.
- **Workspace**: Espacio de trabajo de Taskade identificado por un ID único (p. ej. `ctkgkq5wl8q4iwo`).
- **Project**: Proyecto dentro de un Workspace de Taskade (p. ej. "Estudio de Comisiones") que contiene tareas, subtareas, notas y metadatos.
- **Project_Node**: Unidad atómica de datos dentro de un Project (tarea, subtarea, nota, campo personalizado, etc.).
- **Output_Directory**: Directorio local del usuario donde se escriben los archivos generados.
- **Generation_Manifest**: Archivo de metadatos generado que describe los archivos producidos, sus rutas y el estado de la generación.

---

## Requirements

### Requirement 1: Conexión autenticada al servidor MCP de Taskade

**User Story:** Como desarrollador, quiero que el sistema se conecte de forma autenticada al servidor MCP de Taskade, para que pueda acceder de manera segura a los datos de mis proyectos.

#### Acceptance Criteria

1. WHEN el Generator es invocado con credenciales de Taskade válidas, THE Taskade_MCP_Client SHALL establecer una sesión autenticada con el servidor MCP de Taskade.
2. IF las credenciales proporcionadas son inválidas o han expirado, THEN THE Taskade_MCP_Client SHALL terminar la ejecución y retornar un mensaje de error que indique la causa del fallo de autenticación.
3. IF el servidor MCP de Taskade no está disponible tras 3 intentos de reconexión, THEN THE Taskade_MCP_Client SHALL terminar la ejecución y retornar un error de conectividad con el detalle del último intento fallido.
4. THE Taskade_MCP_Client SHALL comunicarse con el servidor MCP exclusivamente a través del protocolo MCP estándar, sin exponer credenciales en logs ni en archivos de salida.

---

### Requirement 2: Localización del espacio de trabajo y el proyecto

**User Story:** Como desarrollador, quiero que el sistema localice un workspace y proyecto específicos por sus identificadores, para que la generación de código opere sobre los datos correctos.

#### Acceptance Criteria

1. WHEN se proporciona un workspace ID, THE Generator SHALL listar los workspaces disponibles y verificar que el workspace con el ID proporcionado existe antes de proceder.
2. IF el workspace ID proporcionado no existe o no es accesible con las credenciales actuales, THEN THE Generator SHALL retornar un error descriptivo indicando que el workspace no fue encontrado.
3. WHEN el workspace es localizado, THE Generator SHALL buscar el proyecto por nombre exacto dentro de ese workspace.
4. IF el nombre del proyecto no coincide exactamente con ningún proyecto del workspace, THEN THE Generator SHALL listar los nombres de proyectos disponibles en el workspace y retornar un error indicando que el proyecto no fue encontrado.
5. WHERE múltiples proyectos tienen el mismo nombre dentro del mismo workspace, THE Generator SHALL solicitar al usuario que especifique el proyecto por su ID único en lugar del nombre.

---

### Requirement 3: Lectura completa de la estructura del proyecto

**User Story:** Como desarrollador, quiero que el sistema lea toda la estructura jerárquica e interna del proyecto, para que el código generado refleje fielmente el modelo de datos del proyecto.

#### Acceptance Criteria

1. WHEN el proyecto es localizado, THE Project_Reader SHALL recuperar todos los Project_Nodes del proyecto incluyendo tareas, subtareas, notas, campos personalizados y metadatos asociados.
2. THE Project_Reader SHALL preservar las relaciones jerárquicas (padre-hijo) entre Project_Nodes tal como están definidas en Taskade.
3. WHEN la lectura del proyecto supera 1000 Project_Nodes, THE Project_Reader SHALL paginar las solicitudes al servidor MCP para recuperar todos los nodos sin omitir ninguno.
4. IF la lectura de algún Project_Node falla durante la extracción, THEN THE Project_Reader SHALL registrar el nodo fallido con su ID y continuar con la extracción del resto del proyecto, reportando al final la lista de nodos no recuperados.
5. THE Project_Reader SHALL deserializar los datos recibidos del servidor MCP en una representación interna estructurada que el Code_Synthesizer pueda consumir.
6. FOR ALL proyectos leídos, THE Project_Reader SHALL retornar una representación que al serializarse y deserializarse de nuevo produzca un objeto equivalente al original (propiedad round-trip de la representación interna).

---

### Requirement 4: Generación de archivos de código fuente

**User Story:** Como desarrollador, quiero que el sistema genere automáticamente todos los archivos de código fuente correspondientes a la estructura del proyecto, para no tener que crearlos manualmente.

#### Acceptance Criteria

1. WHEN la lectura del proyecto es exitosa, THE Code_Synthesizer SHALL generar al menos un archivo de código fuente por cada tipo de entidad distinto encontrado en el proyecto.
2. THE Code_Synthesizer SHALL inferir el lenguaje de programación de destino a partir del contenido y las convenciones de nomenclatura de los Project_Nodes; si no puede inferirlo, THE Code_Synthesizer SHALL usar Python como lenguaje predeterminado.
3. WHEN un Project_Node contiene bloques de código explícitos, THE Code_Synthesizer SHALL extraer esos bloques e incorporarlos literalmente en el archivo de código correspondiente sin modificar su contenido.
4. THE Code_Synthesizer SHALL generar nombres de archivo válidos para el sistema operativo destino derivados de los nombres de los Project_Nodes, reemplazando caracteres no permitidos por guiones bajos.
5. IF dos o más Project_Nodes producirían el mismo nombre de archivo, THEN THE Code_Synthesizer SHALL añadir un sufijo numérico incremental para garantizar unicidad (p. ej. `archivo_1.py`, `archivo_2.py`).
6. THE Code_Synthesizer SHALL generar un archivo `README.md` en el Output_Directory que describa el proyecto, su estructura y los archivos generados.

---

### Requirement 5: Escritura de archivos en el sistema de archivos local

**User Story:** Como desarrollador, quiero que los archivos generados se escriban correctamente en mi carpeta local, para que pueda utilizarlos de inmediato en mi entorno de desarrollo.

#### Acceptance Criteria

1. WHEN la generación de código es exitosa, THE File_Writer SHALL escribir cada archivo generado en el Output_Directory especificado por el usuario, preservando la estructura de subdirectorios derivada de la jerarquía del proyecto.
2. IF el Output_Directory no existe, THEN THE File_Writer SHALL crearlo junto con todos los subdirectorios necesarios antes de escribir los archivos.
3. IF un archivo a escribir ya existe en el Output_Directory, THEN THE File_Writer SHALL crear una copia de seguridad del archivo existente con extensión `.bak` antes de sobreescribirlo.
4. WHEN todos los archivos han sido escritos, THE File_Writer SHALL generar un Generation_Manifest en el Output_Directory con la lista de archivos creados, sus rutas relativas, tamaños en bytes y la marca de tiempo de generación.
5. IF la escritura de algún archivo falla por permisos u otro error de sistema de archivos, THEN THE File_Writer SHALL registrar el error con la ruta del archivo afectado y continuar escribiendo el resto de los archivos.

---

### Requirement 6: Reporte de resultado al usuario

**User Story:** Como desarrollador, quiero recibir un resumen claro del proceso de generación al finalizar, para saber qué archivos fueron creados y si hubo algún problema.

#### Acceptance Criteria

1. WHEN el proceso de generación finaliza sin errores, THE Generator SHALL imprimir en la salida estándar un resumen que incluya: número total de archivos generados, ruta del Output_Directory y ruta del Generation_Manifest.
2. WHEN el proceso de generación finaliza con errores no fatales, THE Generator SHALL imprimir en la salida estándar el resumen de archivos generados exitosamente y en la salida de error la lista de errores encontrados con sus causas.
3. IF el proceso de generación falla de forma fatal (error de autenticación, proyecto no encontrado, etc.), THEN THE Generator SHALL imprimir exclusivamente en la salida de error un mensaje que describa la causa del fallo con suficiente detalle para que el usuario pueda corregirlo.
4. THE Generator SHALL retornar un código de salida 0 cuando todos los archivos son generados sin errores, código 1 cuando hay errores no fatales, y código 2 cuando el proceso falla de forma fatal.
