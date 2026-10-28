export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

export interface LogEntry {
  date: string;
  time: string;
  source: string;
  level: LogLevel;
  message: string;
}

const LINE = /^\[(\d{4}-\d\d-\d\d)\]\[([\d:.]+)\]\[([^\]]*)\]\[(\w+)\] ?(.*)$/;

const SOURCES: Record<string, string> = { dasharr_core: "Servicios", dasharr_lib: "App", interfaz: "Interfaz" };

/** Interpreta las líneas del archivo de registro. Las que no siguen el formato se unen a la anterior (mensajes de varias líneas). */
export function parseLog(lines: string[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const line of lines) {
    const m = LINE.exec(line);
    if (m) {
      const root = m[3].split("::")[0];
      out.push({ date: m[1], time: m[2].slice(0, 8), source: SOURCES[root] ?? root, level: m[4].toUpperCase() as LogLevel, message: m[5] });
    } else if (out.length && line.trim()) {
      out[out.length - 1].message += `\n${line}`;
    }
  }
  return out;
}
